"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import mapboxgl from "mapbox-gl";
import { Incident } from "@/lib/types";
import { getYouTubeEmbedUrl, isDirectVideoUrl } from "@/lib/videoUtils";
import SatelliteViewer from "./SatelliteViewer";

interface IncidentCardProps {
  incident: Incident;
  map: mapboxgl.Map;
  onClose: () => void;
}

function getVideoStrategy(incident: Incident): {
  type: "youtube" | "direct" | "link" | "none";
  url: string;
} {
  const ytUrl = getYouTubeEmbedUrl(incident.video_url);
  if (ytUrl) return { type: "youtube", url: ytUrl };
  if (isDirectVideoUrl(incident.video_url)) return { type: "direct", url: incident.video_url };
  if (incident.video_url) return { type: "link", url: incident.video_url };
  return { type: "none", url: "" };
}

const SEVERITY_COLORS: Record<string, { color: string; bg: string; border: string }> = {
  minor: { color: "#22c55e", bg: "#22c55e20", border: "#22c55e30" },
  moderate: { color: "#eab308", bg: "#eab30820", border: "#eab30830" },
  severe: { color: "#f97316", bg: "#f9731620", border: "#f9731630" },
  catastrophic: { color: "#ef4444", bg: "#ef444420", border: "#ef444430" },
};

// --- Component ---

const CARD_WIDTH = 360;
const CARD_OFFSET = 24; // px from marker

