"use client";

import { memo } from "react";
import { UserSettings } from "@/lib/settings";

const SIREN_COUNTRIES = ["Israel", "Iran", "Lebanon", "Syria", "Iraq", "Yemen", "Gaza"];

interface SettingsPanelProps {
  settings: UserSettings;
  onChange: (settings: UserSettings) => void;
}

export default memo(function SettingsPanel({ settings, onChange }: SettingsPanelProps) {
  const update = (patch: Partial<UserSettings>) => onChange({ ...settings, ...patch });

  return (
    <div className="fixed top-14 left-0 right-0 z-45 settings-panel">
      <div className="bg-[#111] border-b border-[#2a2a2a] px-4 md:px-6 py-4">
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

              <ToggleRow label="Legend" checked={settings.showLegend} onChange={(v) => update({ showLegend: v })} />
              <ToggleRow label="Sound Effects" checked={settings.soundEnabled} onChange={(v) => update({ soundEnabled: v })} />
              <ToggleRow label="Notifications" checked={settings.notificationsEnabled} onChange={(v) => update({ notificationsEnabled: v })} />
            </div>
          </div>

          {/* Siren Country Filter */}
          <div className="sm:col-span-2 lg:col-span-1">
            <h3
              className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-3"
              style={{ fontFamily: "JetBrains Mono, monospace" }}
            >
              Siren Alerts For
            </h3>
            <div className="relative">
              <select
                value={(() => {
                  const ac = settings.alertCountries;
                  if (!ac || ac === "all") return "all";
                  if (Array.isArray(ac) && ac.length === 1) return ac[0];
                  return "all";
                })()}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === "all") {
                    update({ alertCountries: "all" });
                  } else {
                    update({ alertCountries: [val] });
                  }
                }}
                className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-3 py-1.5 text-xs text-neutral-300 font-semibold uppercase tracking-wider appearance-none cursor-pointer focus:outline-none focus:border-red-500/50 pr-8"
                style={{ fontFamily: "JetBrains Mono, monospace", colorScheme: "dark" }}
              >
                <option value="all">All Countries</option>
                {SIREN_COUNTRIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <svg className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500 pointer-events-none" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
              </svg>
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
