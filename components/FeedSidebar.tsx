"use client";

import { memo, useState, useEffect, useCallback } from "react";
import { Incident } from "@/lib/types";
import { ChannelPost } from "@/lib/telegram";

interface FeedSidebarProps {
  incidents: Incident[];
  onSelectIncident: (incident: Incident) => void;
}

export default memo(function FeedSidebar({
  incidents,
  onSelectIncident,
}: FeedSidebarProps) {
  const [posts, setPosts] = useState<ChannelPost[]>([]);
  const [selectedPost, setSelectedPost] = useState<ChannelPost | null>(null);

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
    const interval = setInterval(fetchFeed, 30_000);
    return () => clearInterval(interval);
  }, [fetchFeed]);

  const handlePostClick = useCallback(
    (post: ChannelPost) => {
      // If there's a matching map incident, select it on the map
      const incidentId = `tg-${post.id.replace("/", "-")}`;
      const matchedIncident = incidents.find((i) => i.id === incidentId);
      if (matchedIncident) {
        onSelectIncident(matchedIncident);
      }
      // Always show the Telegram embed
      setSelectedPost((prev) => (prev?.id === post.id ? null : post));
    },
    [incidents, onSelectIncident]
  );

  if (posts.length === 0) return null;

  return (
    <>
      <div className="fixed top-14 right-0 w-72 h-[calc(100vh-3.5rem)] bg-[#111]/90 backdrop-blur-sm border-l border-[#2a2a2a] z-40 overflow-y-auto hidden md:block">
        <div className="p-3 border-b border-[#2a2a2a]">
          <h2
            className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider"
            style={{ fontFamily: "JetBrains Mono, monospace" }}
          >
            Live Feed
          </h2>
        </div>
        <div className="divide-y divide-[#2a2a2a]/50">
          {posts.map((post) => (
            <button
              key={post.id}
              onClick={() => handlePostClick(post)}
              className={`w-full text-left p-3 hover:bg-[#1a1a1a] transition-colors ${
                selectedPost?.id === post.id ? "bg-[#1a1a1a] border-l-2 border-blue-500" : ""
              }`}
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
      </div>

      {/* Telegram embed panel */}
      {selectedPost && (
        <div className="fixed bottom-0 right-72 z-50 w-96 max-h-[70vh] panel-enter hidden md:block">
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-t-xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 border-b border-[#2a2a2a]">
              <span className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider">
                @{selectedPost.channelUsername}
              </span>
              <button
                onClick={() => setSelectedPost(null)}
                className="text-neutral-500 hover:text-neutral-300 text-sm"
              >
                ✕
              </button>
            </div>
            <iframe
              src={`https://t.me/${selectedPost.id}?embed=1&dark=1`}
              className="w-full border-0"
              style={{ height: "400px" }}
              sandbox="allow-scripts allow-same-origin allow-popups"
            />
          </div>
        </div>
      )}
    </>
  );
});
