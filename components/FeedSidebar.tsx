"use client";

import { memo, useState, useEffect, useCallback, useRef } from "react";
import { Incident } from "@/lib/types";
import { ChannelPost } from "@/lib/telegram";
import { isDirectVideoUrl } from "@/lib/videoUtils";

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
  if (filter.keywords.length === 0) return true; // "All"
  const lower = text.toLowerCase();
  return filter.keywords.some((kw) => lower.includes(kw));
}

interface FeedSidebarProps {
  incidents: Incident[];
  onSelectIncident: (incident: Incident) => void;
}

export default memo(function FeedSidebar({
  incidents,
  onSelectIncident,
}: FeedSidebarProps) {
  const [tab, setTab] = useState<"telegram" | "youtube">("telegram");
  const [posts, setPosts] = useState<ChannelPost[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [YOUTUBE_VIDEO_IDS, setYouTubeIds] = useState<string[]>([]);
  const [countryFilter, setCountryFilter] = useState(COUNTRY_FILTERS[0]);
  const [newPostIds, setNewPostIds] = useState<Set<string>>(new Set());
  const knownIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    fetch("/api/youtube-links")
      .then((r) => r.json())
      .then((d) => {
        if (d.liveCams?.length) setYouTubeIds(d.liveCams.map((c: { id: string }) => c.id));
      })
      .catch(() => {});
  }, []);

  const fetchFeed = useCallback(async () => {
    try {
      const res = await fetch("/api/feed");
      const data = await res.json();
      if (data.posts && data.posts.length > 0) {
        const incoming = data.posts as ChannelPost[];
        // Detect new posts (not in previous known set)
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
    } catch {
      // Keep existing posts on error
    }
  }, []);

  useEffect(() => {
    fetchFeed();
    const interval = setInterval(fetchFeed, 30_000);
    return () => clearInterval(interval);
  }, [fetchFeed]);

  const hasMapPoint = useCallback(
    (post: ChannelPost): boolean => {
      const incidentId = `tg-${post.id.replace("/", "-")}`;
      const matched = incidents.find((i) => i.id === incidentId);
      if (matched && matched.lat !== 0 && matched.lng !== 0) return true;
      if (post.lat && post.lng) return true;
      return false;
    },
    [incidents]
  );

  const handlePostClick = useCallback(
    (post: ChannelPost) => {
      const incidentId = `tg-${post.id.replace("/", "-")}`;
      const matchedIncident = incidents.find((i) => i.id === incidentId);

      if (matchedIncident && matchedIncident.lat !== 0 && matchedIncident.lng !== 0) {
        // Has a map marker — open incident card on map
        setExpandedId(null);
        onSelectIncident(matchedIncident);
      } else if (post.lat && post.lng) {
        // Feed has coordinates — create temp incident and show on map
        const msgId = post.id.split("/").pop() || "";
        const media = [];
        if (post.videoUrl) media.push({ type: "video" as const, url: post.videoUrl });
        for (const url of (post.imageUrls || [])) {
          media.push({ type: "image" as const, url });
        }
        setExpandedId(null);
        onSelectIncident({
          id: incidentId,
          date: post.date || new Date().toISOString().split("T")[0],
          timestamp: post.timestamp || new Date().toISOString(),
          location: post.location || "",
          lat: post.lat,
          lng: post.lng,
          description: post.text.slice(0, 200),
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
      } else {
        // No map point — expand inline
        setExpandedId((prev) => (prev === post.id ? null : post.id));
      }
    },
    [incidents, onSelectIncident]
  );

  if (posts.length === 0) return null;

  return (
    <div className="fixed top-14 right-0 w-72 h-[calc(100vh-3.5rem)] bg-[#111] border-l border-[#2a2a2a] z-40 hidden md:flex flex-col">
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
            <span className="animate-pulse absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-500" />
          </span>
          Live Cam
        </button>
      </div>

      {/* Tab content */}
      {tab === "youtube" ? (
        <div className="flex-1 overflow-y-auto">
          {YOUTUBE_VIDEO_IDS.map((vid, i) => (
            <iframe
              key={vid}
              className="w-full aspect-video block"
              src={`https://www.youtube.com/embed/${vid}?autoplay=${i === 0 ? 1 : 0}&mute=1`}
              title={`Live Cam ${i + 1}`}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              frameBorder="0"
            />
          ))}
        </div>
      ) : (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {/* Country filter dropdown */}
          <div className="px-2 py-1.5 border-b border-[#2a2a2a]/50 shrink-0">
            <div className="relative">
              <select
                value={countryFilter.label}
                onChange={(e) => {
                  const f = COUNTRY_FILTERS.find((c) => c.label === e.target.value);
                  if (f) setCountryFilter(f);
                }}
                className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-md px-2 py-1 text-[10px] text-neutral-300 font-semibold uppercase tracking-wider appearance-none cursor-pointer focus:outline-none focus:border-red-500/50 pr-6"
                style={{ fontFamily: "JetBrains Mono, monospace" }}
              >
                {COUNTRY_FILTERS.map((f) => (
                  <option key={f.label} value={f.label}>
                    {f.label === "All" ? "All Countries" : f.label}
                  </option>
                ))}
              </select>
              <svg className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-neutral-500 pointer-events-none" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
              </svg>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto overscroll-contain divide-y divide-[#2a2a2a]/50" style={{ WebkitOverflowScrolling: "touch" }}>
          {posts.filter((p) => matchesCountryFilter(p.text, countryFilter)).map((post) => {
            const isExpanded = expandedId === post.id;
            const onMap = hasMapPoint(post);
            const msgId = post.id.split("/").pop() || "";

            const isNew = newPostIds.has(post.id);

            return (
              <div
                key={post.id}
                className={`${isNew ? "feed-flash" : ""} ${isExpanded ? "" : "max-h-[68px] overflow-hidden"}`}
              >
                {/* Collapsed row — fixed height, uniform size */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    if (onMap) {
                      handlePostClick(post);
                    } else {
                      setExpandedId((prev) => (prev === post.id ? null : post.id));
                    }
                  }}
                  className={`w-full text-left px-3 py-2 hover:bg-[#1a1a1a] transition-colors cursor-pointer ${
                    isExpanded ? "bg-[#1a1a1a]" : ""
                  }`}
                >
                  <div className="flex items-center gap-1.5 mb-1 h-[18px]">
                    {post.videoUrl && (
                      <span className="text-[9px] font-bold uppercase px-1 py-0.5 rounded bg-purple-500/20 text-purple-400 shrink-0">
                        VID
                      </span>
                    )}
                    {(post.imageUrls || []).length > 0 && !post.videoUrl && (
                      <span className="text-[9px] font-bold uppercase px-1 py-0.5 rounded bg-green-500/20 text-green-400 shrink-0">
                        IMG
                      </span>
                    )}
                    {onMap && (
                      <span className="text-[9px] font-bold uppercase px-1 py-0.5 rounded bg-red-500/20 text-red-400 shrink-0">
                        MAP
                      </span>
                    )}
                    <span className="text-neutral-600 text-[10px] ml-auto shrink-0">
                      {post.timestamp
                        ? new Date(post.timestamp).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : post.date}
                    </span>
                  </div>
                  <p className="text-xs text-neutral-300 line-clamp-2 leading-tight">
                    {post.text}
                  </p>
                </div>

                {/* Expanded content — full text + media + source (only on click) */}
                {isExpanded && (
                  <div className="bg-[#0e0e0e] border-t border-[#2a2a2a]/50">
                    {/* Full text */}
                    <div className="px-3 py-2">
                      <p className="text-xs text-neutral-300 whitespace-pre-line leading-relaxed">
                        {post.text}
                      </p>
                    </div>

                    {/* Video */}
                    {post.videoUrl && isDirectVideoUrl(post.videoUrl) && (
                      <video
                        src={post.videoUrl}
                        controls
                        playsInline
                        preload="metadata"
                        className="w-full max-h-[180px] object-contain bg-black"
                      />
                    )}
                    {post.videoUrl && !isDirectVideoUrl(post.videoUrl) && (
                      <div className="px-3 py-2">
                        <a
                          href={post.videoUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] text-red-400 hover:text-red-300 underline underline-offset-2"
                        >
                          Watch video ↗
                        </a>
                      </div>
                    )}

                    {/* Images */}
                    {(post.imageUrls || []).length > 0 && (
                      <div className={`${(post.imageUrls || []).length > 1 ? "grid grid-cols-2 gap-px" : ""}`}>
                        {(post.imageUrls || []).map((url, i) => (
                          <img
                            key={i}
                            src={url}
                            alt=""
                            className="w-full max-h-[160px] object-cover"
                            loading="lazy"
                          />
                        ))}
                      </div>
                    )}

                    {/* Source link */}
                    <div className="px-3 py-2 border-t border-[#2a2a2a]/50">
                      <a
                        href={`https://t.me/${post.channelUsername}/${msgId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] text-neutral-500 hover:text-neutral-300 underline underline-offset-2"
                      >
                        View on Telegram ↗
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
