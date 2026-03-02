"use client";

import { useState, useEffect, useCallback, memo } from "react";

const YOUTUBE_VIDEO_ID = "yw-8lJwXzOU";

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
export function LiveFeedDesktop() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"telegram" | "youtube">("telegram");
  const [posts, setPosts] = useState<FeedPost[]>([]);

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
      const iv = setInterval(fetchFeed, 15_000);
      return () => clearInterval(iv);
    }
  }, [open, tab, fetchFeed]);

  return (
    <div className="bg-[#1a1a1a]/90 backdrop-blur-sm border border-[#2a2a2a] rounded-lg w-full overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between p-3 hover:bg-[#222] transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
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
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-500" />
              </span>
              Live Cam
            </button>
          </div>

          {/* Tab content */}
          {tab === "youtube" ? (
            <div className="relative w-full" style={{ paddingBottom: "56.25%" }}>
              <iframe
                className="absolute inset-0 w-full h-full"
                src={`https://www.youtube.com/embed/${YOUTUBE_VIDEO_ID}?autoplay=1&mute=1`}
                title="Live Feed"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                frameBorder="0"
              />
            </div>
          ) : (
            <div className="max-h-64 overflow-y-auto divide-y divide-[#2a2a2a]/50">
              {posts.length === 0 ? (
                <div className="flex items-center justify-center py-6">
                  <span className="text-neutral-600 text-[10px]">Loading feed...</span>
                </div>
              ) : (
                posts.map((post) => (
                  <div key={post.id} className="px-3 py-2">
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
                    <p className="text-[10px] text-neutral-300 line-clamp-2 leading-tight">
                      {post.text}
                    </p>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Mobile version — floating pill + bottom-sheet with Telegram / YouTube tabs */
export default memo(function LiveFeedMobile() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"telegram" | "youtube">("telegram");
  const [posts, setPosts] = useState<FeedPost[]>([]);

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
      const iv = setInterval(fetchFeed, 15_000);
      return () => clearInterval(iv);
    }
  }, [open, tab, fetchFeed]);

  return (
    <>
      {/* Floating LIVE pill */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-20 left-3 z-50 md:hidden flex items-center gap-1.5 bg-[#1a1a1a]/95 backdrop-blur-sm border border-[#2a2a2a] rounded-full px-3 py-2 shadow-lg active:scale-95 transition-transform"
        >
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
          </span>
          <span
            className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider"
            style={{ fontFamily: "JetBrains Mono, monospace" }}
          >
            LIVE
          </span>
        </button>
      )}

      {/* Bottom-sheet */}
      {open && (
        <div className="fixed bottom-0 left-0 right-0 z-50 md:hidden">
          <div className="bg-[#111]/95 backdrop-blur-md border-t border-[#2a2a2a] rounded-t-xl">
            {/* Header with tabs + close */}
            <div className="flex items-center justify-between px-3 py-2">
              <div className="flex items-center gap-1 bg-[#0a0a0a] rounded-lg p-0.5">
                <button
                  onClick={() => setTab("telegram")}
                  className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-md transition-colors ${
                    tab === "telegram"
                      ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                      : "text-neutral-500"
                  }`}
                  style={{ fontFamily: "JetBrains Mono, monospace" }}
                >
                  Telegram
                </button>
                <button
                  onClick={() => setTab("youtube")}
                  className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-md transition-colors flex items-center gap-1.5 ${
                    tab === "youtube"
                      ? "bg-red-500/20 text-red-400 border border-red-500/30"
                      : "text-neutral-500"
                  }`}
                  style={{ fontFamily: "JetBrains Mono, monospace" }}
                >
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-500" />
                  </span>
                  Live Cam
                </button>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="text-neutral-500 hover:text-neutral-300 p-1"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* Tab content */}
            {tab === "youtube" ? (
              <div className="relative w-full" style={{ paddingBottom: "56.25%" }}>
                <iframe
                  className="absolute inset-0 w-full h-full"
                  src={`https://www.youtube.com/embed/${YOUTUBE_VIDEO_ID}?autoplay=1&mute=1&playsinline=1`}
                  title="Live Feed"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  frameBorder="0"
                />
              </div>
            ) : (
              <div className="max-h-[50vh] overflow-y-auto divide-y divide-[#2a2a2a]/50">
                {posts.length === 0 ? (
                  <div className="flex items-center justify-center py-8">
                    <span className="text-neutral-600 text-xs">Loading feed...</span>
                  </div>
                ) : (
                  posts.map((post) => (
                    <div key={post.id} className="px-4 py-3">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400">
                          {post.channelUsername}
                        </span>
                        {post.videoUrl && (
                          <span className="text-[9px] font-bold uppercase px-1 py-0.5 rounded bg-purple-500/20 text-purple-400">
                            VID
                          </span>
                        )}
                        <span className="text-neutral-600 text-[10px]">
                          {post.timestamp
                            ? new Date(post.timestamp).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })
                            : post.date}
                        </span>
                      </div>
                      <p className="text-xs text-neutral-300 line-clamp-3">
                        {post.text}
                      </p>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
});
