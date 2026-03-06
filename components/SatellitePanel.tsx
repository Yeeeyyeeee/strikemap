"use client";

interface SatellitePanelProps {
  counts: { total: number; correlated: number; uncorrelated: number };
  loading: boolean;
  onClose: () => void;
}

export default function SatellitePanel({ counts, loading, onClose }: SatellitePanelProps) {
  return (
    <div className="fixed top-16 bottom-4 left-4 z-40 hidden md:flex flex-col gap-3 overflow-y-auto overflow-x-hidden scrollbar-hide w-60 isolate">
      {/* Header */}
      <div className="bg-[#1a1a1a] border border-orange-500/30 rounded-lg overflow-hidden">
        <div className="px-3 py-2 flex items-center justify-between border-b border-[#2a2a2a]">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-orange-400" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 23c-4.97 0-8-3.03-8-7 0-2.5 1.5-5 3-6.5.5-.5 1.5-.5 1.5.5 0 1.5.5 3 2 4 0-4 2-7 5.5-9.5.5-.5 1.5 0 1.5.5 0 3 1 5.5 2 7.5.5 1 1 2 1 3.5 0 3.97-3.03 7-8.5 7z" />
            </svg>
            <span
              className="text-[10px] font-bold uppercase tracking-wider text-orange-400"
              style={{ fontFamily: "JetBrains Mono, monospace" }}
            >
              Satellite Intel
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-red-400/70 hover:text-red-400 transition-colors"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="px-3 py-3 space-y-3">
          <p className="text-[11px] text-neutral-400 leading-relaxed">
            Real-time thermal anomaly detection via NASA FIRMS satellite data. Orange dots = unconfirmed heat signatures. Red dots = correlated with known strike incidents.
          </p>
        </div>
      </div>

      {/* Thermal Stats */}
      <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-3 space-y-2">
        <div
          className="text-[9px] font-semibold text-neutral-500 uppercase tracking-wider"
          style={{ fontFamily: "JetBrains Mono, monospace" }}
        >
          Thermal Detections
        </div>
        {loading ? (
          <div className="flex items-center gap-2 py-2">
            <div className="w-3 h-3 border border-orange-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-[11px] text-neutral-500">Scanning...</span>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            <div className="text-center">
              <div className="text-lg font-bold text-orange-400" style={{ fontFamily: "JetBrains Mono, monospace" }}>
                {counts.total}
              </div>
              <div className="text-[9px] text-neutral-500 uppercase">Total</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-red-400" style={{ fontFamily: "JetBrains Mono, monospace" }}>
                {counts.correlated}
              </div>
              <div className="text-[9px] text-neutral-500 uppercase">Confirmed</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-neutral-400" style={{ fontFamily: "JetBrains Mono, monospace" }}>
                {counts.uncorrelated}
              </div>
              <div className="text-[9px] text-neutral-500 uppercase">Unknown</div>
            </div>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-3 space-y-2">
        <div
          className="text-[9px] font-semibold text-neutral-500 uppercase tracking-wider"
          style={{ fontFamily: "JetBrains Mono, monospace" }}
        >
          Map Legend
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full shrink-0 shadow-[0_0_6px_rgba(239,68,68,0.6)]" style={{ backgroundColor: "#ef4444" }} />
            <span className="text-[11px] text-neutral-300">Confirmed strike thermal</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full shrink-0 shadow-[0_0_6px_rgba(249,115,22,0.6)]" style={{ backgroundColor: "#f97316" }} />
            <span className="text-[11px] text-neutral-300">Unconfirmed heat anomaly</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full shrink-0 border border-neutral-600" />
            <span className="text-[11px] text-neutral-400">Dot size = fire radiative power</span>
          </div>
        </div>
      </div>

      {/* Data source */}
      <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-3 space-y-2">
        <div
          className="text-[9px] font-semibold text-neutral-500 uppercase tracking-wider"
          style={{ fontFamily: "JetBrains Mono, monospace" }}
        >
          Data Sources
        </div>
        <div className="space-y-1.5 text-[10px] text-neutral-400">
          <div className="flex items-start gap-2">
            <span className="text-orange-400 mt-0.5">1.</span>
            <span><span className="text-neutral-300 font-medium">NASA FIRMS</span> — VIIRS satellite thermal detection, updated every ~12 min</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-orange-400 mt-0.5">2.</span>
            <span><span className="text-neutral-300 font-medium">Sentinel Hub</span> — Before/after satellite photos (click an incident to see)</span>
          </div>
        </div>
      </div>

      {/* Tip */}
      <div className="bg-[#111] border border-[#2a2a2a] rounded-lg px-3 py-2">
        <p className="text-[10px] text-neutral-500 leading-relaxed">
          Click any incident marker on the map to see satellite before/after imagery when available.
        </p>
      </div>
    </div>
  );
}