function useIsMobile() {
  const [mobile, setMobile] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth < 768 : false
  );
  useEffect(() => {
    const check = () => setMobile(window.innerWidth < 768);
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  return mobile;
}

export default function IncidentCard({ incident, map, onClose }: IncidentCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const initialZoom = useRef(map.getZoom());
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const isMobile = useIsMobile();
  const posRef = useRef({ x: 0, y: 0 });
  const flipLeftRef = useRef(false);
  const rafId = useRef(0);

  // Video state
  const video = getVideoStrategy(incident);
  const [expanded, setExpanded] = useState(false);
  const [mediaIndex, setMediaIndex] = useState(0);

  // Reset state when incident changes
  useEffect(() => {
    setExpanded(false);
    setMediaIndex(0);
    initialZoom.current = map.getZoom();
  }, [incident.id, map]);

  // Position update — direct DOM manipulation, no React state
  const updatePositionDOM = useCallback(() => {
    if (!incident.lat || !incident.lng || !cardRef.current) return;
    const point = map.project([incident.lng, incident.lat]);
    const container = map.getContainer();
    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;

    const wouldOverflowRight = point.x + CARD_OFFSET + CARD_WIDTH > containerWidth - 20;
    flipLeftRef.current = wouldOverflowRight;
    posRef.current = { x: point.x, y: point.y };

    const cardHeight = cardRef.current.offsetHeight || 300;
    let top = point.y - cardHeight / 2;
    top = Math.max(60, Math.min(top, containerHeight - cardHeight - 20));
    const left = wouldOverflowRight ? point.x - CARD_OFFSET - CARD_WIDTH : point.x + CARD_OFFSET;

    cardRef.current.style.left = `${left}px`;
    cardRef.current.style.top = `${top}px`;
  }, [map, incident.lng, incident.lat]);

  // Track map movement with RAF — no React re-renders during pan/zoom
  useEffect(() => {
    updatePositionDOM();

    const onMove = () => {
      cancelAnimationFrame(rafId.current);
      rafId.current = requestAnimationFrame(updatePositionDOM);
    };
    const onZoom = () => {
      if (map.getZoom() < initialZoom.current - 1.5) {
        onCloseRef.current();
      }
    };

    map.on("move", onMove);
    map.on("zoom", onZoom);
    return () => {
      cancelAnimationFrame(rafId.current);
      map.off("move", onMove);
      map.off("zoom", onZoom);
    };
  }, [map, updatePositionDOM]);

  const description = incident.details || incident.description;
  const isLong = description.length > 200;
  const displayText = expanded || !isLong ? description : description.slice(0, 200) + "...";

  const sevColors = SEVERITY_COLORS[incident.damage_severity || "minor"] || SEVERITY_COLORS.minor;

  // Collect media: prefer media array, fallback to video_url — only videos (skip standalone images to avoid clutter)
  const allMedia =
    incident.media && incident.media.length > 0
      ? incident.media
      : video.type !== "none"
        ? [
            {
              type: "video" as const,
              url: video.type === "youtube" ? video.url : incident.video_url,
            },
          ]
        : [];

  const currentMedia = allMedia[mediaIndex] || null;

  // Shared card body (media + details)
  const cardBody = (
    <>
      {/* === SINGLE MEDIA ITEM ON TOP === */}
      {currentMedia && (
        <div className="border-b border-[#2a2a2a] bg-black relative overflow-hidden">
          {currentMedia.type === "video" ? (
            (() => {
              const ytUrl = getYouTubeEmbedUrl(currentMedia.url);
              if (ytUrl) {
                return (
                  <div className="aspect-video">
                    <iframe
                      src={ytUrl}
                      className="w-full h-full"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      title="Incident video"
                    />
                  </div>
                );
              }
              if (isDirectVideoUrl(currentMedia.url)) {
                return (
                  <video
                    key={currentMedia.url}
                    src={currentMedia.url}
                    controls
                    playsInline
                    preload="metadata"
                    className="w-full max-h-[200px] object-contain"
                  />
                );
              }
              return (
                <div className="px-4 py-3">
                  <a
                    href={currentMedia.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-sm text-red-400 hover:text-red-300 underline underline-offset-2"
                  >
                    Watch video ↗
                  </a>
                </div>
              );
            })()
          ) : (
            <img
              key={currentMedia.url}
              src={currentMedia.url}
              alt={incident.location || "Incident"}
              className="w-full max-h-[200px] object-cover"
              loading="lazy"
            />
          )}

          {/* Carousel arrows — only if multiple media */}
          {allMedia.length > 1 && (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setMediaIndex((i) => (i - 1 + allMedia.length) % allMedia.length);
                }}
                className="absolute left-1.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/60 flex items-center justify-center text-white hover:bg-black/80 transition-colors"
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
                  <path d="M7 1L2 5l5 4V1z" />
                </svg>
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setMediaIndex((i) => (i + 1) % allMedia.length);
                }}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/60 flex items-center justify-center text-white hover:bg-black/80 transition-colors"
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
                  <path d="M3 1l5 4-5 4V1z" />
                </svg>
              </button>
              {/* Dots indicator */}
              <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 flex gap-1">
                {allMedia.map((_, i) => (
                  <span
                    key={i}
                    className={`w-1.5 h-1.5 rounded-full transition-colors ${i === mediaIndex ? "bg-white" : "bg-white/30"}`}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* === DETAILS === */}
      <div className="overflow-y-auto overflow-x-hidden px-4 py-3 space-y-3 flex-1">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-red-400 text-[10px] font-bold uppercase tracking-wider">
              {incident.weapon || "Strike"}
            </span>
            {incident.source !== "sheet" && (
              <span
                className={`text-[9px] font-bold uppercase px-1 py-0.5 rounded ${
                  incident.source === "telegram"
                    ? "bg-blue-500/20 text-blue-400"
                    : "bg-orange-500/20 text-orange-400"
                }`}
              >
                {incident.source}
              </span>
            )}
          </div>
          <h2 className="text-sm font-semibold text-neutral-100 leading-tight">
            {incident.location || "Location unconfirmed"}
          </h2>
          <div className="flex items-center gap-2 mt-0.5 text-[11px] text-neutral-500">
            <span>
              {incident.date}
              {incident.timestamp &&
                (() => {
                  const d = new Date(incident.timestamp);
                  if (!isNaN(d.getTime())) {
                    return ` ${d.getUTCHours().toString().padStart(2, "0")}:${d.getUTCMinutes().toString().padStart(2, "0")} UTC`;
                  }
                  return "";
                })()}
            </span>
            {incident.target_type && (
              <>
                <span className="text-neutral-700">|</span>
                <span>{incident.target_type}</span>
              </>
            )}
          </div>
        </div>

        <div>
          <p className="text-neutral-300 text-xs leading-relaxed whitespace-pre-line">
            {displayText}
          </p>
          {isLong && (
            <button
              onClick={() => setExpanded((p) => !p)}
              className="text-[10px] text-neutral-500 hover:text-neutral-300 mt-1"
            >
              {expanded ? "Show less" : "Show more"}
            </button>
          )}
        </div>

        {incident.damage_assessment &&
          incident.damage_assessment !== "Damage assessment pending" && (
            <div className="bg-[#111] border border-[#2a2a2a] rounded-lg p-3">
              <div className="flex items-center justify-between mb-1.5">
                <span
                  className="text-[9px] font-semibold text-neutral-500 uppercase tracking-wider"
                  style={{ fontFamily: "JetBrains Mono, monospace" }}
                >
                  Damage Assessment
                </span>
                <span
                  className="text-[9px] font-bold uppercase px-1 py-0.5 rounded"
                  style={{
                    color: sevColors.color,
                    background: sevColors.bg,
                    border: `1px solid ${sevColors.border}`,
                  }}
                >
                  {incident.damage_severity || "unknown"}
                </span>
              </div>
              <p className="text-[11px] text-neutral-400 leading-relaxed">
                {incident.damage_assessment}
              </p>
            </div>
          )}

        {((incident.casualties_military || 0) > 0 || (incident.casualties_civilian || 0) > 0) && (
          <div className="flex items-center gap-3 text-[11px]">
            {(incident.casualties_military || 0) > 0 && (
              <div className="flex items-center gap-1">
                <svg
                  className="w-3 h-3 text-red-400"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <circle cx="8" cy="5" r="3" />
                  <path d="M2 14c0-3.3 2.7-6 6-6s6 2.7 6 6" />
                  <path d="M5 2l3-1 3 1" strokeLinecap="round" />
                </svg>
                <span className="text-red-400 font-medium">{incident.casualties_military}</span>
                <span className="text-neutral-600">mil</span>
              </div>
            )}
            {(incident.casualties_civilian || 0) > 0 && (
              <div className="flex items-center gap-1">
                <svg
                  className="w-3 h-3 text-orange-400"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <circle cx="8" cy="5" r="3" />
                  <path d="M2 14c0-3.3 2.7-6 6-6s6 2.7 6 6" />
                </svg>
                <span className="text-orange-400 font-medium">{incident.casualties_civilian}</span>
                <span className="text-neutral-600">civ</span>
              </div>
            )}
          </div>
        )}

        {(incident.lat !== 0 || incident.lng !== 0) && incident.date && (
          <SatelliteViewer
            incidentId={incident.id}
            lat={incident.lat}
            lng={incident.lng}
            date={incident.date}
          />
        )}

        {incident.source_url && (
          <div className="pt-2 border-t border-[#2a2a2a]">
            <a
              href={incident.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-neutral-500 hover:text-neutral-300 underline underline-offset-2"
            >
              View source ↗
            </a>
          </div>
        )}
      </div>
    </>
  );

  const hasCoords = incident.lat !== 0 || incident.lng !== 0;

  // --- Mobile or no coordinates: fullscreen panel ---
  if (isMobile || !hasCoords) {
    return (
      <div className="fixed top-14 bottom-14 md:top-0 md:bottom-0 left-0 right-0 z-50 pointer-events-auto panel-enter w-full max-w-full overflow-hidden">
        <div
          ref={cardRef}
          className="bg-[#1a1a1a] md:border-t md:border-[#2a2a2a] md:rounded-t-2xl shadow-[0_-8px_30px_rgba(0,0,0,0.7)] overflow-hidden h-full md:max-h-[85vh] flex flex-col w-full"
        >
          {/* Header + close */}
          <div className="shrink-0 bg-[#1a1a1a] pt-3 pb-2 px-4 flex items-center justify-between z-10 border-b border-[#2a2a2a]/50">
            <div className="w-10 h-1 bg-neutral-600 rounded-full mx-auto absolute left-1/2 -translate-x-1/2 top-2 md:block hidden" />
            <div />
            <button
              onClick={onClose}
              className="w-9 h-9 flex items-center justify-center bg-black/60 rounded-full text-neutral-400 hover:text-white text-base"
            >
              ✕
            </button>
          </div>
          {cardBody}
        </div>
      </div>
    );
  }

  // --- Desktop: marker-anchored card (position managed by RAF/DOM) ---
  return (
    <div
      ref={cardRef}
      className="absolute z-50 pointer-events-auto"
      style={{
        width: `${CARD_WIDTH}px`,
      }}
    >
      <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl shadow-[0_8px_40px_rgba(0,0,0,0.7)] overflow-hidden max-h-[70vh] flex flex-col">
        <button
          onClick={onClose}
          className="absolute top-2 right-2 z-10 w-6 h-6 flex items-center justify-center bg-black/60 rounded-full text-neutral-400 hover:text-white text-xs transition-colors"
        >
          ✕
        </button>
        {cardBody}
      </div>
    </div>
  );
}
