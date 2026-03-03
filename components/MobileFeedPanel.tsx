"use client";

import { memo, useState, useEffect, useCallback, useRef } from "react";
import { isDirectVideoUrl } from "@/lib/videoUtils";

interface FeedPost {
  id: string;
  channelUsername: string;
  text: string;
  date: string;
  timestamp?: string;
  videoUrl?: string;
  imageUrls?: string[];
  lat?: number;
  lng?: number;
  location?: string;
}

const COUNTRY_FILTERS: { label: string; keywords: string[] }[] = [
  { label: "All", keywords: [] },
  { label: "Iran", keywords: ["iran", "iranian", "tehran", "isfahan", "tabriz", "shiraz", "mashhad", "🇮🇷"] },
  { label: "Israel", keywords: ["israel", "israeli", "tel aviv", "jerusalem", "haifa", "negev", "idf", "🇮🇱"] },
  { label: "USA", keywords: ["us ", "u.s.", "usa", "american", "pentagon", "trump", "centcom", "🇺🇸"] },
  { label: "Lebanon", keywords: ["lebanon", "lebanese", "beirut", "hezbollah", "🇱🇧"] },
  { label: "Yemen", keywords: ["yemen", "yemeni", "houthi", "sanaa", "🇾🇪"] },
  { label: "Iraq", keywords: ["iraq", "iraqi", "baghdad", "erbil", "🇮🇶"] },
  { label: "Syria", keywords: ["syria", "syrian", "damascus", "aleppo", "🇸🇾"] },
  { label: "Kuwait", keywords: ["kuwait", "kuwaiti", "🇰🇼"] },
  { label: "Bahrain", keywords: ["bahrain", "bahraini", "manama", "🇧🇭"] },
  { label: "Qatar", keywords: ["qatar", "qatari", "doha", "🇶🇦"] },
  { label: "UAE", keywords: ["uae", "emirati", "dubai", "abu dhabi", "🇦🇪"] },
  { label: "Saudi", keywords: ["saudi", "riyadh", "aramco", "🇸🇦"] },
  { label: "Oman", keywords: ["oman", "omani", "muscat", "🇴🇲"] },
  { label: "Gaza", keywords: ["gaza", "palestinian", "hamas"] },
  { label: "Jordan", keywords: ["jordan", "jordanian", "amman", "🇯🇴"] },
  { label: "Turkey", keywords: ["turkey", "turkish", "ankara", "istanbul", "🇹🇷"] },
  { label: "Cyprus", keywords: ["cyprus", "cypriot", "nicosia", "larnaca", "limassol", "🇨🇾"] },
];

function matchesCountryFilter(text: string, filter: typeof COUNTRY_FILTERS[number]): boolean {
  if (filter.keywords.length === 0) return true;
  const lower = text.toLowerCase();
  return filter.keywords.some((kw) => lower.includes(kw));
}

