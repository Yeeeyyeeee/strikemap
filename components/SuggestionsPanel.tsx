"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";

interface Suggestion {
  id: string;
  title: string;
  device: "desktop" | "mobile" | "all";
  description: string;
  status: "wip" | "completed";
  votes: number;
  voterIds: string[];
  createdAt: number;
  nickname: string;
}

function getOrCreateVoterId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem("strikemap-voter-id");
  if (!id) {
    id = `v-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem("strikemap-voter-id", id);
  }
  return id;
}

function getOrCreateNickname(): string {
  if (typeof window === "undefined") return "Anon";
  let nick = sessionStorage.getItem("strikemap-chat-nick");
  if (!nick) {
    const hex = Math.random().toString(16).slice(2, 6).toUpperCase();
    nick = `Anon-${hex}`;
    sessionStorage.setItem("strikemap-chat-nick", nick);
  }
  return nick;
}

function relativeTime(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return "now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

const DEVICE_BADGE: Record<string, { label: string; cls: string }> = {
  desktop: { label: "Desktop", cls: "bg-purple-500/20 text-purple-400" },
  mobile: { label: "Mobile", cls: "bg-green-500/20 text-green-400" },
  all: { label: "Both", cls: "bg-neutral-700 text-neutral-400" },
};

/**
 * Sorting: completed ("Deployed") at the bottom,
 * then first 3 slots are the most recent (by createdAt desc),
 * remaining slots sorted by vote count desc.
 */
function sortSuggestions(arr: Suggestion[]): Suggestion[] {
  const active = arr.filter((s) => s.status !== "completed");
  const deployed = arr.filter((s) => s.status === "completed");

  const byRecent = [...active].sort((a, b) => b.createdAt - a.createdAt);
  const recentThree = byRecent.slice(0, 3);
  const recentIds = new Set(recentThree.map((s) => s.id));

  const rest = active
    .filter((s) => !recentIds.has(s.id))
    .sort((a, b) => {
      if (b.votes !== a.votes) return b.votes - a.votes;
      return b.createdAt - a.createdAt;
    });

  const sortedDeployed = [...deployed].sort((a, b) => b.createdAt - a.createdAt);

  return [...recentThree, ...rest, ...sortedDeployed];
}

export default function SuggestionsPanel() {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [device, setDevice] = useState<"desktop" | "mobile" | "all">("all");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [votingId, setVotingId] = useState<string | null>(null);
  const voterId = useRef(getOrCreateVoterId());
  const nickname = useRef(getOrCreateNickname());

  const fetchSuggestions = useCallback(async () => {
    try {
      const res = await fetch("/api/suggestions");
      const data = await res.json();
      if (data.suggestions) setSuggestions(data.suggestions);
    } catch {/* keep existing */}
  }, []);

  useEffect(() => {
    fetchSuggestions();
    const iv = setInterval(fetchSuggestions, 10_000);
    return () => clearInterval(iv);
  }, [fetchSuggestions]);

  const sorted = useMemo(() => sortSuggestions(suggestions), [suggestions]);

  const handleSubmit = useCallback(async () => {
    if (!title.trim() || !description.trim() || submitting) return;
    setSubmitting(true);
    try {
      await fetch("/api/suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add",
          title: title.trim(),
          device,
          description: description.trim(),
          nickname: nickname.current,
        }),
      });
      setTitle("");
      setDescription("");
      setShowForm(false);
      await fetchSuggestions();
    } catch {/* ignore */}
    setSubmitting(false);
  }, [title, description, device, submitting, fetchSuggestions]);

  const handleVote = useCallback(async (id: string) => {
    if (votingId) return;
    setVotingId(id);
    try {
      const res = await fetch("/api/suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "vote", id, voterId: voterId.current }),
      });
      if (res.ok) {
        setSuggestions((prev) =>
          prev.map((s) =>
            s.id === id
              ? { ...s, votes: s.votes + 1, voterIds: [...s.voterIds, voterId.current] }
              : s
          )
        );
      }
    } catch {/* ignore */}
    setVotingId(null);
  }, [votingId]);

  const hasVoted = (sug: Suggestion) => sug.voterIds.includes(voterId.current);

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      {/* Suggestion list */}
      <div className="flex-1 overflow-y-auto overscroll-contain px-3 md:px-2 py-2 space-y-2">
        {sorted.length === 0 && !showForm && (
          <div className="text-neutral-600 text-sm md:text-xs text-center mt-8">
            No suggestions yet. Be the first!
          </div>
        )}
        {sorted.map((sug) => {
          const voted = hasVoted(sug);
          const badge = DEVICE_BADGE[sug.device] || DEVICE_BADGE.all;
          const isDeployed = sug.status === "completed";
          return (
            <div
              key={sug.id}
              className={`rounded-lg p-3 ${
                isDeployed
                  ? "bg-[#111] border border-green-500/20 opacity-60"
                  : "bg-[#151515] border border-[#2a2a2a]"
              }`}
            >
              <div className="flex items-start gap-2">
                {/* Vote button */}
                <button
                  onClick={() => !voted && !isDeployed && handleVote(sug.id)}
                  disabled={voted || isDeployed || votingId === sug.id}
                  className={`flex flex-col items-center pt-0.5 shrink-0 transition-colors ${
                    isDeployed
                      ? "text-green-500/50 cursor-default"
                      : voted
                        ? "text-red-400 cursor-default"
                        : "text-neutral-600 hover:text-red-400 cursor-pointer"
                  }`}
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 4l-8 8h5v8h6v-8h5z" />
                  </svg>
                  <span className="text-[10px] font-bold">{sug.votes}</span>
                </button>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap mb-1">
                    <span className={`text-sm md:text-xs font-semibold break-words ${isDeployed ? "text-neutral-500 line-through" : "text-neutral-200"}`}>
                      {sug.title}
                    </span>
                    <span className={`text-[8px] font-bold uppercase px-1 py-0.5 rounded ${badge.cls}`}>
                      {badge.label}
                    </span>
                    <span className={`text-[8px] font-bold uppercase px-1 py-0.5 rounded ${
                      isDeployed
                        ? "bg-green-500/20 text-green-400"
                        : "bg-amber-500/20 text-amber-400"
                    }`}>
                      {isDeployed ? "Deployed" : "WIP"}
                    </span>
                  </div>
                  <p className={`text-xs md:text-[11px] leading-snug line-clamp-3 mb-1.5 ${isDeployed ? "text-neutral-600" : "text-neutral-400"}`}>
                    {sug.description}
                  </p>
                  <div className="flex items-center gap-2 text-[10px] text-neutral-600">
                    <span>{sug.nickname}</span>
                    <span>{relativeTime(sug.createdAt)}</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* New suggestion form / button */}
      <div className="border-t border-[#2a2a2a] bg-[#0a0a0a] md:bg-[#1a1a1a]">
        {showForm ? (
          <div className="p-3 md:p-2 space-y-2">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Title"
              maxLength={100}
              className="w-full bg-[#111] border border-[#2a2a2a] rounded-md px-2 py-1.5 text-xs text-neutral-300 placeholder-neutral-600 outline-none focus:border-neutral-500"
            />
            <div className="flex gap-1">
              {(["desktop", "mobile", "all"] as const).map((d) => (
                <button
                  key={d}
                  onClick={() => setDevice(d)}
                  className={`flex-1 px-2 py-1 text-[10px] font-semibold uppercase rounded-md border transition-colors ${
                    device === d
                      ? "bg-red-500/20 text-red-400 border-red-500/30"
                      : "text-neutral-500 border-[#2a2a2a] hover:text-neutral-300"
                  }`}
                >
                  {d === "all" ? "Both" : d}
                </button>
              ))}
            </div>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe your suggestion..."
              maxLength={1000}
              rows={3}
              className="w-full bg-[#111] border border-[#2a2a2a] rounded-md px-2 py-1.5 text-xs text-neutral-300 placeholder-neutral-600 outline-none focus:border-neutral-500 resize-none"
            />
            <div className="flex gap-1.5">
              <button
                onClick={() => setShowForm(false)}
                className="flex-1 px-2 py-1.5 text-xs font-medium text-neutral-500 border border-[#2a2a2a] rounded-md hover:text-neutral-300 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={!title.trim() || !description.trim() || submitting}
                className="flex-1 px-2 py-1.5 text-xs font-medium bg-red-500/20 text-red-400 border border-red-500/30 rounded-md hover:bg-red-500/30 disabled:opacity-40 transition-colors"
              >
                {submitting ? "Sending..." : "Submit"}
              </button>
            </div>
          </div>
        ) : (
          <div className="p-2">
            <button
              onClick={() => setShowForm(true)}
              className="w-full px-3 py-2 text-xs font-semibold uppercase tracking-wider bg-red-500/20 text-red-400 border border-red-500/30 rounded-md hover:bg-red-500/30 transition-colors"
              style={{ fontFamily: "JetBrains Mono, monospace" }}
            >
              + New Suggestion
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
