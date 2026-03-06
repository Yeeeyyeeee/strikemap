"use client";

import { memo, useState, useEffect, useCallback, useRef } from "react";
import type { NewsItem } from "@/app/api/news/route";
import { classifyPost, type FeedCategory } from "@/lib/telegram";

const CATEGORY_FILTERS: { label: string; value: FeedCategory | "all"; color: string; bg: string }[] = [
  { label: "All", value: "all", color: "text-neutral-400", bg: "bg-neutral-500/20" },
  { label: "STRIKE", value: "strike", color: "text-red-400", bg: "bg-red-500/20" },
  { label: "GOV", value: "government", color: "text-sky-400", bg: "bg-sky-500/20" },
  { label: "INTEL", value: "analysis", color: "text-amber-400", bg: "bg-amber-500/20" },
];

export default memo(function NewsSidebar() {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<FeedCategory | "all">("all");
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const knownIdsRef = useRef<Set<string>>(new Set());

  const fetchNews = useCallback(async () => {
    try {
      const res = await fetch("/api/news");
      const data = await res.json();
      if (data.items?.length) {
        const incoming = data.items as NewsItem[];
        // Flash new items
        if (knownIdsRef.current.size > 0) {
          const fresh = new Set<string>();
          for (const item of incoming) {
            if (!knownIdsRef.current.has(item.id)) fresh.add(item.id);
          }
          if (fresh.size > 0) {
            setNewIds(fresh);
            setTimeout(() => setNewIds(new Set()), 1500);
          }
        }
        knownIdsRef.current = new Set(incoming.map((i) => i.id));
        setItems(incoming);
      }
    } catch {
      // Keep existing items on error
    }
  }, []);

  useEffect(() => {
    fetchNews();
    const interval = setInterval(fetchNews, 60_000); // poll every 60s
    return () => clearInterval(interval);
  }, [fetchNews]);

  const isEmpty = items.length === 0;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {isEmpty ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-neutral-500">
            <div className="animate-spin w-5 h-5 border-2 border-neutral-600 border-t-neutral-400 rounded-full mx-auto mb-2" />
            <span className="text-[10px] uppercase tracking-wider">Loading news...</span>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {/* Category filter chips */}
          <div className="px-2 py-1 border-b border-[#2a2a2a]/50 shrink-0 flex gap-1">
            {CATEGORY_FILTERS.map((cf) => (
              <button
                key={cf.value}
                onClick={() => setCategoryFilter(cf.value)}
                className={`px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded transition-colors ${
                  categoryFilter === cf.value
                    ? `${cf.bg} ${cf.color} border border-current/30`
                    : "text-neutral-600 hover:text-neutral-400"
                }`}
                style={{ fontFamily: "JetBrains Mono, monospace" }}
              >
                {cf.label}
              </button>
            ))}
          </div>
          <div
            className="flex-1 overflow-y-auto overscroll-contain divide-y divide-[#2a2a2a]/50"
            style={{ WebkitOverflowScrolling: "touch" }}
          >
            {items
              .filter((item) => {
                if (categoryFilter === "all") return true;
                return classifyPost(item.title) === categoryFilter;
              })
              .map((item) => {
              const isExpanded = expandedId === item.id;
              const isNew = newIds.has(item.id);
              const itemCategory = classifyPost(item.title);

              return (
                <div
                  key={item.id}
                  className={`${isNew ? "feed-flash" : ""}`}
                >
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() =>
                      setExpandedId((prev) => (prev === item.id ? null : item.id))
                    }
                    className={`w-full text-left px-3 py-2 hover:bg-[#1a1a1a] transition-colors cursor-pointer ${
                      isExpanded ? "bg-[#1a1a1a]" : ""
                    }`}
                  >
                    <div className="flex items-center gap-1.5 mb-1 h-[18px]">
                      <span className="text-[9px] font-bold uppercase px-1 py-0.5 rounded bg-amber-500/20 text-amber-400 shrink-0">
                        NEWS
                      </span>
                      {itemCategory === "strike" && (
                        <span className="text-[9px] font-bold uppercase px-1 py-0.5 rounded bg-red-500/20 text-red-400 shrink-0">
                          STRIKE
                        </span>
                      )}
                      {itemCategory === "government" && (
                        <span className="text-[9px] font-bold uppercase px-1 py-0.5 rounded bg-sky-500/20 text-sky-400 shrink-0">
                          GOV
                        </span>
                      )}
                      {itemCategory === "analysis" && (
                        <span className="text-[9px] font-bold uppercase px-1 py-0.5 rounded bg-amber-600/20 text-amber-300 shrink-0">
                          INTEL
                        </span>
                      )}
                      <span className="text-neutral-600 text-[10px] ml-auto shrink-0">
                        {new Date(item.timestamp).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                    <p className="text-xs text-neutral-300 line-clamp-2 leading-tight">
                      {item.title}
                    </p>
                  </div>

                  {isExpanded && (
                    <div className="bg-[#0e0e0e] border-t border-[#2a2a2a]/50">
                      <div className="px-3 py-2">
                        <p className="text-xs text-neutral-300 whitespace-pre-line leading-relaxed">
                          {item.title}
                        </p>
                      </div>
                      <div className="px-3 py-2 border-t border-[#2a2a2a]/50">
                        <a
                          href={item.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] text-neutral-500 hover:text-neutral-300 underline underline-offset-2"
                        >
                          Read on FinancialJuice ↗
                        </a>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
});
