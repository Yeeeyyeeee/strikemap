"use client";

import { useState, useEffect, useCallback } from "react";

interface Leader {
  id: string;
  name: string;
  role: string;
  tier: 1 | 2 | 3;
  dead: boolean;
  deathDate?: string;
  deathCause?: string;
  imageUrl?: string;
  faction?: "iran" | "hezbollah" | "us" | "israel";
}

function Initials({ name }: { name: string }) {
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2);
  return (
    <div className="w-full h-full flex items-center justify-center bg-neutral-800 text-neutral-400 text-2xl font-bold select-none">
      {initials}
    </div>
  );
}

function LeaderCard({ leader }: { leader: Leader }) {
  const tierSize =
    leader.tier === 1
      ? "w-40 h-40 md:w-48 md:h-48"
      : leader.tier === 2
        ? "w-32 h-32 md:w-40 md:h-40"
        : "w-28 h-28 md:w-36 md:h-36";

  return (
    <div className="flex flex-col items-center gap-2 group">
      <div
        className={`relative ${tierSize} rounded-lg overflow-hidden border-2 ${
          leader.dead
            ? "border-red-600/80 shadow-[0_0_20px_rgba(239,68,68,0.3)]"
            : "border-neutral-700 group-hover:border-neutral-500"
        } transition-all`}
      >
        {leader.imageUrl ? (
          <img
            src={leader.imageUrl}
            alt={leader.name}
            className={`w-full h-full object-cover ${leader.dead ? "grayscale brightness-50" : ""}`}
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
              (e.target as HTMLImageElement).nextElementSibling?.classList.remove("hidden");
            }}
          />
        ) : null}
        <div className={leader.imageUrl ? "hidden w-full h-full" : "w-full h-full"}>
          <Initials name={leader.name} />
        </div>

        {leader.dead && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <svg
              viewBox="0 0 100 100"
              className="w-[90%] h-[90%] drop-shadow-[0_0_12px_rgba(239,68,68,0.8)]"
            >
              <line
                x1="10"
                y1="10"
                x2="90"
                y2="90"
                stroke="#dc2626"
                strokeWidth="10"
                strokeLinecap="round"
              />
              <line
                x1="90"
                y1="10"
                x2="10"
                y2="90"
                stroke="#dc2626"
                strokeWidth="10"
                strokeLinecap="round"
              />
            </svg>
          </div>
        )}

        {leader.dead && (
          <div className="absolute bottom-0 left-0 right-0 bg-red-900/90 text-red-300 text-[10px] font-bold uppercase tracking-widest text-center py-1">
            ELIMINATED
          </div>
        )}
      </div>

      <div className="text-center max-w-[180px]">
        <p
          className={`font-semibold text-sm ${leader.dead ? "text-red-400 line-through decoration-red-600/60" : "text-neutral-200"}`}
        >
          {leader.name}
        </p>
        <p className="text-[11px] text-neutral-500 leading-tight mt-0.5">{leader.role}</p>
        {leader.dead && leader.deathDate && (
          <p className="text-[10px] text-red-500/70 mt-1">{leader.deathDate}</p>
        )}
        {leader.dead && leader.deathCause && (
          <p className="text-[10px] text-neutral-600 italic">{leader.deathCause}</p>
        )}
      </div>
    </div>
  );
}

interface FactionConfig {
  key: string;
  label: string;
  subtitle: string;
  color: string;
  bgColor: string;
  borderColor: string;
}

const FACTIONS: FactionConfig[] = [
  {
    key: "iran",
    label: "IRAN",
    subtitle: "Islamic Republic & IRGC",
    color: "#ef4444",
    bgColor: "rgba(239,68,68,0.1)",
    borderColor: "rgba(239,68,68,0.3)",
  },
  {
    key: "hezbollah",
    label: "AXIS OF RESISTANCE",
    subtitle: "Hezbollah, Hamas & Proxies",
    color: "#22c55e",
    bgColor: "rgba(34,197,94,0.1)",
    borderColor: "rgba(34,197,94,0.3)",
  },
  {
    key: "israel",
    label: "ISRAEL",
    subtitle: "IDF & Intelligence Services",
    color: "#3b82f6",
    bgColor: "rgba(59,130,246,0.1)",
    borderColor: "rgba(59,130,246,0.3)",
  },
  {
    key: "us",
    label: "UNITED STATES",
    subtitle: "Administration & Military Command",
    color: "#a78bfa",
    bgColor: "rgba(167,139,250,0.1)",
    borderColor: "rgba(167,139,250,0.3)",
  },
];

