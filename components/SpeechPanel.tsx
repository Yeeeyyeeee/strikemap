"use client";

import { memo, useState } from "react";

interface SpeechPanelProps {
  videoId: string;
  title?: string;
}

export default memo(function SpeechPanel({ videoId, title = "Gov. Address" }: SpeechPanelProps) {
  const [open, setOpen] = useState(true);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed top-16 left-[15.5rem] z-40 hidden md:flex items-center gap-1.5 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-2.5 py-1.5 hover:bg-[#222] transition-colors"
      >
        <span className="relative flex h-1.5 w-1.5">
          <span className="animate-pulse absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-500" />
        </span>
        <span
          className="text-[9px] font-bold text-neutral-400 uppercase tracking-wider"
          style={{ fontFamily: "JetBrains Mono, monospace" }}
        >
          {title}
        </span>
      </button>
    );
  }

  return (
    <div className="fixed top-16 left-[15.5rem] z-40 hidden md:block w-72">
      <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg overflow-hidden shadow-lg">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-[#2a2a2a]">
          <div className="flex items-center gap-2">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-pulse absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-500" />
            </span>
            <span
              className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider"
              style={{ fontFamily: "JetBrains Mono, monospace" }}
            >
              {title}
            </span>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="text-neutral-500 hover:text-neutral-300 transition-colors"
          >
            <svg
              className="w-3.5 h-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Video */}
        <iframe
          className="w-full aspect-video block"
          src={`https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1`}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          frameBorder="0"
        />
      </div>
    </div>
  );
});
