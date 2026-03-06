"use client";

import { useState, useEffect, useRef } from "react";
import { Incident } from "@/lib/types";
import { parseTelegramPostId, getTelegramEmbedUrl } from "@/lib/telegramUtils";

interface IncidentPanelProps {
  incident: Incident;
  onClose: () => void;
}

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

/** Determine the video rendering strategy for an incident */
function getVideoStrategy(incident: Incident): {
  type: "youtube" | "direct" | "telegram_embed" | "link" | "none";
  url: string;
} {
  // 1. YouTube embed (from video_url)
  const ytUrl = getYouTubeEmbedUrl(incident.video_url);
  if (ytUrl) return { type: "youtube", url: ytUrl };

  // 2. Direct video (from video_url — mp4/webm/telegram CDN)
  if (isDirectVideoUrl(incident.video_url)) {
    return { type: "direct", url: incident.video_url };
  }

  // 3. Telegram embed (from telegram_post_id or parsed source_url)
  const telegramPostId =
    incident.telegram_post_id || parseTelegramPostId(incident.source_url);
  if (telegramPostId) {
    return { type: "telegram_embed", url: getTelegramEmbedUrl(telegramPostId) };
  }

  // 4. Fallback link (video_url exists but not embeddable)
  if (incident.video_url) {
    return { type: "link", url: incident.video_url };
  }

  return { type: "none", url: "" };
}

const SEVERITY_COLORS: Record<string, { color: string; bg: string; border: string }> = {
  minor:        { color: "#22c55e", bg: "#22c55e20", border: "#22c55e30" },
  moderate:     { color: "#eab308", bg: "#eab30820", border: "#eab30830" },
  severe:       { color: "#f97316", bg: "#f9731620", border: "#f9731630" },
  catastrophic: { color: "#ef4444", bg: "#ef444420", border: "#ef444430" },
};

function DamageSeverityBadge({ severity }: { severity?: string }) {
  const c = SEVERITY_COLORS[severity || "minor"] || SEVERITY_COLORS.minor;
  return (
    <span
      className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded"
      style={{ color: c.color, background: c.bg, border: `1px solid ${c.border}` }}
    >
      {severity || "unknown"}
    </span>
  );
}

