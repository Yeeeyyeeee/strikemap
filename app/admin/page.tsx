"use client";

import { useState, useEffect, useCallback } from "react";
import { extractYouTubeId } from "@/lib/videoUtils";

interface LiveCam {
  id: string;
  label: string;
}

interface Speech {
  id: string;
  title: string;
  enabled: boolean;
}

interface YTConfig {
  liveCams: LiveCam[];
  speech: Speech;
}

function extractVideoId(input: string): string {
  return extractYouTubeId(input) || input.trim();
}

// ─── Login Screen ───────────────────────────────────────────────
function LoginScreen({ onAuth }: { onAuth: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        onAuth();
      } else {
        setError("Wrong password");
      }
    } catch {
      setError("Connection error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
      <div className="w-full max-w-xs">
        <h1
          className="text-xs font-bold uppercase tracking-wider text-neutral-500 text-center mb-6"
          style={{ fontFamily: "JetBrains Mono, monospace" }}
        >
          Admin Login
        </h1>
        <div className="bg-[#151515] border border-[#2a2a2a] rounded-lg p-5 space-y-4">
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            autoFocus
            className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-md px-3 py-2.5 text-sm text-neutral-200 placeholder-neutral-600 outline-none focus:border-neutral-500 transition-colors"
          />
          {error && (
            <p className="text-red-400 text-xs text-center">{error}</p>
          )}
          <button
            onClick={submit}
            disabled={loading || !password}
            className="w-full py-2.5 bg-red-500/20 text-red-400 border border-red-500/30 rounded-md text-sm font-medium hover:bg-red-500/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? "..." : "Log in"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Siren Alert Type (client-side mirror) ──────────────────────
interface SirenAlertInfo {
  id: string;
  country: string;
  activatedAt: number;
  lastSeenAt: number;
  sourceChannel: string;
  sourceText: string;
  status: string;
}

// ─── Missile Alert Type (client-side mirror) ─────────────────────
interface MissileAlertInfo {
  id: string;
  timestamp: string;
  cities: string[];
  lat: number;
  lng: number;
  timeToImpact: number;
  threatType?: string;
  rawText: string;
}

// ─── Main Admin Page ────────────────────────────────────────────
export default function AdminPage() {
  const [authed, setAuthed] = useState<boolean | null>(null); // null = checking
  const [config, setConfig] = useState<YTConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [newLabel, setNewLabel] = useState("");

  // Siren alerts state
  const [sirenAlerts, setSirenAlerts] = useState<SirenAlertInfo[]>([]);
  const [sirenLoading, setSirenLoading] = useState(false);
  const [newSirenCountry, setNewSirenCountry] = useState("");

  // Missile alerts state
  const [missileAlerts, setMissileAlerts] = useState<MissileAlertInfo[]>([]);
  const [missileLoading, setMissileLoading] = useState(false);
  const [missileTarget, setMissileTarget] = useState("");
  const [missileThreat, setMissileThreat] = useState<"missile" | "drone">("missile");
  const [missileTTI, setMissileTTI] = useState(90);

  // Shared alert error banner
  const [alertError, setAlertError] = useState("");

  // Check existing session on mount
  useEffect(() => {
    fetch("/api/admin/auth")
      .then((r) => r.json())
      .then((d) => setAuthed(d.authenticated))
      .catch(() => setAuthed(false));
  }, []);

  const load = useCallback(async () => {
    const res = await fetch("/api/youtube-links");
    setConfig(await res.json());
  }, []);

  useEffect(() => {
    if (authed) load();
  }, [authed, load]);

  const save = async (data: YTConfig) => {
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const res = await fetch("/api/youtube-links", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Save failed");
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setError("Failed to save. Try again.");
    } finally {
      setSaving(false);
    }
  };

  // Poll siren alerts
  const loadSirens = useCallback(async () => {
    try {
      const res = await fetch("/api/siren-alerts");
      const data = await res.json();
      setSirenAlerts(data.sirenAlerts || []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (!authed) return;
    loadSirens();
    const interval = setInterval(loadSirens, 10_000);
    return () => clearInterval(interval);
  }, [authed, loadSirens]);

  const clearSiren = async (country: string) => {
    setSirenLoading(true);
    try {
      await fetch("/api/siren-alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "clear", country }),
      });
      await loadSirens();
    } catch { /* ignore */ }
    setSirenLoading(false);
  };

  const clearAllSirens = async () => {
    setSirenLoading(true);
    try {
      await fetch("/api/siren-alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "clear-all" }),
      });
      await loadSirens();
    } catch { /* ignore */ }
    setSirenLoading(false);
  };

  const addSiren = async () => {
    if (!newSirenCountry.trim()) return;
    setSirenLoading(true);
    setAlertError("");
    try {
      const res = await fetch("/api/siren-alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add", country: newSirenCountry.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setAlertError(data.error || `Siren add failed (${res.status})`);
      } else {
        setNewSirenCountry("");
        await loadSirens();
      }
    } catch (err) {
      setAlertError(`Network error: ${err}`);
    }
    setSirenLoading(false);
  };

  // Poll missile alerts
  const loadMissileAlerts = useCallback(async () => {
    try {
      const res = await fetch("/api/alerts");
      const data = await res.json();
      setMissileAlerts((data.alerts || []).filter((a: MissileAlertInfo) => a.id.startsWith("manual-")));
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (!authed) return;
    loadMissileAlerts();
    const interval = setInterval(loadMissileAlerts, 15_000);
    return () => clearInterval(interval);
  }, [authed, loadMissileAlerts]);

  const launchMissileAlert = async () => {
    if (!missileTarget.trim()) return;
    setMissileLoading(true);
    setAlertError("");
    try {
      const res = await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add",
          target: missileTarget.trim(),
          threatType: missileThreat,
          timeToImpact: missileTTI,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setAlertError(data.error || `Missile alert failed (${res.status})`);
      } else {
        setMissileTarget("");
        await loadMissileAlerts();
      }
    } catch (err) {
      setAlertError(`Network error: ${err}`);
    }
    setMissileLoading(false);
  };

  const clearMissileAlert = async (id: string) => {
    setMissileLoading(true);
    try {
      await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "clear", id }),
      });
      await loadMissileAlerts();
    } catch { /* ignore */ }
    setMissileLoading(false);
  };

  const clearAllMissileAlerts = async () => {
    setMissileLoading(true);
    try {
      await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "clear-all" }),
      });
      await loadMissileAlerts();
    } catch { /* ignore */ }
    setMissileLoading(false);
  };

  const logout = async () => {
    await fetch("/api/admin/auth", { method: "DELETE" });
    setAuthed(false);
  };

  const addCam = () => {
    if (!config || !newUrl.trim()) return;
    const id = extractVideoId(newUrl);
    if (!id) return;
    const label = newLabel.trim() || `Live Cam ${config.liveCams.length + 1}`;
    const next = { ...config, liveCams: [...config.liveCams, { id, label }] };
    setConfig(next);
    save(next);
    setNewUrl("");
    setNewLabel("");
  };

  const removeCam = (index: number) => {
    if (!config) return;
    const next = {
      ...config,
      liveCams: config.liveCams.filter((_, i) => i !== index),
    };
    setConfig(next);
    save(next);
  };

  const moveCam = (index: number, dir: -1 | 1) => {
    if (!config) return;
    const cams = [...config.liveCams];
    const target = index + dir;
    if (target < 0 || target >= cams.length) return;
    [cams[index], cams[target]] = [cams[target], cams[index]];
    const next = { ...config, liveCams: cams };
    setConfig(next);
    save(next);
  };

  const updateCamLabel = (index: number, label: string) => {
    if (!config) return;
    const cams = [...config.liveCams];
    cams[index] = { ...cams[index], label };
    setConfig({ ...config, liveCams: cams });
  };

  const saveCamLabel = () => {
    if (!config) return;
    save(config);
  };

  const updateSpeech = (field: keyof Speech, value: string | boolean) => {
    if (!config) return;
    const next = { ...config, speech: { ...config.speech, [field]: value } };
    setConfig(next);
  };

  const saveSpeech = () => {
    if (!config) return;
    const id = extractVideoId(config.speech.id);
    const next = { ...config, speech: { ...config.speech, id } };
    setConfig(next);
    save(next);
  };

  // ─── Loading / Auth gate ──────────────────────────────────────
  if (authed === null) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!authed) {
    return <LoginScreen onAuth={() => { setAuthed(true); }} />;
  }

  // ─── Dashboard ────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-neutral-200">
      {/* Header */}
      <header className="border-b border-[#2a2a2a] bg-[#111]/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <a
              href="/"
              className="text-neutral-500 hover:text-neutral-300 transition-colors text-sm"
            >
              &larr; Back
            </a>
            <h1
              className="text-sm font-bold uppercase tracking-wider text-neutral-300"
              style={{ fontFamily: "JetBrains Mono, monospace" }}
            >
              Admin Panel
            </h1>
          </div>
          <div className="flex items-center gap-3">
            {saved && (
              <span className="text-green-400 text-xs font-medium">Saved</span>
            )}
            {error && (
              <span className="text-red-400 text-xs font-medium">{error}</span>
            )}
            {saving && (
              <div className="w-3 h-3 border border-neutral-500 border-t-transparent rounded-full animate-spin" />
            )}
            <button
              onClick={logout}
              className="text-neutral-600 hover:text-neutral-400 text-xs transition-colors"
            >
              Log out
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-8 space-y-8">
        {alertError && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 flex items-center justify-between">
            <p className="text-red-400 text-sm">{alertError}</p>
            <button onClick={() => setAlertError("")} className="text-red-400/60 hover:text-red-400 text-xs ml-4">dismiss</button>
          </div>
        )}
        {/* ── Active Siren Alerts ── */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2
              className="text-xs font-bold uppercase tracking-wider text-neutral-500"
              style={{ fontFamily: "JetBrains Mono, monospace" }}
            >
              Siren Alerts
              {sirenAlerts.length > 0 && (
                <span className="ml-2 px-1.5 py-0.5 bg-red-500/20 text-red-400 rounded text-[10px]">
                  {sirenAlerts.length} ACTIVE
                </span>
              )}
            </h2>
            {sirenAlerts.length > 0 && (
              <button
                onClick={clearAllSirens}
                disabled={sirenLoading}
                className="text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 bg-red-500/20 text-red-400 border border-red-500/30 rounded-md hover:bg-red-500/30 disabled:opacity-30 transition-colors"
              >
                Clear All
              </button>
            )}
          </div>

          {/* Add siren form */}
          <div className="bg-[#111] border border-dashed border-[#2a2a2a] rounded-lg p-4 mb-4">
            <p
              className="text-[10px] uppercase tracking-wider text-neutral-600 mb-3 font-bold"
              style={{ fontFamily: "JetBrains Mono, monospace" }}
            >
              Add Siren
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Country (e.g. Iran, Lebanon, Yemen)"
                value={newSirenCountry}
                onChange={(e) => setNewSirenCountry(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addSiren()}
                className="flex-1 bg-[#1a1a1a] border border-[#2a2a2a] rounded-md px-3 py-2 text-sm text-neutral-200 placeholder-neutral-600 outline-none focus:border-neutral-500 transition-colors"
              />
              <button
                onClick={addSiren}
                disabled={!newSirenCountry.trim() || sirenLoading}
                className="px-4 py-2 bg-red-500/20 text-red-400 border border-red-500/30 rounded-md text-sm font-medium hover:bg-red-500/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                Activate
              </button>
            </div>
          </div>

          {sirenAlerts.length === 0 ? (
            <div className="bg-[#151515] border border-[#2a2a2a] rounded-lg p-4">
              <p className="text-neutral-600 text-sm text-center">No active siren alerts</p>
            </div>
          ) : (
            <div className="space-y-2">
              {sirenAlerts.map((alert) => (
                <div
                  key={alert.id}
                  className="bg-[#151515] border border-red-500/30 rounded-lg p-4 flex items-center gap-4"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-bold text-red-400 uppercase">
                        {alert.country}
                      </span>
                      <span className="text-[10px] text-neutral-600">
                        via {alert.sourceChannel}
                      </span>
                    </div>
                    <p className="text-xs text-neutral-400 line-clamp-2">{alert.sourceText}</p>
                    <div className="flex items-center gap-3 mt-1.5 text-[10px] text-neutral-600">
                      <span>
                        Activated: {new Date(alert.activatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                      <span>
                        Last seen: {new Date(alert.lastSeenAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => clearSiren(alert.country)}
                    disabled={sirenLoading}
                    className="px-4 py-2 bg-red-500/20 text-red-400 border border-red-500/30 rounded-md text-xs font-bold uppercase hover:bg-red-500/30 disabled:opacity-30 transition-colors shrink-0"
                  >
                    Clear
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── Missile Alerts ── */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2
              className="text-xs font-bold uppercase tracking-wider text-neutral-500"
              style={{ fontFamily: "JetBrains Mono, monospace" }}
            >
              Missile Alerts
              {missileAlerts.length > 0 && (
                <span className="ml-2 px-1.5 py-0.5 bg-orange-500/20 text-orange-400 rounded text-[10px]">
                  {missileAlerts.length} ACTIVE
                </span>
              )}
            </h2>
            {missileAlerts.length > 0 && (
              <button
                onClick={clearAllMissileAlerts}
                disabled={missileLoading}
                className="text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 bg-orange-500/20 text-orange-400 border border-orange-500/30 rounded-md hover:bg-orange-500/30 disabled:opacity-30 transition-colors"
              >
                Clear All
              </button>
            )}
          </div>

          {/* Add alert form */}
          <div className="bg-[#111] border border-dashed border-[#2a2a2a] rounded-lg p-4 mb-4">
            <p
              className="text-[10px] uppercase tracking-wider text-neutral-600 mb-3 font-bold"
              style={{ fontFamily: "JetBrains Mono, monospace" }}
            >
              Launch Alert
            </p>
            <div className="space-y-3">
              <input
                type="text"
                placeholder="Target (city name or lat,lng)"
                value={missileTarget}
                onChange={(e) => setMissileTarget(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && launchMissileAlert()}
                className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-md px-3 py-2 text-sm text-neutral-200 placeholder-neutral-600 outline-none focus:border-neutral-500 transition-colors"
              />
              <div className="flex items-center gap-3">
                <div className="flex rounded-md overflow-hidden border border-[#2a2a2a]">
                  <button
                    onClick={() => setMissileThreat("missile")}
                    className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                      missileThreat === "missile"
                        ? "bg-orange-500/30 text-orange-300 border-r border-orange-500/30"
                        : "bg-[#1a1a1a] text-neutral-500 border-r border-[#2a2a2a] hover:text-neutral-300"
                    }`}
                  >
                    Missile
                  </button>
                  <button
                    onClick={() => setMissileThreat("drone")}
                    className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                      missileThreat === "drone"
                        ? "bg-orange-500/30 text-orange-300"
                        : "bg-[#1a1a1a] text-neutral-500 hover:text-neutral-300"
                    }`}
                  >
                    Drone
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-neutral-500">TTI</label>
                  <input
                    type="number"
                    value={missileTTI}
                    onChange={(e) => setMissileTTI(Number(e.target.value) || 90)}
                    className="w-16 bg-[#1a1a1a] border border-[#2a2a2a] rounded-md px-2 py-1.5 text-sm text-neutral-200 outline-none focus:border-neutral-500 transition-colors text-center"
                  />
                  <span className="text-xs text-neutral-600">sec</span>
                </div>
                <div className="flex-1" />
                <button
                  onClick={launchMissileAlert}
                  disabled={!missileTarget.trim() || missileLoading}
                  className="px-4 py-2 bg-orange-500/20 text-orange-400 border border-orange-500/30 rounded-md text-sm font-medium hover:bg-orange-500/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  Launch Alert
                </button>
              </div>
            </div>
          </div>

          {/* Active missile alerts list */}
          {missileAlerts.length === 0 ? (
            <div className="bg-[#151515] border border-[#2a2a2a] rounded-lg p-4">
              <p className="text-neutral-600 text-sm text-center">No active manual missile alerts</p>
            </div>
          ) : (
            <div className="space-y-2">
              {missileAlerts.map((alert) => (
                <div
                  key={alert.id}
                  className="bg-[#151515] border border-orange-500/30 rounded-lg p-4 flex items-center gap-4"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-bold text-orange-400 uppercase">
                        {alert.cities.join(", ") || "Unknown"}
                      </span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase ${
                        alert.threatType === "drone"
                          ? "bg-yellow-500/20 text-yellow-400"
                          : "bg-orange-500/20 text-orange-400"
                      }`}>
                        {alert.threatType || "missile"}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-[10px] text-neutral-600">
                      <span>TTI: {alert.timeToImpact}s</span>
                      <span>Time: {alert.timestamp}</span>
                      <span className="font-mono">{alert.id}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => clearMissileAlert(alert.id)}
                    disabled={missileLoading}
                    className="px-4 py-2 bg-orange-500/20 text-orange-400 border border-orange-500/30 rounded-md text-xs font-bold uppercase hover:bg-orange-500/30 disabled:opacity-30 transition-colors shrink-0"
                  >
                    Clear
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── Live Cams ── */}
        {config && <section>
          <h2
            className="text-xs font-bold uppercase tracking-wider text-neutral-500 mb-4"
            style={{ fontFamily: "JetBrains Mono, monospace" }}
          >
            Live Cam Streams
          </h2>

          {config.liveCams.length === 0 && (
            <p className="text-neutral-600 text-sm mb-4">No live cams added yet.</p>
          )}

          <div className="space-y-2">
            {config.liveCams.map((cam, i) => (
              <div
                key={`${cam.id}-${i}`}
                className="bg-[#151515] border border-[#2a2a2a] rounded-lg p-3 flex items-center gap-3 group"
              >
                <img
                  src={`https://img.youtube.com/vi/${cam.id}/mqdefault.jpg`}
                  alt=""
                  className="w-28 h-16 object-cover rounded bg-[#222] flex-shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <input
                    type="text"
                    value={cam.label}
                    onChange={(e) => updateCamLabel(i, e.target.value)}
                    onBlur={saveCamLabel}
                    onKeyDown={(e) => e.key === "Enter" && saveCamLabel()}
                    className="bg-transparent text-sm text-neutral-200 font-medium w-full outline-none border-b border-transparent focus:border-neutral-600 transition-colors"
                  />
                  <p className="text-[10px] text-neutral-600 mt-0.5 font-mono truncate">
                    {cam.id}
                  </p>
                </div>
                <div className="flex items-center gap-1 opacity-50 group-hover:opacity-100 transition-opacity flex-shrink-0">
                  <button
                    onClick={() => moveCam(i, -1)}
                    disabled={i === 0}
                    className="p-1.5 rounded hover:bg-[#222] disabled:opacity-20 transition-colors"
                    title="Move up"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                    </svg>
                  </button>
                  <button
                    onClick={() => moveCam(i, 1)}
                    disabled={i === config.liveCams.length - 1}
                    className="p-1.5 rounded hover:bg-[#222] disabled:opacity-20 transition-colors"
                    title="Move down"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  <button
                    onClick={() => removeCam(i)}
                    className="p-1.5 rounded hover:bg-red-500/20 text-neutral-500 hover:text-red-400 transition-colors"
                    title="Remove"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Add new */}
          <div className="mt-4 bg-[#111] border border-dashed border-[#2a2a2a] rounded-lg p-4">
            <p
              className="text-[10px] uppercase tracking-wider text-neutral-600 mb-3 font-bold"
              style={{ fontFamily: "JetBrains Mono, monospace" }}
            >
              Add Stream
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                placeholder="YouTube URL or video ID"
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addCam()}
                className="flex-1 bg-[#1a1a1a] border border-[#2a2a2a] rounded-md px-3 py-2 text-sm text-neutral-200 placeholder-neutral-600 outline-none focus:border-neutral-500 transition-colors"
              />
              <input
                type="text"
                placeholder="Label (optional)"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addCam()}
                className="sm:w-40 bg-[#1a1a1a] border border-[#2a2a2a] rounded-md px-3 py-2 text-sm text-neutral-200 placeholder-neutral-600 outline-none focus:border-neutral-500 transition-colors"
              />
              <button
                onClick={addCam}
                disabled={!newUrl.trim()}
                className="px-4 py-2 bg-red-500/20 text-red-400 border border-red-500/30 rounded-md text-sm font-medium hover:bg-red-500/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                Add
              </button>
            </div>
          </div>
        </section>}

        {/* ── Government Speech ── */}
        {config && <section>
          <h2
            className="text-xs font-bold uppercase tracking-wider text-neutral-500 mb-4"
            style={{ fontFamily: "JetBrains Mono, monospace" }}
          >
            Government Address
          </h2>

          <div className="bg-[#151515] border border-[#2a2a2a] rounded-lg p-4 space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-xs text-neutral-400">Enabled</label>
              <button
                onClick={() => {
                  const next = {
                    ...config,
                    speech: { ...config.speech, enabled: !config.speech.enabled },
                  };
                  setConfig(next);
                  save(next);
                }}
                className={`w-10 h-5 rounded-full transition-colors relative ${
                  config.speech.enabled ? "bg-red-500/60" : "bg-[#2a2a2a]"
                }`}
              >
                <span
                  className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                    config.speech.enabled ? "left-5" : "left-0.5"
                  }`}
                />
              </button>
            </div>

            <div>
              <label className="text-xs text-neutral-400 block mb-1">Title</label>
              <input
                type="text"
                value={config.speech.title}
                onChange={(e) => updateSpeech("title", e.target.value)}
                onBlur={saveSpeech}
                onKeyDown={(e) => e.key === "Enter" && saveSpeech()}
                className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-md px-3 py-2 text-sm text-neutral-200 outline-none focus:border-neutral-500 transition-colors"
              />
            </div>

            <div>
              <label className="text-xs text-neutral-400 block mb-1">
                YouTube URL or Video ID
              </label>
              <input
                type="text"
                value={config.speech.id}
                onChange={(e) => updateSpeech("id", e.target.value)}
                onBlur={saveSpeech}
                onKeyDown={(e) => e.key === "Enter" && saveSpeech()}
                className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-md px-3 py-2 text-sm text-neutral-200 outline-none focus:border-neutral-500 transition-colors"
              />
            </div>

            {config.speech.id && (
              <div>
                <p
                  className="text-[10px] uppercase tracking-wider text-neutral-600 mb-2 font-bold"
                  style={{ fontFamily: "JetBrains Mono, monospace" }}
                >
                  Preview
                </p>
                <img
                  src={`https://img.youtube.com/vi/${extractVideoId(config.speech.id)}/mqdefault.jpg`}
                  alt=""
                  className="w-48 h-auto rounded bg-[#222]"
                />
              </div>
            )}
          </div>
        </section>}
      </div>
    </div>
  );
}
