"use client";

import { memo, useState, useEffect, useCallback } from "react";

interface LiveStream {
  id: string;
  label: string;
}

export default memo(function CurrentCam() {
  const [streams, setStreams] = useState<LiveStream[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);

  const fetchStreams = useCallback(async () => {
    try {
      const res = await fetch("/api/youtube-links");
      const data = await res.json();
      const all: LiveStream[] = [...(data.liveNews || []), ...(data.liveCams || [])];
      setStreams(all);
    } catch {}
  }, []);

  useEffect(() => {
    fetchStreams();
  }, [fetchStreams]);

  if (streams.length === 0) return null;

  const current = streams[selectedIdx] || streams[0];

  return (
    <div className="w-full">
      {/* Video */}
      <iframe
        className="w-full aspect-video block bg-black"
        src={`https://www.youtube.com/embed/${current.id}?autoplay=1&mute=1`}
        title={current.label || "Live"}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        frameBorder="0"
      />

      {/* Stream selector */}
      {streams.length > 1 && (
        <div className="px-2 py-1.5">
          <select
            value={selectedIdx}
            onChange={(e) => setSelectedIdx(Number(e.target.value))}
            className="w-full bg-[#111] border border-[#2a2a2a] rounded px-1.5 py-1 text-[10px] text-neutral-300 font-semibold uppercase tracking-wider appearance-none cursor-pointer focus:outline-none focus:border-red-500/50"
            style={{ fontFamily: "JetBrains Mono, monospace" }}
          >
            {streams.map((s, i) => (
              <option key={`${s.id}-${i}`} value={i}>
                {s.label || `Stream ${i + 1}`}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
});
