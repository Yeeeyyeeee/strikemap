"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import mapboxgl from "mapbox-gl";
import { Incident } from "@/lib/types";

interface IncidentCardProps {
  incident: Incident;
  map: mapboxgl.Map;
  onClose: () => void;
}

// --- Video helpers (reused from IncidentPanel) ---

function getYouTubeEmbedUrl(url: string): string | null {
  if (!url) return null;
  const match = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([\w-]+)/
  );
  return match ? `https://www.youtube.com/embed/${match[1]}` : null;
}

function isDirectVideoUrl(url: string): boolean {
  if (!url) return false;
  return (
    url.includes("telesco.pe") ||
    url.includes("telegram") ||
    url.includes("cdn") ||
    /\.(mp4|webm|mov)(\?|$)/i.test(url)
  );
}

function getVideoStrategy(incident: Incident): {
  type: "youtube" | "direct" | "link" | "none";
  url: string;
} {
  const ytUrl = getYouTubeEmbedUrl(incident.video_url);
  if (ytUrl) return { type: "youtube", url: ytUrl };
  if (isDirectVideoUrl(incident.video_url))
    return { type: "direct", url: incident.video_url };
  if (incident.video_url) return { type: "link", url: incident.video_url };
  return { type: "none", url: "" };
}

const SEVERITY_COLORS: Record<string, { color: string; bg: string; border: string }> = {
  minor:        { color: "#22c55e", bg: "#22c55e20", border: "#22c55e30" },
  moderate:     { color: "#eab308", bg: "#eab30820", border: "#eab30830" },
  severe:       { color: "#f97316", bg: "#f9731620", border: "#f9731630" },
  catastrophic: { color: "#ef4444", bg: "#ef444420", border: "#ef444430" },
};

// --- Component ---

const CARD_WIDTH = 360;
const CARD_OFFSET = 24; // px from marker

function useIsMobile() {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const check = () => setMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  return mobile;
}