export default memo(function MobileFeedPanel({ onClose }: { onClose?: () => void }) {
  const [tab, setTab] = useState<"telegram" | "youtube">("telegram");
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [youtubeIds, setYoutubeIds] = useState<string[]>([]);
  const [countryFilter, setCountryFilter] = useState(COUNTRY_FILTERS[0]);
  const [newPostIds, setNewPostIds] = useState<Set<string>>(new Set());
  const knownIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    fetch("/api/youtube-links")
      .then((r) => r.json())
      .then((d) => {
        if (d.liveCams?.length) setYoutubeIds(d.liveCams.map((c: { id: string }) => c.id));
      })
      .catch(() => {});
  }, []);

  const fetchFeed = useCallback(async () => {
    try {
      const res = await fetch("/api/feed");
      const data = await res.json();
      if (data.posts?.length) {
        const incoming = data.posts as FeedPost[];
        if (knownIdsRef.current.size > 0) {
          const fresh = new Set<string>();
          for (const p of incoming) {
            if (!knownIdsRef.current.has(p.id)) fresh.add(p.id);
          }
          if (fresh.size > 0) {
            setNewPostIds(fresh);
            setTimeout(() => setNewPostIds(new Set()), 1500);
          }
        }
        knownIdsRef.current = new Set(incoming.map((p) => p.id));
        setPosts(incoming);
      }
    } catch { /* keep existing */ }
  }, []);

  useEffect(() => {
    fetchFeed();
    const iv = setInterval(fetchFeed, 30_000);
    return () => clearInterval(iv);
  }, [fetchFeed]);

  return (
    <div className="fixed top-14 bottom-14 left-0 right-0 z-40 md:hidden bg-[#0a0a0a] flex flex-col">
      {/* Tab header */}
      <div className="p-2 border-b border-[#2a2a2a] flex items-center gap-1 bg-[#0a0a0a] shrink-0">
        <button
          onClick={() => setTab("telegram")}
          className={`flex-1 px-3 py-2 text-xs font-bold uppercase tracking-wider rounded-md transition-colors ${
            tab === "telegram"
              ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
              : "text-neutral-500"
          }`}
          style={{ fontFamily: "JetBrains Mono, monospace" }}
        >
          Live Feed
        </button>
        <button
          onClick={() => setTab("youtube")}
          className={`flex-1 px-3 py-2 text-xs font-bold uppercase tracking-wider rounded-md transition-colors flex items-center justify-center gap-1.5 ${
            tab === "youtube"
              ? "bg-red-500/20 text-red-400 border border-red-500/30"
              : "text-neutral-500"
          }`}
          style={{ fontFamily: "JetBrains Mono, monospace" }}
        >
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-pulse absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-500" />
          </span>
          Live Cam
        </button>
        {onClose && (
          <button
            onClick={onClose}
            className="text-neutral-500 hover:text-neutral-300 p-1.5 transition-colors shrink-0"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </div>

      {/* Content */}
      {tab === "youtube" ? (
        <div className="flex-1 overflow-y-auto">
          {youtubeIds.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <span className="text-neutral-600 text-sm">No live cams configured</span>
            </div>
          ) : (
            youtubeIds.map((vid, i) => (
              <iframe
                key={vid}
                className="w-full aspect-video block"
                src={`https://www.youtube.com/embed/${vid}?autoplay=${i === 0 ? 1 : 0}&mute=1&playsinline=1`}
                title={`Live Cam ${i + 1}`}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                frameBorder="0"
              />
            ))
          )}
        </div>
      ) : (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {/* Country filter dropdown */}
          <div className="px-3 py-2 border-b border-[#2a2a2a]/50 shrink-0">
            <div className="relative">
              <select
                value={countryFilter.label}
                onChange={(e) => {
                  const f = COUNTRY_FILTERS.find((c) => c.label === e.target.value);
                  if (f) setCountryFilter(f);
                }}
                className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-3 py-2.5 text-sm text-neutral-300 font-semibold uppercase tracking-wider appearance-none cursor-pointer focus:outline-none focus:border-red-500/50 pr-8"
                style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "16px" }}
              >
                {COUNTRY_FILTERS.map((f) => (
                  <option key={f.label} value={f.label}>
                    {f.label === "All" ? "All Countries" : f.label}
                  </option>
                ))}
              </select>
              <svg className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500 pointer-events-none" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
              </svg>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto overscroll-contain divide-y divide-[#2a2a2a]/50" style={{ WebkitOverflowScrolling: "touch" }}>
          {posts.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <span className="text-neutral-600 text-sm">Loading feed...</span>
            </div>
          ) : (
            posts.filter((p) => matchesCountryFilter(p.text, countryFilter)).map((post) => {
              const isExpanded = expandedId === post.id;
              const isNew = newPostIds.has(post.id);
              const msgId = post.id.split("/").pop() || "";
              return (
                <div
                  key={post.id}
                  className={`${isNew ? "feed-flash" : ""} ${isExpanded ? "" : "max-h-[76px] overflow-hidden"}`}
                >
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => setExpandedId((prev) => (prev === post.id ? null : post.id))}
                    className={`w-full text-left px-4 py-3 active:bg-[#1a1a1a] transition-colors cursor-pointer ${isExpanded ? "bg-[#1a1a1a]" : ""}`}
                  >
                    <div className="flex items-center gap-2 mb-1.5 h-[18px]">
                      {post.videoUrl && (
                        <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400 shrink-0">
                          VID
                        </span>
                      )}
                      {(post.imageUrls || []).length > 0 && !post.videoUrl && (
                        <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-green-500/20 text-green-400 shrink-0">
                          IMG
                        </span>
                      )}
                      <span className="text-neutral-600 text-[11px] ml-auto shrink-0">
                        {post.timestamp
                          ? new Date(post.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                          : post.date}
                      </span>
                    </div>
                    <p className={`text-sm text-neutral-300 leading-snug ${isExpanded ? "whitespace-pre-line" : "line-clamp-2"}`}>
                      {post.text}
                    </p>
                  </div>

                  {isExpanded && (
                    <div className="bg-[#0e0e0e] border-t border-[#2a2a2a]/50">
                      {post.videoUrl && isDirectVideoUrl(post.videoUrl) && (
                        <video
                          src={post.videoUrl}
                          controls
                          playsInline
                          preload="metadata"
                          className="w-full max-h-[250px] object-contain bg-black"
                        />
                      )}
                      {(post.imageUrls || []).length > 0 && (
                        <div className={(post.imageUrls || []).length > 1 ? "grid grid-cols-2 gap-px" : ""}>
                          {(post.imageUrls || []).map((url, i) => (
                            <img key={i} src={url} alt="" className="w-full max-h-[200px] object-cover" loading="lazy" />
                          ))}
                        </div>
                      )}
                      <div className="px-4 py-2.5 border-t border-[#2a2a2a]/50">
                        <a
                          href={`https://t.me/${post.channelUsername}/${msgId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-neutral-500 hover:text-neutral-300 underline underline-offset-2"
                        >
                          View on Telegram
                        </a>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
          </div>
        </div>
      )}
    </div>
  );
});