function FactionSection({ config, leaders }: { config: FactionConfig; leaders: Leader[] }) {
  if (leaders.length === 0) return null;
  const deadCount = leaders.filter((l) => l.dead).length;
  const tier1 = leaders.filter((l) => l.tier === 1);
  const tier2 = leaders.filter((l) => l.tier === 2);
  const tier3 = leaders.filter((l) => l.tier === 3);

  return (
    <section className="mb-10">
      {/* Faction header */}
      <div
        className="rounded-lg px-5 py-3 mb-6 border"
        style={{ backgroundColor: config.bgColor, borderColor: config.borderColor }}
      >
        <div className="flex items-center justify-between">
          <div>
            <h3
              className="text-sm font-bold tracking-widest uppercase"
              style={{ color: config.color, fontFamily: "JetBrains Mono, monospace" }}
            >
              {config.label}
            </h3>
            <p className="text-[10px] text-neutral-500 tracking-wider mt-0.5">{config.subtitle}</p>
          </div>
          <div className="flex items-center gap-3 text-[10px] tracking-wider">
            <span className="text-neutral-500">{leaders.length} figures</span>
            {deadCount > 0 && (
              <span className="text-red-400 font-bold">{deadCount} eliminated</span>
            )}
          </div>
        </div>
      </div>

      {/* Leader tiers */}
      {tier1.length > 0 && (
        <div className="flex flex-wrap justify-center gap-6 md:gap-8 mb-6">
          {tier1.map((l) => (
            <LeaderCard key={l.id} leader={l} />
          ))}
        </div>
      )}
      {tier2.length > 0 && (
        <div className="flex flex-wrap justify-center gap-4 md:gap-6 mb-6">
          {tier2.map((l) => (
            <LeaderCard key={l.id} leader={l} />
          ))}
        </div>
      )}
      {tier3.length > 0 && (
        <div className="flex flex-wrap justify-center gap-4 md:gap-6 mb-4">
          {tier3.map((l) => (
            <LeaderCard key={l.id} leader={l} />
          ))}
        </div>
      )}
    </section>
  );
}

type FactionFilter = "all" | "iran" | "hezbollah" | "us" | "israel";

const FILTER_OPTIONS: { key: FactionFilter; label: string; color: string }[] = [
  { key: "all", label: "All", color: "neutral" },
  { key: "iran", label: "Iran", color: "red" },
  { key: "hezbollah", label: "Proxies", color: "green" },
  { key: "israel", label: "Israel", color: "blue" },
  { key: "us", label: "USA", color: "purple" },
];

export default function LeadershipBoard() {
  const [leaders, setLeaders] = useState<Leader[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FactionFilter>("all");

  const fetchLeaders = useCallback(async () => {
    try {
      const res = await fetch("/api/leadership");
      const data = await res.json();
      if (data.leaders) setLeaders(data.leaders);
    } catch (err) {
      console.error("Failed to fetch leadership data:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLeaders();
    const interval = setInterval(fetchLeaders, 2 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchLeaders]);

  const totalDead = leaders.filter((l) => l.dead).length;

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-[#0a0a0a]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
          <span
            className="text-neutral-500 text-sm tracking-wider"
            style={{ fontFamily: "JetBrains Mono, monospace" }}
          >
            LOADING LEADERSHIP DATA...
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-[#0a0a0a] px-4 md:px-8 py-8">
      {/* Title */}
      <div className="text-center mb-6">
        <h2
          className="text-2xl md:text-3xl font-bold tracking-wider"
          style={{ fontFamily: "JetBrains Mono, monospace" }}
        >
          <span className="text-red-500">CONFLICT</span>{" "}
          <span className="text-neutral-300">LEADERSHIP</span>
        </h2>
        <p className="text-neutral-500 text-xs mt-2 tracking-widest uppercase">
          All parties &bull; {leaders.length} figures &bull; {totalDead} eliminated
        </p>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center justify-center gap-1 mb-8 flex-wrap">
        {FILTER_OPTIONS.map((opt) => {
          const active = filter === opt.key;
          const colorMap: Record<string, string> = {
            neutral: active
              ? "bg-neutral-700 text-white"
              : "text-neutral-500 hover:text-neutral-300",
            red: active
              ? "bg-red-500/20 text-red-400 border border-red-500/30"
              : "text-neutral-500 hover:text-neutral-300",
            green: active
              ? "bg-green-500/20 text-green-400 border border-green-500/30"
              : "text-neutral-500 hover:text-neutral-300",
            blue: active
              ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
              : "text-neutral-500 hover:text-neutral-300",
            purple: active
              ? "bg-purple-500/20 text-purple-400 border border-purple-500/30"
              : "text-neutral-500 hover:text-neutral-300",
          };
          return (
            <button
              key={opt.key}
              onClick={() => setFilter(opt.key)}
              className={`px-4 py-1.5 text-xs font-medium rounded-lg transition-colors ${colorMap[opt.color]}`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      {/* Faction sections */}
      {FACTIONS.filter((c) => filter === "all" || c.key === filter).map((config) => (
        <FactionSection
          key={config.key}
          config={config}
          leaders={leaders.filter((l) => (l.faction || "iran") === config.key)}
        />
      ))}
    </div>
  );
}
