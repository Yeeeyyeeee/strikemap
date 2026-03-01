"use client";

import { memo, useState, useEffect, useCallback } from "react";
import { Incident } from "@/lib/types";
import { ChannelPost } from "@/lib/telegram";
import { parseTelegramPostId } from "@/lib/telegramUtils";

interface FeedSidebarProps {
  incidents: Incident[];
  onSelectIncident: (incident: Incident) => void;
}

export default memo(function FeedSidebar({
  incidents,
  onSelectIncident,
}: FeedSidebarProps) {
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

  if (posts.length === 0) return null;

  return (
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
        {posts.map((post) => {
          const msgId = post.id.split("/").pop() || "";
          // Try to find a matching map incident to make it clickable
          const incidentId = `tg-${post.id.replace("/", "-")}`;
          const matchedIncident = incidents.find((i) => i.id === incidentId);

          return (
            <button
              key={post.id}
              onClick={() => {
                if (matchedIncident) onSelectIncident(matchedIncident);
              }}
              className={`w-full text-left p-3 transition-colors ${
                matchedIncident ? "hover:bg-[#1a1a1a] cursor-pointer" : "cursor-default"
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400">
                  {post.channelUsername}
                </span>
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
          );
        })}
      </div>
    </div>
  );
});