export default function IncidentPanel({
  incident,
  onClose,
}: IncidentPanelProps) {
  const video = getVideoStrategy(incident);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [iframeError, setIframeError] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const hasVideo = video.type !== "none";

  // Reset iframe state when incident changes
  useEffect(() => {
    setIframeLoaded(false);
    setIframeError(false);
  }, [incident.id]);

  // Listen for Telegram embed postMessage resize events
  useEffect(() => {
    if (video.type !== "telegram_embed") return;

    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== "https://t.me") return;
      if (!event.data || typeof event.data !== "string") return;

      try {
        const data = JSON.parse(event.data);
        if (data.event === "resize" && data.height && iframeRef.current) {
          iframeRef.current.style.height = `${data.height}px`;
        }
      } catch {
        // Not a JSON message from Telegram, ignore
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [video.type]);

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 panel-enter pointer-events-none">
      {/* Panel */}
      <div className="relative bg-[#1a1a1a] border-t border-[#2a2a2a] rounded-t-2xl max-h-[75vh] overflow-y-auto pointer-events-auto shadow-[0_-8px_30px_rgba(0,0,0,0.5)]">
        {/* Handle bar */}
        <div className="sticky top-0 bg-[#1a1a1a] pt-3 pb-2 px-6 flex items-center justify-between border-b border-[#2a2a2a]/50 rounded-t-2xl z-10">
          <div className="w-10 h-1 bg-[#333] rounded-full mx-auto absolute left-1/2 -translate-x-1/2 top-2" />
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <span className="text-red-400 text-xs font-semibold uppercase tracking-wider">
              {incident.weapon || "Strike"}
            </span>
            {incident.source !== "sheet" && (
              <span
                className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${
                  incident.source === "telegram"
                    ? "bg-blue-500/20 text-blue-400"
                    : "bg-orange-500/20 text-orange-400"
                }`}
              >
                {incident.source}
              </span>
            )}
            {hasVideo && (
              <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400">
                VIDEO
              </span>
            )}
            {incident.confidence && (
              <span
                className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${
                  incident.confidence === "verified"
                    ? "bg-green-500/20 text-green-400"
                    : incident.confidence === "confirmed"
                      ? "bg-yellow-500/20 text-yellow-400"
                      : "bg-neutral-500/20 text-neutral-400"
                }`}
              >
                {incident.confidence}
              </span>
            )}
            {incident.firmsBacked && (
              <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-orange-500/15 text-orange-400/80" title="Corroborated by FIRMS thermal hotspot">
                FIRMS
              </span>
            )}
            {incident.seismicBacked && (
              <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-yellow-500/15 text-yellow-400/80" title="Corroborated by seismic activity">
                SEISMIC
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-red-400/70 hover:text-red-400 mt-2 text-lg transition-colors"
          >
            ✕
          </button>
        </div>

        <div className="px-6 py-4 space-y-4">
          {/* Header info */}
          <div>
            <h2 className="text-lg font-semibold text-neutral-100">
              {incident.location || "Location unconfirmed"}
            </h2>
            <div className="flex items-center gap-3 mt-1 text-sm text-neutral-400">
              <span>{incident.date}</span>
              {incident.target_type && (
                <>
                  <span className="text-neutral-600">|</span>
                  <span>{incident.target_type}</span>
                </>
              )}
            </div>
          </div>

          {/* Description */}
          <p className="text-neutral-300 text-sm leading-relaxed whitespace-pre-line">
            {incident.details || incident.description}
          </p>

          {/* Damage Assessment */}
          {incident.damage_assessment && incident.damage_assessment !== "Damage assessment pending" && (
            <div className="bg-[#111] border border-[#2a2a2a] rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <h3
                  className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider"
                  style={{ fontFamily: "JetBrains Mono, monospace" }}
                >
                  Damage Assessment
                </h3>
                <DamageSeverityBadge severity={incident.damage_severity} />
              </div>
              <p className="text-sm text-neutral-300 leading-relaxed">
                {incident.damage_assessment}
              </p>
            </div>
          )}

          {/* Verification evidence */}
          {incident.verification && (incident.verification.firms || incident.verification.seismic) && (
            <div className="bg-[#111] border border-[#2a2a2a] rounded-lg p-4">
              <h3
                className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-2"
                style={{ fontFamily: "JetBrains Mono, monospace" }}
              >
                Sensor Verification
              </h3>
              <div className="space-y-1.5 text-xs">
                {incident.verification.firms && (
                  <div className="flex items-center gap-2 text-orange-400/80">
                    <span className="text-neutral-500">FIRMS:</span>
                    <span className="font-mono">{incident.verification.firms.hotspotCount}</span>
                    <span className="text-neutral-600">hotspots</span>
                    <span className="text-neutral-700">|</span>
                    <span className="font-mono">{incident.verification.firms.maxFRP.toFixed(0)}</span>
                    <span className="text-neutral-600">MW peak</span>
                    <span className="text-neutral-700">|</span>
                    <span className="font-mono">{incident.verification.firms.maxConfidence}%</span>
                    <span className="text-neutral-600">conf</span>
                  </div>
                )}
                {incident.verification.seismic && (
                  <div className="flex items-center gap-2 text-yellow-400/80">
                    <span className="text-neutral-500">Seismic:</span>
                    <span className="font-mono">M{incident.verification.seismic.magnitude.toFixed(1)}</span>
                    <span className="text-neutral-600">at {incident.verification.seismic.distanceKm.toFixed(0)}km</span>
                    <span className="text-neutral-700">|</span>
                    <span className="font-mono">{incident.verification.seismic.depth.toFixed(0)}km</span>
                    <span className="text-neutral-600">deep</span>
                    <span className="text-neutral-700">|</span>
                    <span className="font-mono">{incident.verification.seismic.timeDeltaMin.toFixed(0)}min</span>
                    <span className="text-neutral-600">delta</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Casualties */}
          {((incident.casualties_military || 0) > 0 || (incident.casualties_civilian || 0) > 0) && (
            <div className="bg-[#111] border border-[#2a2a2a] rounded-lg p-4">
              <h3
                className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-2"
                style={{ fontFamily: "JetBrains Mono, monospace" }}
              >
                Casualties
              </h3>
              <div className="flex items-center gap-4 text-sm">
                {(incident.casualties_military || 0) > 0 && (
                  <div className="flex items-center gap-1.5">
                    <svg className="w-4 h-4 text-red-400" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <circle cx="8" cy="5" r="3" />
                      <path d="M2 14c0-3.3 2.7-6 6-6s6 2.7 6 6" />
                      <path d="M5 2l3-1 3 1" strokeLinecap="round" />
                    </svg>
                    <span className="text-red-400 font-medium">{incident.casualties_military}</span>
                    <span className="text-neutral-500">military</span>
                  </div>
                )}
                {(incident.casualties_civilian || 0) > 0 && (
                  <div className="flex items-center gap-1.5">
                    <svg className="w-4 h-4 text-orange-400" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <circle cx="8" cy="5" r="3" />
                      <path d="M2 14c0-3.3 2.7-6 6-6s6 2.7 6 6" />
                    </svg>
                    <span className="text-orange-400 font-medium">{incident.casualties_civilian}</span>
                    <span className="text-neutral-500">civilian</span>
                  </div>
                )}
              </div>
              {incident.casualties_description && incident.casualties_description !== "No casualties reported" && (
                <p className="text-xs text-neutral-400 mt-2 leading-relaxed">
                  {incident.casualties_description}
                </p>
              )}
            </div>
          )}

          {/* === VIDEO SECTION === */}

          {/* Direct video (Telegram CDN, mp4, etc.) */}
          {video.type === "direct" && (
            <div className="rounded-lg overflow-hidden border border-[#2a2a2a] bg-black">
              <video
                src={video.url}
                controls
                playsInline
                preload="metadata"
                className="w-full max-h-[40vh] object-contain"
              >
                Your browser does not support video playback.
              </video>
            </div>
          )}

          {/* YouTube embed */}
          {video.type === "youtube" && (
            <div className="aspect-video rounded-lg overflow-hidden border border-[#2a2a2a]">
              <iframe
                src={video.url}
                className="w-full h-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                title="Incident video"
              />
            </div>
          )}

          {/* Telegram post embed */}
          {video.type === "telegram_embed" && !iframeError && (
            <div className="telegram-embed-container rounded-lg overflow-hidden border border-[#2a2a2a]">
              {/* Loading skeleton */}
              {!iframeLoaded && (
                <div className="flex items-center justify-center h-48 bg-[#0e0e0e]">
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                    <span className="text-neutral-500 text-xs">
                      Loading Telegram post...
                    </span>
                  </div>
                </div>
              )}
              <iframe
                ref={iframeRef}
                src={video.url}
                className={`telegram-embed-iframe w-full border-0 ${
                  iframeLoaded ? "" : "h-0 overflow-hidden"
                }`}
                style={iframeLoaded ? { minHeight: "320px" } : {}}
                onLoad={() => setIframeLoaded(true)}
                onError={() => setIframeError(true)}
                sandbox="allow-scripts allow-same-origin allow-popups"
                title="Telegram post"
              />
            </div>
          )}

          {/* Telegram embed error fallback */}
          {video.type === "telegram_embed" && iframeError && (
            <a
              href={incident.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 underline underline-offset-2"
            >
              View on Telegram ↗
            </a>
          )}

          {/* Fallback video link for unsupported formats */}
          {video.type === "link" && (
            <a
              href={video.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm text-red-400 hover:text-red-300 underline underline-offset-2"
            >
              Watch video ↗
            </a>
          )}

          {/* Source link */}
          {incident.source_url && (
            <div className="pt-2 border-t border-[#2a2a2a]">
              <a
                href={incident.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-neutral-500 hover:text-neutral-300 underline underline-offset-2"
              >
                View source ↗
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
