"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { Incident } from "@/lib/types";
import { getTelegramEmbedUrl } from "@/lib/telegram";

interface HeatmapArea {
  lat: number;
  lng: number;
  name: string;
}

interface MediaFeedPanelProps {
  area: HeatmapArea;
  onClose: () => void;
}

function MediaCard({ incident }: { incident: Incident }) {
  const videoRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);

  // IntersectionObserver for iframe lazy loading
  const [visible, setVisible] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true); },
      { threshold: 0.1 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const hasVideo = Boolean(incident.video_url || incident.telegram_post_id);
  const images = incident.media?.filter((m) => m.type === "image") || [];
  const hasMedia = hasVideo || images.length > 0;

  return (
    <div ref={cardRef} className="border border-[#2a2a2a] rounded-lg overflow-hidden bg-[#111]">
      {/* Video embed */}
      {hasVideo && visible && (
        <div ref={videoRef} className="w-full aspect-video bg-black">
          {incident.telegram_post_id ? (
            <iframe
              src={getTelegramEmbedUrl(incident.telegram_post_id)}
              className="w-full h-full border-0"
              allowFullScreen
              loading="lazy"
            />
          ) : incident.video_url ? (
            <video
              src={incident.video_url}
              className="w-full h-full object-cover"
              controls
              preload="none"
              playsInline
            />
          ) : null}
        </div>
      )}

      {/* Image gallery */}
      {images.length > 0 && (
        <div className={`grid ${images.length === 1 ? "grid-cols-1" : "grid-cols-2"} gap-0.5`}>
          {images.slice(0, 4).map((img, i) => (
            <div key={i} className="relative aspect-video bg-black cursor-pointer" onClick={() => setExpanded(!expanded)}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={img.url}
                alt=""
                className="w-full h-full object-cover"
                loading="lazy"
              />
            </div>
          ))}
        </div>
      )}

      {/* Info */}
      <div className="p-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-neutral-400">{incident.date}</span>
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
            incident.side === "iran" ? "bg-red-500/20 text-red-400" : "bg-blue-500/20 text-blue-400"
          }`}>
            {incident.side === "iran" ? "IRAN" : "US/IL"}
          </span>
        </div>
        {incident.location && (
          <div className="text-xs font-medium text-neutral-200 mb-1">{incident.location}</div>
        )}
        <p className="text-xs text-neutral-400 line-clamp-3">{incident.description}</p>
        {!hasMedia && (
          <div className="mt-2 text-[10px] text-neutral-600 italic">No media available</div>
        )}
        {incident.source_url && (
          <a
            href={incident.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-block text-[10px] text-purple-400 hover:text-purple-300"
          >
            View source
          </a>
        )}
      </div>
    </div>
  );
}

export default function MediaFeedPanel({ area, onClose }: MediaFeedPanelProps) {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchArea = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/heatmap?lat=${area.lat}&lng=${area.lng}&radius=50`);
      if (res.ok) {
        const data = await res.json();
        setIncidents(data.incidents || []);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [area.lat, area.lng]);

  useEffect(() => {
    fetchArea();
  }, [fetchArea]);

  return (
    <div className="w-96 h-full bg-[#0a0a0a] border-l border-[#2a2a2a] flex flex-col animate-panel-slide shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#2a2a2a]">
        <div>
          <h3 className="text-sm font-semibold text-neutral-200">Media Feed</h3>
          <p className="text-[10px] text-neutral-500">{area.name} ({incidents.length} incidents)</p>
        </div>
        <button
          onClick={onClose}
          className="p-1 text-neutral-500 hover:text-neutral-300 transition-colors"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="text-xs text-neutral-500 animate-pulse">Loading media...</div>
          </div>
        ) : incidents.length === 0 ? (
          <div className="flex items-center justify-center h-32">
            <div className="text-xs text-neutral-500">No incidents in this area</div>
          </div>
        ) : (
          incidents.map((inc) => <MediaCard key={inc.id} incident={inc} />)
        )}
      </div>
    </div>
  );
}
