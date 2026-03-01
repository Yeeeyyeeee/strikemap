"use client";

import { memo } from "react";
import { UserSettings } from "@/lib/settings";

interface SettingsPanelProps {
  settings: UserSettings;
  onChange: (settings: UserSettings) => void;
}

export default memo(function SettingsPanel({ settings, onChange }: SettingsPanelProps) {
  const update = (patch: Partial<UserSettings>) => onChange({ ...settings, ...patch });

  return (
    <div className="fixed top-14 left-0 right-0 z-45 settings-panel">
      <div className="bg-[#111]/95 backdrop-blur-md border-b border-[#2a2a2a] px-4 md:px-6 py-4">
        <div className="max-w-5xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">

          {/* Date Filter */}
          <div>
            <h3
              className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-3"
              style={{ fontFamily: "JetBrains Mono, monospace" }}
            >
              Show Strikes Since
            </h3>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={settings.dateFrom || ""}
                onChange={(e) => update({ dateFrom: e.target.value || null })}
                className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-3 py-1.5 text-xs text-neutral-300 focus:outline-none focus:border-red-500/50 w-full"
                style={{ colorScheme: "dark" }}
              />
              {settings.dateFrom && (
                <button
                  onClick={() => update({ dateFrom: null })}
                  className="text-[10px] text-neutral-500 hover:text-red-400 whitespace-nowrap transition-colors"
                >
                  Show All
                </button>
              )}
            </div>
          </div>

          {/* Marker Size */}
          <div>
            <h3
              className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-3"
              style={{ fontFamily: "JetBrains Mono, monospace" }}
            >
              Marker Size — {settings.markerSize.toFixed(1)}x
            </h3>
            <input
              type="range"
              min="0.5"
              max="2"
              step="0.1"
              value={settings.markerSize}
              onChange={(e) => update({ markerSize: parseFloat(e.target.value) })}
              className="settings-slider w-full"
            />
            <div className="flex justify-between text-[9px] text-neutral-600 mt-1">
              <span>0.5x</span>
              <span>2.0x</span>
            </div>
          </div>

          {/* Marker Opacity */}
          <div>
            <h3
              className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-3"
              style={{ fontFamily: "JetBrains Mono, monospace" }}
            >
              Marker Opacity — {Math.round(settings.markerOpacity * 100)}%
            </h3>
            <input
              type="range"
              min="0.3"
              max="1"
              step="0.05"
              value={settings.markerOpacity}
              onChange={(e) => update({ markerOpacity: parseFloat(e.target.value) })}
              className="settings-slider w-full"
            />
            <div className="flex justify-between text-[9px] text-neutral-600 mt-1">
              <span>30%</span>
              <span>100%</span>
            </div>
          </div>

          {/* Toggles */}
          <div>
            <h3
              className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-3"
              style={{ fontFamily: "JetBrains Mono, monospace" }}
            >
              Display Options
            </h3>
            <div className="space-y-2">
              <ToggleRow label="Gauges" checked={settings.showGauges} onChange={(v) => update({ showGauges: v })} />
              <ToggleRow label="Feed Sidebar" checked={settings.showFeed} onChange={(v) => update({ showFeed: v })} />
              <ToggleRow label="Legend" checked={settings.showLegend} onChange={(v) => update({ showLegend: v })} />
              <ToggleRow label="Sound Effects" checked={settings.soundEnabled} onChange={(v) => update({ soundEnabled: v })} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between cursor-pointer group">
      <span className="text-xs text-neutral-400 group-hover:text-neutral-300 transition-colors">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative w-8 h-[18px] rounded-full transition-colors ${
          checked ? "bg-red-500/60" : "bg-[#2a2a2a]"
        }`}
      >
        <span
          className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white transition-transform ${
            checked ? "left-[16px]" : "left-[2px]"
          }`}
        />
      </button>
    </label>
  );
}
