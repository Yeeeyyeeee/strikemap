"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { Incident, MediaItem } from "@/lib/types";
import { isDirectVideoUrl, getYouTubeEmbedUrl } from "@/lib/videoUtils";

interface HeatmapArea {
  lat: number;
  lng: number;
  name: string;
}

interface MediaFeedPanelProps {
  area: HeatmapArea;
  onClose: () => void;
}

/** A single flattened media entry with parent incident context */
interface FeedItem {
  key: string;
  media: MediaItem;
  location: string;
  date: string;
  side: string;
}

/** Individual video slide — handles autoplay via IntersectionObserver */
function MediaSlide({ item, index, total }: { item: FeedItem; index: number; total: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Autoplay video when visible, pause when not
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (videoRef.current) {
          if (entry.isIntersecting) {
            videoRef.current.play().catch(() => {});
          } else {
            videoRef.current.pause();
            videoRef.current.currentTime = 0;
          }
        }
      },
      { threshold: 0.6 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const ytUrl = getYouTubeEmbedUrl(item.media.url);

  return (
    <div
      ref={ref}
      className="w-full shrink-0 relative bg-black flex items-center justify-center"
      style={{ height: "100%", scrollSnapAlign: "start", scrollSnapStop: "always" }}
    >
      {/* Video content */}
      {ytUrl ? (
        <iframe
          src={`${ytUrl}?autoplay=1&mute=0&loop=1&controls=0&modestbranding=1`}
          className="w-full h-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          title="Video"
        />
      ) : isDirectVideoUrl(item.media.url) ? (
        <video
          ref={videoRef}
          key={item.media.url}
          src={item.media.url}
          controls
          playsInline
          loop
          preload="metadata"
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="flex items-center justify-center h-full">
          <a
            href={item.media.url}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 bg-white/10 rounded-lg text-sm text-red-400 hover:text-red-300"
          >
            Watch video ↗
          </a>
        </div>
      )}

      {/* TikTok-style bottom overlay */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent px-4 pb-4 pt-12 pointer-events-none">
        <div className="flex items-end justify-between">
          <div>
            {item.location && (
              <p className="text-sm font-semibold text-white drop-shadow-lg">{item.location}</p>
            )}
            <p className="text-[11px] text-white/60 mt-0.5">{item.date}</p>
          </div>
          <div className="text-[11px] text-white/50 tabular-nums font-medium">
            {index + 1}/{total}
          </div>
        </div>
      </div>

      {/* Side progress indicator */}
      <div className="absolute right-2 top-1/2 -translate-y-1/2 flex flex-col gap-1 pointer-events-none">
        {Array.from({ length: Math.min(total, 8) }).map((_, i) => (
          <div
            key={i}
            className={`w-1 rounded-full transition-all duration-300 ${
              i === index % 8 ? "h-4 bg-white/80" : "h-1.5 bg-white/20"
            }`}
          />
        ))}
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

  // Flatten all VIDEO media from all incidents (skip images)
  const feedItems: FeedItem[] = useMemo(() => {
    const items: FeedItem[] = [];
    for (const inc of incidents) {
      const mediaList: MediaItem[] =
        inc.media && inc.media.length > 0
          ? inc.media
          : inc.video_url
            ? [{ type: "video" as const, url: inc.video_url }]
            : [];

      for (let i = 0; i < mediaList.length; i++) {
        // Only include videos
        if (mediaList[i].type !== "video") continue;
        items.push({
          key: `${inc.id}-${i}`,
          media: mediaList[i],
          location: inc.location || "",
          date: inc.date || "",
          side: inc.side,
        });
      }
    }
    return items;
  }, [incidents]);

  return (
    <div className="w-96 h-full bg-black border-l border-[#2a2a2a] flex flex-col shrink-0">
      {/* Slim header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-[#2a2a2a]/50 bg-black/90 z-10">
        <div className="flex items-center gap-2">
          <h3
            className="text-[11px] font-bold uppercase tracking-wider text-neutral-400"
            style={{ fontFamily: "JetBrains Mono, monospace" }}
          >
            Videos
          </h3>
          <span className="text-[10px] text-neutral-600">{feedItems.length} clips</span>
        </div>
        <button
          onClick={onClose}
          className="w-6 h-6 flex items-center justify-center text-neutral-500 hover:text-neutral-300 transition-colors"
        >
          <svg
            className="w-4 h-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* TikTok/Reels-style vertical snap-scroll feed */}
      <div
        className="flex-1 overflow-y-auto scrollbar-hide"
        style={{
          scrollSnapType: "y mandatory",
          WebkitOverflowScrolling: "touch",
          overscrollBehavior: "contain",
        }}
      >
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-xs text-neutral-500 animate-pulse">Loading videos...</div>
          </div>
        ) : feedItems.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-xs text-neutral-500">No videos in this area</div>
          </div>
        ) : (
          feedItems.map((item, i) => (
            <MediaSlide key={item.key} item={item} index={i} total={feedItems.length} />
          ))
        )}
      </div>
    </div>
  );
}
