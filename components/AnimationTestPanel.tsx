"use client";

import { useState } from "react";
import { Incident, MissileAlert } from "@/lib/types";

interface AnimationTestPanelProps {
  onTriggerA10: (incident: Incident) => void;
  onFlashCountry: (country: string) => void;
  onInjectAlert: (alert: MissileAlert) => void;
  onClearAlerts: () => void;
  onToggleSiren: (country: string) => void;
  activeSirenCountries: string[];
}

const MOCK_ID = () => `test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

// Test scenarios
const TEST_SCENARIOS = {
  missile: {
    label: "Missile (Iran → Israel)",
    description: "Red dashed trail + glowing missile SVG flying from Iran to Tel Aviv",
    create: (): MissileAlert => ({
      id: MOCK_ID(),
      postId: "test",
      timestamp: new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
      regions: ["Test - Central Israel"],
      cities: ["Tel Aviv", "Ramat Gan"],
      lat: 32.0853,
      lng: 34.7818,
      originLat: 35.6892,
      originLng: 51.389,
      timeToImpact: 210,
      status: "active" as const,
      rawText: "TEST ALERT",
      threatType: "missile" as const,
    }),
  },
  drone: {
    label: "Drone (Iran → Haifa)",
    description: "Purple dashed trail + drone SVG flying from Tehran, pulse ring on arrival",
    create: (): MissileAlert => ({
      id: MOCK_ID(),
      postId: "test",
      timestamp: new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
      regions: ["Test - Northern Israel"],
      cities: ["Haifa"],
      lat: 32.794,
      lng: 34.9896,
      originLat: 35.6892,
      originLng: 51.389,
      timeToImpact: 480,
      status: "active" as const,
      rawText: "TEST DRONE ALERT",
      threatType: "drone" as const,
    }),
  },
  droneNoOrigin: {
    label: "Drone (no origin, uses fallback)",
    description: "Drone with no originLat/Lng — should use Tehran fallback coords",
    create: (): MissileAlert => ({
      id: MOCK_ID(),
      postId: "test",
      timestamp: new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
      regions: ["Test - Southern Israel"],
      cities: ["Eilat"],
      lat: 29.5577,
      lng: 34.9519,
      originLat: 0,
      originLng: 0,
      timeToImpact: 480,
      status: "active" as const,
      rawText: "TEST DRONE NO ORIGIN",
      threatType: "drone" as const,
    }),
  },
  a10: {
    label: "A-10 BRRT (US strike on Iran)",
    description: "A-10 Warthog flyover + GAU-8 BRRT sound + muzzle flash at target",
    create: (): Incident => ({
      id: MOCK_ID(),
      date: new Date().toISOString().split("T")[0],
      location: "Isfahan, Iran",
      lat: 32.6546,
      lng: 51.668,
      description: "TEST — US airstrike on Iranian facility",
      details: "",
      weapon: "JDAM",
      target_type: "military",
      video_url: "",
      source_url: "",
      source: "telegram" as const,
      side: "us" as const,
      target_military: true,
      timestamp: new Date().toISOString(),
    }),
  },
};

const FLASH_COUNTRIES = [
  "Israel",
  "Palestine",
  "Yemen",
  "Syria",
  "Lebanon",
  "Iraq",
  "Jordan",
  "Saudi Arabia",
  "United Arab Emirates",
  "Kuwait",
  "Qatar",
  "Bahrain",
];

export default function AnimationTestPanel({
  onTriggerA10,
  onFlashCountry,
  onInjectAlert,
  onClearAlerts,
  onToggleSiren,
  activeSirenCountries,
}: AnimationTestPanelProps) {
  const [selectedCountry, setSelectedCountry] = useState("Israel");

  return (
    <div className="fixed top-16 right-4 z-[100] w-80 bg-[#111] border border-yellow-500/50 rounded-lg shadow-2xl overflow-hidden">
      <div className="bg-yellow-500/10 border-b border-yellow-500/30 px-4 py-2 flex items-center justify-between">
        <span
          className="text-yellow-400 text-[10px] font-bold uppercase tracking-wider"
          style={{ fontFamily: "JetBrains Mono, monospace" }}
        >
          Animation Test Panel
        </span>
        <span className="text-yellow-500/50 text-[9px]">Ctrl+Shift+D to close</span>
      </div>

      <div className="p-3 space-y-2 max-h-[70vh] overflow-y-auto">
        {/* Missile test */}
        <Section title="Feature 1 & 2: Missile / Drone Alerts">
          <TestButton
            label={TEST_SCENARIOS.missile.label}
            desc={TEST_SCENARIOS.missile.description}
            color="red"
            onClick={() => onInjectAlert(TEST_SCENARIOS.missile.create())}
          />
          <TestButton
            label={TEST_SCENARIOS.drone.label}
            desc={TEST_SCENARIOS.drone.description}
            color="purple"
            onClick={() => onInjectAlert(TEST_SCENARIOS.drone.create())}
          />
          <TestButton
            label={TEST_SCENARIOS.droneNoOrigin.label}
            desc={TEST_SCENARIOS.droneNoOrigin.description}
            color="purple"
            onClick={() => onInjectAlert(TEST_SCENARIOS.droneNoOrigin.create())}
          />
          <button
            onClick={onClearAlerts}
            className="w-full text-xs text-neutral-500 hover:text-neutral-300 py-1 transition-colors"
          >
            Clear all test alerts
          </button>
        </Section>

        {/* A-10 test */}
        <Section title="Feature 4: A-10 Warthog BRRT">
          <TestButton
            label={TEST_SCENARIOS.a10.label}
            desc={TEST_SCENARIOS.a10.description}
            color="blue"
            onClick={() => onTriggerA10(TEST_SCENARIOS.a10.create())}
          />
        </Section>

        {/* Territory flash test */}
        <Section title="Feature 3: Territory Flash">
          <div className="flex gap-2 items-center mb-1">
            <select
              value={selectedCountry}
              onChange={(e) => setSelectedCountry(e.target.value)}
              className="flex-1 bg-[#1a1a1a] border border-[#333] rounded px-2 py-1 text-xs text-neutral-200"
            >
              {FLASH_COUNTRIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <button
              onClick={() => onFlashCountry(selectedCountry)}
              className="px-3 py-1 rounded bg-red-500/20 border border-red-500/40 text-red-400 text-xs font-medium hover:bg-red-500/30 transition-colors"
            >
              Flash
            </button>
          </div>
          <p className="text-[10px] text-neutral-600">
            Highlights country polygon on map, fades out over 3s
          </p>
        </Section>

        {/* Siren sustained flash test */}
        <Section title="Siren → Sustained Territory Flash">
          <div className="flex gap-2 items-center mb-1">
            <select
              value={selectedCountry}
              onChange={(e) => setSelectedCountry(e.target.value)}
              className="flex-1 bg-[#1a1a1a] border border-[#333] rounded px-2 py-1 text-xs text-neutral-200"
            >
              {FLASH_COUNTRIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <button
              onClick={() => onToggleSiren(selectedCountry)}
              className={`px-3 py-1 rounded border text-xs font-medium transition-colors ${
                activeSirenCountries.includes(selectedCountry)
                  ? "bg-orange-500/30 border-orange-500/60 text-orange-300"
                  : "bg-orange-500/10 border-orange-500/30 text-orange-400 hover:bg-orange-500/20"
              }`}
            >
              {activeSirenCountries.includes(selectedCountry) ? "Stop" : "Siren"}
            </button>
          </div>
          {activeSirenCountries.length > 0 && (
            <p className="text-[10px] text-orange-400">Active: {activeSirenCountries.join(", ")}</p>
          )}
          <p className="text-[10px] text-neutral-600">
            Pulsing red territory while siren is active
          </p>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-[#0d0d0d] border border-[#222] rounded-lg p-2.5">
      <h3
        className="text-[9px] font-bold uppercase tracking-wider text-neutral-500 mb-2"
        style={{ fontFamily: "JetBrains Mono, monospace" }}
      >
        {title}
      </h3>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function TestButton({
  label,
  desc,
  color,
  onClick,
}: {
  label: string;
  desc: string;
  color: "red" | "purple" | "blue";
  onClick: () => void;
}) {
  const colors = {
    red: "bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20",
    purple: "bg-purple-500/10 border-purple-500/30 text-purple-400 hover:bg-purple-500/20",
    blue: "bg-blue-500/10 border-blue-500/30 text-blue-400 hover:bg-blue-500/20",
  };

  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-2 rounded border ${colors[color]} transition-colors`}
    >
      <div className="text-xs font-medium">{label}</div>
      <div className="text-[10px] text-neutral-500 mt-0.5">{desc}</div>
    </button>
  );
}
