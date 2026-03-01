"use client";

import { memo } from "react";
import { Incident } from "@/lib/types";
import { parseTelegramPostId } from "@/lib/telegramUtils";

interface FeedSidebarProps {
  incidents: Incident[];
  onSelectIncident: (incident: Incident) => void;
}

export default memo(function FeedSidebar({
  incidents,
  onSelectIncident,
}: FeedSidebarProps) {
  const feedItems = incidents
    .filter((i) => i.source === "rss" || i.source === "telegram")
    .sort((a, b) => {
      // Sort by timestamp if available, otherwise by date
      const aTime = a.timestamp || a.date;
      const bTime = b.timestamp || b.date;
      return bTime > aTime ? 1 : bTime < aTime ? -1 : 0;
    });

  if (feedItems.length === 0) return null;

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
        {feedItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onSelectIncident(item)}
            className="w-full text-left p-3 hover:bg-[#1a1a1a] transition-colors"
          >
            <div className="flex items-center gap-2 mb-1">
              <span
                className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${
                  item.source === "telegram"
                    ? "bg-blue-500/20 text-blue-400"
                    : "bg-orange-500/20 text-orange-400"
                }`}
              >
                {item.source}
              </span>
              {(item.video_url || item.telegram_post_id || parseTelegramPostId(item.source_url)) && (
                <span className="text-[9px] font-bold uppercase px-1 py-0.5 rounded bg-purple-500/20 text-purple-400">
                  VID
                </span>
              )}
              <span className="text-neutral-600 text-[10px]">
                {item.timestamp
                  ? new Date(item.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                  : item.date}
              </span>
            </div>
            <p className="text-xs text-neutral-300 line-clamp-3">
              {item.description}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
});
