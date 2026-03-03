"use client";

import { memo, useState, useEffect, useCallback } from "react";

function useYouTubeIds() {
  const [ids, setIds] = useState<string[]>([]);
  useEffect(() => {
    fetch("/api/youtube-links")
      .then((r) => r.json())
      .then((d) => {
        if (d.liveCams?.length) setIds(d.liveCams.map((c: { id: string }) => c.id));
      })
      .catch(() => {});
  }, []);
  return ids;
}

// -------------------------------------------------------
// Telegram feed types (minimal, matches /api/feed)
// -------------------------------------------------------
interface FeedPost {
  id: string;
  channelUsername: string;
  text: string;
  date: string;
  timestamp?: string;
  videoUrl?: string;
}

/** Desktop version — collapsible panel in left sidebar with Telegram / YouTube tabs */
export const LiveFeedDesktop = memo(function LiveFeedDesktop() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"telegram" | "youtube">("telegram");
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const YOUTUBE_VIDEO_IDS = useYouTubeIds();

  const fetchFeed = useCallback(async () => {
    try {
      const res = await fetch("/api/feed");
      const data = await res.json();
      if (data.posts?.length) setPosts(data.posts);
    } catch {
      // keep existing
    }
  }, []);

  useEffect(() => {
    if (open && tab === "telegram") {
      fetchFeed();
      const iv = setInterval(fetchFeed, 30_000);
      return () => clearInterval(iv);
    }
  }, [open, tab, fetchFeed]);

  return (
    <div className="bg-[#1a1a1a]/95 border border-[#2a2a2a] rounded-lg w-full overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between p-3 hover:bg-[#222] transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-pulse absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
          </span>
          <h3
            className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider"
            style={{ fontFamily: "JetBrains Mono, monospace" }}
          >
            Live Feed
          </h3>
        </div>
        <svg
          className={`w-3 h-3 text-neutral-500 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="border-t border-[#2a2a2a]">
          {/* Tabs */}
          <div className="flex items-center gap-1 p-1.5 bg-[#0a0a0a]/50">
            <button
              onClick={() => setTab("telegram")}
              className={`flex-1 px-2 py-1 text-[9px] font-bold uppercase tracking-wider rounded transition-colors ${
                tab === "telegram"
                  ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                  : "text-neutral-500 hover:text-neutral-400"
              }`}
              style={{ fontFamily: "JetBrains Mono, monospace" }}
            >
              Telegram
            </button>
            <button
              onClick={() => setTab("youtube")}
              className={`flex-1 px-2 py-1 text-[9px] font-bold uppercase tracking-wider rounded transition-colors flex items-center justify-center gap-1 ${
                tab === "youtube"
                  ? "bg-red-500/20 text-red-400 border border-red-500/30"
                  : "text-neutral-500 hover:text-neutral-400"
              }`}
              style={{ fontFamily: "JetBrains Mono, monospace" }}
            >
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-pulse absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-500" />
              </span>
              Live Cam
            </button>
          </div>

          {/* Tab content */}
          {tab === "youtube" ? (
            <div className="max-h-64 overflow-y-auto">
              {YOUTUBE_VIDEO_IDS.map((vid, i) => (
                <iframe
                  key={vid}
                  className="w-full aspect-video block"
                  src={`https://www.youtube.com/embed/${vid}?autoplay=${i === 0 ? 1 : 0}&mute=1`}
                  title={`Live Cam ${i + 1}`}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  frameBorder="0"
                />
              ))}
            </div>
          ) : (
            <div className="max-h-64 overflow-y-auto divide-y divide-[#2a2a2a]/50">
              {posts.length === 0 ? (
                <div className="flex items-center justify-center py-6">
                  <span className="text-neutral-600 text-[10px]">Loading feed...</span>
                </div>
              ) : (
                posts.map((post) => {
                  const isExp = expandedId === post.id;
                  return (
                    <button
                      key={post.id}
                      onClick={() => setExpandedId((prev) => (prev === post.id ? null : post.id))}
                      className="w-full text-left px-3 py-2 hover:bg-[#1a1a1a] transition-colors"
                    >
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="text-[8px] font-bold uppercase px-1 py-0.5 rounded bg-blue-500/20 text-blue-400">
                          {post.channelUsername}
                        </span>
                        {post.videoUrl && (
                          <span className="text-[8px] font-bold uppercase px-1 py-0.5 rounded bg-purple-500/20 text-purple-400">
                            VID
                          </span>
                        )}
                        <span className="text-neutral-600 text-[9px]">
                          {post.timestamp
                            ? new Date(post.timestamp).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })
                            : post.date}
                        </span>
                      </div>
                      <p className={`text-[10px] text-neutral-300 leading-tight ${isExp ? "whitespace-pre-line" : "line-clamp-2"}`}>
                        {post.text}
                      </p>
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
});

/** Mobile version — now a no-op since feed is handled by MobileTabBar */
export default memo(function LiveFeedMobile() {
  return null;
});
