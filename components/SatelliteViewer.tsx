"use client";

import { useState, useEffect, useRef, useCallback } from "react";

interface SatelliteViewerProps {
  incidentId: string;
  lat: number;
  lng: number;
  date: string; // YYYY-MM-DD
}

interface ImageryData {
  beforeImage: string | null;
  afterImage: string | null;
  beforeDate: string;
  afterDate: string;
  afterDateTo?: string;
  beforeCloudCover?: number;
  afterCloudCover?: number;
  sarChangeMap?: string;
  sarChangePercent?: number;
  maxarAvailable?: boolean;
  maxarGsd?: number;
  superResMethod?: string;
}

interface FIRMSMatch {
  confidence: number;
  frp: number;
  acq_date: string;
  acq_time: string;
  satellite: string;
}

export default function SatelliteViewer({ incidentId, lat, lng, date }: SatelliteViewerProps) {
  const [data, setData] = useState<ImageryData | null>(null);
  const [firmsMatch, setFirmsMatch] = useState<FIRMSMatch | null>(null);
  const [loading, setLoading] = useState(true);
  const [sliderPos, setSliderPos] = useState(50);
  const [showSAR, setShowSAR] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setData(null);
    setFirmsMatch(null);

    // Fetch FIRMS data to check for thermal match
    const firmsPromise = fetch("/api/satellite/firms")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d?.geojson?.features) return;
        // Find closest hotspot within ~15km
        const features = d.geojson.features as Array<{
          properties: Record<string, unknown>;
          geometry: { coordinates: [number, number] };
        }>;
        let closest: { dist: number; props: Record<string, unknown> } | null = null;
        for (const f of features) {
          const [fLng, fLat] = f.geometry.coordinates;
          const dLat = (fLat - lat) * 111;
          const dLng = (fLng - lng) * 111 * Math.cos((lat * Math.PI) / 180);
          const dist = Math.sqrt(dLat * dLat + dLng * dLng);
          if (dist < 15 && (!closest || dist < closest.dist)) {
            closest = { dist, props: f.properties };
          }
        }
        if (closest) {
          setFirmsMatch({
            confidence: closest.props.confidence as number,
            frp: closest.props.frp as number,
            acq_date: closest.props.acq_date as string,
            acq_time: closest.props.acq_time as string,
            satellite: closest.props.satellite as string,
          });
        }
      })
      .catch(() => {});

    // Fetch Sentinel imagery (with SAR change detection)
    const imageryPromise = fetch(
      `/api/satellite/imagery?id=${encodeURIComponent(incidentId)}&lat=${lat}&lng=${lng}&date=${date}&sar=1`
    )
      .then((r) => {
        if (!r.ok) return null;
        return r.json();
      })
      .then((d) => {
        if (cancelled || !d) return;
        if (d.beforeImage || d.afterImage) {
          setData(d);
        }
      })
      .catch(() => {});

    Promise.all([firmsPromise, imageryPromise]).finally(() => {
      if (!cancelled) setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [incidentId, lat, lng, date]);

  const updateSlider = useCallback((clientX: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = clientX - rect.left;
    const pct = Math.max(0, Math.min(100, (x / rect.width) * 100));
    setSliderPos(pct);
  }, []);

  // Use global listeners for reliable drag tracking
  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      dragging.current = true;
      updateSlider(e.clientX);
    },
    [updateSlider]
  );

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!dragging.current) return;
      e.preventDefault();
      updateSlider(e.clientX);
    };
    const onUp = () => {
      dragging.current = false;
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [updateSlider]);

  // Nothing to show at all
  if (!loading && !data && !firmsMatch) return null;

  if (loading) {
    return (
      <div className="bg-[#111] border border-[#2a2a2a] rounded-lg p-3">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 border border-orange-500 border-t-transparent rounded-full animate-spin" />
          <span
            className="text-[9px] font-semibold text-neutral-500 uppercase tracking-wider"
            style={{ fontFamily: "JetBrains Mono, monospace" }}
          >
            Scanning satellite data...
          </span>
        </div>
      </div>
    );
  }

  const hasBoth = data?.beforeImage && data?.afterImage;

  // Check if after image is missing because incident is too recent (< 6 days for Sentinel-2 revisit)
  const isRecent =
    data &&
    !data.afterImage &&
    data.beforeImage &&
    (() => {
      const today = new Date(data.afterDateTo || data.afterDate);
      const incidentDate = new Date(date);
      const daysSinceIncident = (today.getTime() - incidentDate.getTime()) / (1000 * 60 * 60 * 24);
      return daysSinceIncident < 6;
    })();

  return (
    <div className="bg-[#111] border border-[#2a2a2a] rounded-lg overflow-hidden">
      {/* FIRMS thermal match — always show if available */}
      {firmsMatch && (
        <div className="px-3 py-2.5 border-b border-[#2a2a2a]">
          <div className="flex items-center gap-2 mb-1.5">
            <svg className="w-3.5 h-3.5 text-orange-400" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 23c-4.97 0-8-3.03-8-7 0-2.5 1.5-5 3-6.5.5-.5 1.5-.5 1.5.5 0 1.5.5 3 2 4 0-4 2-7 5.5-9.5.5-.5 1.5 0 1.5.5 0 3 1 5.5 2 7.5.5 1 1 2 1 3.5 0 3.97-3.03 7-8.5 7z" />
            </svg>
            <span
              className="text-[9px] font-bold text-orange-400 uppercase tracking-wider"
              style={{ fontFamily: "JetBrains Mono, monospace" }}
            >
              Thermal Anomaly Detected
            </span>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px]">
            <div className="flex justify-between">
              <span className="text-neutral-500">Confidence</span>
              <span className="text-neutral-200 font-medium">{firmsMatch.confidence}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-500">Fire Power</span>
              <span className="text-neutral-200 font-medium">{firmsMatch.frp} MW</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-500">Satellite</span>
              <span className="text-neutral-200 font-medium">{firmsMatch.satellite}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-500">Detected</span>
              <span className="text-neutral-200 font-medium">{firmsMatch.acq_time} UTC</span>
            </div>
          </div>
        </div>
      )}

      {/* Sentinel before/after imagery */}
      {data && (
        <>
          <div className="px-3 py-2 border-b border-[#2a2a2a]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  className="text-[9px] font-semibold text-neutral-500 uppercase tracking-wider"
                  style={{ fontFamily: "JetBrains Mono, monospace" }}
                >
                  Satellite View
                </span>
                {data.maxarAvailable && (
                  <span className="text-[8px] font-bold text-emerald-400 bg-emerald-400/10 px-1.5 py-0.5 rounded uppercase tracking-wider">
                    {data.maxarGsd ? `${data.maxarGsd}m HD` : "HD"}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 text-[9px] text-neutral-600">
                <span>{data.beforeDate}</span>
                <span>vs</span>
                <span className="text-orange-400">{data.afterDate}</span>
              </div>
            </div>
            {/* Cloud cover + SAR metadata row */}
            {(data.beforeCloudCover !== undefined || data.sarChangePercent !== undefined) && (
              <div className="flex items-center gap-3 mt-1.5 text-[9px]">
                {data.beforeCloudCover !== undefined && (
                  <span className="text-neutral-600">
                    Cloud:{" "}
                    <span className="text-neutral-400">{Math.round(data.beforeCloudCover)}%</span> /{" "}
                    <span className="text-neutral-400">
                      {Math.round(data.afterCloudCover ?? 0)}%
                    </span>
                  </span>
                )}
                {data.sarChangePercent !== undefined && (
                  <span className="text-neutral-600">
                    SAR Change:{" "}
                    <span
                      className={
                        data.sarChangePercent > 5 ? "text-red-400 font-medium" : "text-neutral-400"
                      }
                    >
                      {data.sarChangePercent}%
                    </span>
                  </span>
                )}
                {data.sarChangeMap && (
                  <button
                    onClick={() => setShowSAR(!showSAR)}
                    className={`text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded transition-colors ${
                      showSAR
                        ? "bg-red-500/20 text-red-400"
                        : "bg-neutral-800 text-neutral-500 hover:text-neutral-300"
                    }`}
                  >
                    {showSAR ? "SAR On" : "SAR Off"}
                  </button>
                )}
              </div>
            )}
          </div>

          {hasBoth ? (
            /* ── Before/After comparison slider ── */
            <div
              ref={containerRef}
              className="relative aspect-square select-none"
              style={{ touchAction: "none", cursor: "col-resize" }}
              onPointerDown={onPointerDown}
            >
              {/* After image — full background layer */}
              <img
                src={data.afterImage!}
                alt="After"
                className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                draggable={false}
              />
              {/* SAR change overlay on after image */}
              {showSAR && data.sarChangeMap && (
                <img
                  src={data.sarChangeMap}
                  alt="SAR Change"
                  className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                  draggable={false}
                />
              )}
              {/* Before image — clipped from right using clip-path */}
              <div
                className="absolute inset-0 pointer-events-none"
                style={{ clipPath: `inset(0 ${100 - sliderPos}% 0 0)` }}
              >
                <img
                  src={data.beforeImage!}
                  alt="Before"
                  className="absolute inset-0 w-full h-full object-cover"
                  draggable={false}
                />
              </div>
              {/* Slider line + handle */}
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-white shadow-[0_0_6px_rgba(255,255,255,0.5)] pointer-events-none"
                style={{ left: `${sliderPos}%`, transform: "translateX(-50%)" }}
              >
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-white/90 shadow-lg flex items-center justify-center">
                  <svg
                    className="w-3 h-3 text-neutral-800"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                  >
                    <path d="M8 6l-4 6 4 6" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M16 6l4 6-4 6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              </div>
              {/* Labels */}
              <div className="absolute top-2 left-2 text-[9px] font-bold text-white bg-black/60 px-1.5 py-0.5 rounded uppercase tracking-wider pointer-events-none">
                Before
              </div>
              <div className="absolute top-2 right-2 text-[9px] font-bold text-orange-400 bg-black/60 px-1.5 py-0.5 rounded uppercase tracking-wider pointer-events-none">
                After
              </div>
              {/* Drag hint */}
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[8px] text-white/50 bg-black/40 px-2 py-0.5 rounded pointer-events-none">
                drag to compare
              </div>
            </div>
          ) : (
            /* ── Single image fallback with clear labeling ── */
            <div className="relative">
              {data.afterImage && (
                <div className="relative">
                  <img
                    src={data.afterImage}
                    alt="After strike"
                    className="w-full aspect-square object-cover"
                  />
                  <div className="absolute top-2 left-2 text-[9px] font-bold text-orange-400 bg-black/60 px-1.5 py-0.5 rounded uppercase tracking-wider">
                    After — {data.afterDate}
                  </div>
                  {showSAR && data.sarChangeMap && (
                    <img
                      src={data.sarChangeMap}
                      alt="SAR Change"
                      className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                    />
                  )}
                </div>
              )}
              {data.beforeImage && (
                <div className="relative">
                  <img
                    src={data.beforeImage}
                    alt="Before strike"
                    className="w-full aspect-square object-cover"
                  />
                  <div className="absolute top-2 left-2 text-[9px] font-bold text-white bg-black/60 px-1.5 py-0.5 rounded uppercase tracking-wider">
                    Before — {data.beforeDate}
                  </div>
                </div>
              )}
              {!data.beforeImage && data.afterImage && (
                <div
                  className="px-3 py-1.5 text-[9px] text-neutral-600 border-t border-[#2a2a2a]"
                  style={{ fontFamily: "JetBrains Mono, monospace" }}
                >
                  Pre-strike image unavailable (cloud cover)
                </div>
              )}
              {data.beforeImage && !data.afterImage && (
                <div
                  className="px-3 py-1.5 text-[9px] text-neutral-600 border-t border-[#2a2a2a]"
                  style={{ fontFamily: "JetBrains Mono, monospace" }}
                >
                  {isRecent
                    ? "Post-strike image pending — satellite revisit in progress (~5 day cycle)"
                    : "Post-strike image unavailable (cloud cover)"}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