export default function IncidentCard({ incident, map, onClose }: IncidentCardProps) {
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [flipLeft, setFlipLeft] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const initialZoom = useRef(map.getZoom());
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const isMobile = useIsMobile();

  // Video state
  const video = getVideoStrategy(incident);
  const [expanded, setExpanded] = useState(false);

  // Reset state when incident changes
  useEffect(() => {
    setExpanded(false);
    initialZoom.current = map.getZoom();
  }, [incident.id, map]);

  // Position update function
  const updatePosition = useCallback(() => {
    if (!incident.lat || !incident.lng) return;
    const point = map.project([incident.lng, incident.lat]);
    const container = map.getContainer();
    const containerWidth = container.clientWidth;

    // Flip to left side if card would overflow right edge
    const wouldOverflowRight = point.x + CARD_OFFSET + CARD_WIDTH > containerWidth - 20;
    setFlipLeft(wouldOverflowRight);
    setPos({ x: point.x, y: point.y });
  }, [map, incident.lng, incident.lat]);

  // Track map movement + zoom dismiss
  useEffect(() => {
    updatePosition();

    const onMove = () => updatePosition();
    const onZoom = () => {
      if (map.getZoom() < initialZoom.current - 1.5) {
        onCloseRef.current();
      }
    };

    map.on("move", onMove);
    map.on("zoom", onZoom);
    return () => {
      map.off("move", onMove);
      map.off("zoom", onZoom);
    };
  }, [map, updatePosition]);

  const description = incident.details || incident.description;
  const isLong = description.length > 200;
  const displayText = expanded || !isLong ? description : description.slice(0, 200) + "...";

  const cardHeight = cardRef.current?.offsetHeight || 300;
  const container = map.getContainer();
  const containerHeight = container.clientHeight;

  // Clamp vertical position so card stays in viewport
  let top = pos.y - cardHeight / 2;
  top = Math.max(60, Math.min(top, containerHeight - cardHeight - 20));

  const left = flipLeft
    ? pos.x - CARD_OFFSET - CARD_WIDTH
    : pos.x + CARD_OFFSET;

  const sevColors = SEVERITY_COLORS[incident.damage_severity || "minor"] || SEVERITY_COLORS.minor;

  // Collect all media: from media array, then fallback to video_url
  const mediaItems = incident.media && incident.media.length > 0
    ? incident.media
    : video.type !== "none"
      ? [{ type: video.type === "youtube" ? "video" as const : "video" as const, url: video.type === "youtube" ? video.url : incident.video_url }]
      : [];

  // Shared card body (media + details)
  const cardBody = (
    <>
      {/* === MEDIA ON TOP === */}
      {mediaItems.length > 0 && (
        <div className="border-b border-[#2a2a2a] bg-black">
          {mediaItems.map((item, idx) => {
            if (item.type === "video") {
              const ytUrl = getYouTubeEmbedUrl(item.url);
              if (ytUrl) {
                return (
                  <div key={idx} className="aspect-video">
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
              if (isDirectVideoUrl(item.url)) {
                return (
                  <video
                    key={idx}
                    src={item.url}
                    controls
                    playsInline
                    preload="metadata"
                    className="w-full max-h-[200px] object-contain"
                  />
                );
              }
              return (
                <div key={idx} className="px-4 py-3">
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-sm text-red-400 hover:text-red-300 underline underline-offset-2"
                  >
                    Watch video ↗
                  </a>
                </div>
              );
            }
            // Image
            return (
              <img
                key={idx}
                src={item.url}
                alt={incident.location || "Incident"}
                className="w-full max-h-[220px] object-cover"
                loading="lazy"
              />
            );
          })}
        </div>
      )}

      {/* === DETAILS === */}
      <div className="overflow-y-auto px-4 py-3 space-y-3 flex-1">
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
            <span>{incident.date}</span>
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

        {incident.damage_assessment && incident.damage_assessment !== "Damage assessment pending" && (
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
                style={{ color: sevColors.color, background: sevColors.bg, border: `1px solid ${sevColors.border}` }}
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
                <svg className="w-3 h-3 text-red-400" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
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
                <svg className="w-3 h-3 text-orange-400" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <circle cx="8" cy="5" r="3" />
                  <path d="M2 14c0-3.3 2.7-6 6-6s6 2.7 6 6" />
                </svg>
                <span className="text-orange-400 font-medium">{incident.casualties_civilian}</span>
                <span className="text-neutral-600">civ</span>
              </div>
            )}
          </div>
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

  // --- Mobile: bottom sheet ---
  if (isMobile) {
    return (
      <div className="fixed bottom-0 left-0 right-0 z-50 pointer-events-auto panel-enter">
        <div
          ref={cardRef}
          className="bg-[#1a1a1a] border-t border-[#2a2a2a] rounded-t-2xl shadow-[0_-8px_30px_rgba(0,0,0,0.7)] overflow-hidden max-h-[60vh] flex flex-col"
        >
          {/* Drag handle + close */}
          <div className="sticky top-0 bg-[#1a1a1a] pt-3 pb-2 px-4 flex items-center justify-between z-10 rounded-t-2xl border-b border-[#2a2a2a]/50">
            <div className="w-10 h-1 bg-neutral-600 rounded-full mx-auto absolute left-1/2 -translate-x-1/2 top-2" />
            <div />
            <button
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center bg-black/60 rounded-full text-neutral-400 hover:text-white text-sm"
            >
              ✕
            </button>
          </div>
          {cardBody}
        </div>
      </div>
    );
  }

  // --- Desktop: marker-anchored card ---
  return (
    <div
      ref={cardRef}
      className="absolute z-50 pointer-events-auto"
      style={{
        left: `${left}px`,
        top: `${top}px`,
        width: `${CARD_WIDTH}px`,
      }}
    >
      {/* Connector line to marker */}
      <div
        className="absolute top-1/2 w-4 border-t border-dashed border-neutral-600"
        style={
          flipLeft
            ? { right: -16, transform: "translateY(-50%)" }
            : { left: -16, transform: "translateY(-50%)" }
        }
      />
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
