"use client";

import { useState, useEffect, useRef } from "react";

interface ChangelogEntry {
  id: string;
  text: string;
  createdAt: number;
}

function relativeTime(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function ChangelogPanel() {
  const [entries, setEntries] = useState<ChangelogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const didFetch = useRef(false);

  useEffect(() => {
    if (didFetch.current) return;
    didFetch.current = true;
    fetch("/api/changelog")
      .then((r) => r.json())
      .then((data) => setEntries(data.entries || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Poll every 30s
  useEffect(() => {
    const iv = setInterval(async () => {
      try {
        const res = await fetch("/api/changelog");
        const data = await res.json();
        if (data.entries) setEntries(data.entries);
      } catch {}
    }, 30_000);
    return () => clearInterval(iv);
  }, []);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-neutral-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center px-4">
        <p className="text-neutral-600 text-sm text-center">No changes documented yet.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 md:px-3 py-3 md:py-2 space-y-3">
      {entries.map((entry, i) => (
        <div key={entry.id} className="relative pl-4">
          {/* Timeline line */}
          {i < entries.length - 1 && (
            <div className="absolute left-[5px] top-[14px] bottom-[-12px] w-px bg-[#2a2a2a]" />
          )}
          {/* Timeline dot */}
          <div className={`absolute left-0 top-[6px] w-[11px] h-[11px] rounded-full border-2 ${
            i === 0
              ? "border-red-500 bg-red-500/20"
              : "border-neutral-600 bg-[#0a0a0a]"
          }`} />
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] text-neutral-500 font-medium">{formatDate(entry.createdAt)}</span>
              <span className="text-[10px] text-neutral-600">{relativeTime(entry.createdAt)}</span>
            </div>
            <p className="text-sm md:text-xs text-neutral-300 leading-relaxed">{entry.text}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
