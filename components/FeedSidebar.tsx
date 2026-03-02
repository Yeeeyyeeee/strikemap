"use client";

import { memo, useState, useEffect, useCallback } from "react";
import { Incident } from "@/lib/types";
import { ChannelPost } from "@/lib/telegram";

interface FeedSidebarProps {
  incidents: Incident[];
  onSelectIncident: (incident: Incident) => void;
}

const YOUTUBE_VIDEO_ID = "yw-8lJwXzOU";

export default memo(function FeedSidebar({
  incidents,
  onSelectIncident,
}: FeedSidebarProps) {
  const [tab, setTab] = useState<"telegram" | "youtube">("telegram");
  const [posts, setPosts] = useState<ChannelPost[]>([]);

  const fetchFeed = useCallback(async () => {
    try {
      const res = await fetch("/api/feed");
      const data = await res.json();
      if (data.posts && data.posts.length > 0) {
        setPosts(data.posts);
      }
    } catch {
      // Keep existing posts on error
    }
  }, []);

  useEffect(() => {
    fetchFeed();
    const interval = setInterval(fetchFeed, 30_000); // Refresh every 30s
    return () => clearInterval(interval);
  }, [fetchFeed]);

  const handlePostClick = useCallback(
    (post: ChannelPost) => {
      const incidentId = `tg-${post.id.replace("/", "-")}`;
      const matchedIncident = incidents.find((i) => i.id === incidentId);
      if (matchedIncident && matchedIncident.lat !== 0 && matchedIncident.lng !== 0) {
        onSelectIncident(matchedIncident);
      } else {
        // Build a temporary incident from the post — works with or without coordinates
        const msgId = post.id.split("/").pop() || "";
        const media = [];
        if (post.videoUrl) media.push({ type: "video" as const, url: post.videoUrl });
        for (const url of (post.imageUrls || [])) {
          media.push({ type: "image" as const, url });
        }
        onSelectIncident({
          id: incidentId,
          date: post.date || new Date().toISOString().split("T")[0],
          timestamp: post.timestamp || new Date().toISOString(),
          location: post.location || "",
          lat: post.lat || 0,
          lng: post.lng || 0,
          description: `[${post.channelUsername}] ${post.text.slice(0, 200)}`,
          details: post.text,
          weapon: "",
          target_type: "",
          video_url: post.videoUrl,
          source_url: `https://t.me/${post.channelUsername}/${msgId}`,
          source: "telegram",
          side: "iran",
          target_military: false,
          telegram_post_id: `${post.channelUsername}/${msgId}`,
          media: media.length > 0 ? media : undefined,
        });
      }
    },
    [incidents, onSelectIncident]
  );

  if (posts.length === 0) return null;

  return (
    <>
      <div className="fixed top-14 right-0 w-72 h-[calc(100vh-3.5rem)] bg-[#111]/90 backdrop-blur-sm border-l border-[#2a2a2a] z-40 hidden md:flex flex-col">
        {/* Tab header */}
        <div className="p-2 border-b border-[#2a2a2a] flex items-center gap-1 bg-[#0a0a0a]/50">
          <button
            onClick={() => setTab("telegram")}
            className={`flex-1 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-md transition-colors ${
              tab === "telegram"
                ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                : "text-neutral-500 hover:text-neutral-400"
            }`}
            style={{ fontFamily: "JetBrains Mono, monospace" }}
          >
            Live Feed
          </button>
          <button
            onClick={() => setTab("youtube")}
            className={`flex-1 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-md transition-colors flex items-center justify-center gap-1.5 ${
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
          <div className="flex-1 flex flex-col">
            <div className="relative w-full" style={{ paddingBottom: "56.25%" }}>
              <iframe
                className="absolute inset-0 w-full h-full"
                src={`https://www.youtube.com/embed/${YOUTUBE_VIDEO_ID}?autoplay=1&mute=1`}
                title="Live Cam"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                frameBorder="0"
              />
            </div>
            <div className="flex-1 flex items-center justify-center">
              <p
                className="text-[10px] text-neutral-600 uppercase tracking-wider px-4 text-center"
                style={{ fontFamily: "JetBrains Mono, monospace" }}
              >
                Live camera feed
              </p>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto divide-y divide-[#2a2a2a]/50">
            {posts.map((post) => (
              <button
                key={post.id}
                onClick={() => handlePostClick(post)}
                className="w-full text-left p-3 hover:bg-[#1a1a1a] transition-colors"
              >
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
              </button>
            ))}
          </div>
        )}
      </div>

    </>
  );
});
