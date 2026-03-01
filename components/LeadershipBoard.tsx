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
      ? "w-48 h-48 md:w-56 md:h-56"
      : leader.tier === 2
        ? "w-36 h-36 md:w-44 md:h-44"
        : "w-32 h-32 md:w-40 md:h-40";

  return (
    <div className="flex flex-col items-center gap-2 group">
      {/* Image container */}
      <div className={`relative ${tierSize} rounded-lg overflow-hidden border-2 ${
        leader.dead
          ? "border-red-600/80 shadow-[0_0_20px_rgba(239,68,68,0.3)]"
          : "border-neutral-700 group-hover:border-neutral-500"
      } transition-all`}>
        {/* Photo or initials */}
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

        {/* DEAD — huge red X overlay */}
        {leader.dead && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <svg
              viewBox="0 0 100 100"
              className="w-[90%] h-[90%] drop-shadow-[0_0_12px_rgba(239,68,68,0.8)]"
            >
              <line
                x1="10" y1="10" x2="90" y2="90"
                stroke="#dc2626"
                strokeWidth="10"
                strokeLinecap="round"
              />
              <line
                x1="90" y1="10" x2="10" y2="90"
                stroke="#dc2626"
                strokeWidth="10"
                strokeLinecap="round"
              />
            </svg>
          </div>
        )}

        {/* Status badge */}
        {leader.dead && (
          <div className="absolute bottom-0 left-0 right-0 bg-red-900/90 text-red-300 text-[10px] font-bold uppercase tracking-widest text-center py-1">
            ELIMINATED
          </div>
        )}
      </div>

      {/* Name & role */}
      <div className="text-center max-w-[200px]">
        <p className={`font-semibold text-sm ${leader.dead ? "text-red-400 line-through decoration-red-600/60" : "text-neutral-200"}`}>
          {leader.name}
        </p>
        <p className="text-[11px] text-neutral-500 leading-tight mt-0.5">
          {leader.role}
        </p>
        {leader.dead && leader.deathDate && (
          <p className="text-[10px] text-red-500/70 mt-1">
            {leader.deathDate}
          </p>
        )}
        {leader.dead && leader.deathCause && (
          <p className="text-[10px] text-neutral-600 italic">
            {leader.deathCause}
          </p>
        )}
      </div>
    </div>
  );
}

function TierSection({
  title,
  lineColor,
  textColor,
  leaders,
}: {
  title: string;
  lineColor: string;
  textColor: string;
  leaders: Leader[];
}) {
  if (leaders.length === 0) return null;
  return (
    <section className="mb-12">
      <div className="flex items-center gap-2 mb-6 justify-center">
        <div className="h-px flex-1 max-w-[80px] bg-gradient-to-r from-transparent" style={{ backgroundImage: `linear-gradient(to right, transparent, ${lineColor})` }} />
        <span className="text-[10px] font-bold tracking-[0.3em] uppercase" style={{ color: textColor }}>
          {title}
        </span>
        <div className="h-px flex-1 max-w-[80px]" style={{ backgroundImage: `linear-gradient(to left, transparent, ${lineColor})` }} />
      </div>
      <div className="flex flex-wrap justify-center gap-6 md:gap-8">
        {leaders.map((l) => (
          <LeaderCard key={l.id} leader={l} />
        ))}
      </div>
    </section>
  );
}

export default function LeadershipBoard() {
  const [leaders, setLeaders] = useState<Leader[]>([]);
  const [loading, setLoading] = useState(true);

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
    // Auto-refresh every 2 minutes
    const interval = setInterval(fetchLeaders, 2 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchLeaders]);

  const tier1 = leaders.filter((l) => l.tier === 1);
  const tier2 = leaders.filter((l) => l.tier === 2);
  const tier3 = leaders.filter((l) => l.tier === 3);
  const deadCount = leaders.filter((l) => l.dead).length;

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
      <div className="text-center mb-10">
        <h2
          className="text-2xl md:text-3xl font-bold tracking-wider"
          style={{ fontFamily: "JetBrains Mono, monospace" }}
        >
          <span className="text-red-500">IRANIAN</span>{" "}
          <span className="text-neutral-300">LEADERSHIP</span>
        </h2>
        <p className="text-neutral-500 text-xs mt-2 tracking-widest uppercase">
          Regime hierarchy &bull; {deadCount} eliminated
        </p>
        <p className="text-neutral-700 text-[10px] mt-1 tracking-wider">
          Auto-updated from Telegram intel
        </p>
      </div>

      <TierSection title="Supreme Leadership" lineColor="rgba(239,68,68,0.4)" textColor="rgba(239,68,68,0.8)" leaders={tier1} />
      <TierSection title="Senior Officials" lineColor="rgba(249,115,22,0.4)" textColor="rgba(249,115,22,0.8)" leaders={tier2} />
      <TierSection title="Eliminated Commanders" lineColor="rgba(163,163,163,0.4)" textColor="rgb(163,163,163)" leaders={tier3} />
    </div>
  );
}
