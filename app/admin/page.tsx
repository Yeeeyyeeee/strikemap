"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
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
  liveNews: LiveCam[];
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
          {error && <p className="text-red-400 text-xs text-center">{error}</p>}
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
  const [newNewsUrl, setNewNewsUrl] = useState("");
  const [newNewsLabel, setNewNewsLabel] = useState("");

  // Siren alerts state
  const [sirenAlerts, setSirenAlerts] = useState<SirenAlertInfo[]>([]);
  const [sirenLoading, setSirenLoading] = useState(false);
  const [newSirenCountry, setNewSirenCountry] = useState("");

  // Missile alerts state
  const [missileAlerts, setMissileAlerts] = useState<MissileAlertInfo[]>([]);
  const [missileLoading, setMissileLoading] = useState(false);
  const [missileTarget, setMissileTarget] = useState("");
  const [missileThreat, setMissileThreat] = useState<"missile" | "drone">("missile");
  const [missileOrigin, setMissileOrigin] = useState<string>("auto");
  const [missileTTI, setMissileTTI] = useState(90);

  // Shared alert error banner
  const [alertError, setAlertError] = useState("");

  // Announcement state
  const [announcementText, setAnnouncementText] = useState("");
  const [currentAnnouncement, setCurrentAnnouncement] = useState<string | null>(null);
  const [announcementLoading, setAnnouncementLoading] = useState(false);

  // Ticker text state
  const [tickerTextInput, setTickerTextInput] = useState("");
  const [currentTickerText, setCurrentTickerText] = useState<string | null>(null);
  const [tickerTextLoading, setTickerTextLoading] = useState(false);

  // Changelog state
  const [changelogEntries, setChangelogEntries] = useState<
    { id: string; text: string; createdAt: number }[]
  >([]);
  const [changelogText, setChangelogText] = useState("");
  const [changelogLoading, setChangelogLoading] = useState(false);

  // Chat bans state
  const [chatBans, setChatBans] = useState<string[]>([]);
  const [banInput, setBanInput] = useState("");
  const [bansLoading, setBansLoading] = useState(false);

  // Suggestions state
  const [suggestions, setSuggestions] = useState<
    {
      id: string;
      title: string;
      device: string;
      description: string;
      status: string;
      votes: number;
      nickname: string;
      createdAt: number;
    }[]
  >([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);

  // Airspace override state
  const [airspaceOverrides, setAirspaceOverrides] = useState<
    Record<string, { status: string; setAt: string }>
  >({});
  const [airspaceLoading, setAirspaceLoading] = useState(false);

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
    } catch (_e) {
      /* ignore */
    }
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
    } catch (_e) {
      /* ignore */
    }
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
    } catch (_e) {
      /* ignore */
    }
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

  // Load airspace overrides
  const loadAirspaceOverrides = useCallback(async () => {
    try {
      const res = await fetch("/api/airspace-status");
      const data = await res.json();
      setAirspaceOverrides(data.overrides || {});
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!authed) return;
    loadAirspaceOverrides();
  }, [authed, loadAirspaceOverrides]);

  const setAirspaceOverride = async (fir: string, status: string) => {
    setAirspaceLoading(true);
    try {
      await fetch("/api/airspace-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set", fir, status }),
      });
      await loadAirspaceOverrides();
    } catch {
      /* ignore */
    }
    setAirspaceLoading(false);
  };

  const clearAirspaceOverride = async (fir: string) => {
    setAirspaceLoading(true);
    try {
      await fetch("/api/airspace-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "clear", fir }),
      });
      await loadAirspaceOverrides();
    } catch {
      /* ignore */
    }
    setAirspaceLoading(false);
  };

  const clearAllAirspaceOverrides = async () => {
    setAirspaceLoading(true);
    try {
      await fetch("/api/airspace-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "clear-all" }),
      });
      await loadAirspaceOverrides();
    } catch {
      /* ignore */
    }
    setAirspaceLoading(false);
  };

  // Poll announcement
  const loadAnnouncement = useCallback(async () => {
    try {
      const res = await fetch("/api/announcement");
      const data = await res.json();
      setCurrentAnnouncement(data.announcement?.text || null);
    } catch (_e) {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!authed) return;
    loadAnnouncement();
  }, [authed, loadAnnouncement]);

  const postAnnouncement = async () => {
    if (!announcementText.trim()) return;
    setAnnouncementLoading(true);
    setAlertError("");
    try {
      const res = await fetch("/api/announcement", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: announcementText.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setAlertError(data.error || `Announcement failed (${res.status})`);
      } else {
        setCurrentAnnouncement(announcementText.trim());
        setAnnouncementText("");
      }
    } catch (err) {
      setAlertError(`Network error: ${err}`);
    }
    setAnnouncementLoading(false);
  };

  const clearAnnouncement = async () => {
    setAnnouncementLoading(true);
    try {
      await fetch("/api/announcement", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "" }),
      });
      setCurrentAnnouncement(null);
      setAnnouncementText("");
    } catch (_e) {
      /* ignore */
    }
    setAnnouncementLoading(false);
  };

  // Poll ticker text
  const loadTickerText = useCallback(async () => {
    try {
      const res = await fetch("/api/ticker-text");
      const data = await res.json();
      setCurrentTickerText(data.text || null);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!authed) return;
    loadTickerText();
  }, [authed, loadTickerText]);

  const postTickerText = async () => {
    if (!tickerTextInput.trim()) return;
    setTickerTextLoading(true);
    setAlertError("");
    try {
      const res = await fetch("/api/ticker-text", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: tickerTextInput.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setAlertError(data.error || `Ticker text failed (${res.status})`);
      } else {
        setCurrentTickerText(tickerTextInput.trim());
        setTickerTextInput("");
      }
    } catch (err) {
      setAlertError(`Network error: ${err}`);
    }
    setTickerTextLoading(false);
  };

  const clearTickerText = async () => {
    setTickerTextLoading(true);
    try {
      await fetch("/api/ticker-text", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "" }),
      });
      setCurrentTickerText(null);
      setTickerTextInput("");
    } catch {
      /* ignore */
    }
    setTickerTextLoading(false);
  };

  // Poll changelog
  const loadChangelog = useCallback(async () => {
    try {
      const res = await fetch("/api/changelog");
      const data = await res.json();
      setChangelogEntries(data.entries || []);
    } catch {}
  }, []);

  useEffect(() => {
    if (!authed) return;
    loadChangelog();
  }, [authed, loadChangelog]);

  const addChangelogEntry = async () => {
    if (!changelogText.trim()) return;
    setChangelogLoading(true);
    setAlertError("");
    try {
      const res = await fetch("/api/changelog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add", text: changelogText.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setAlertError(data.error || `Changelog add failed (${res.status})`);
      } else {
        setChangelogText("");
        await loadChangelog();
      }
    } catch (err) {
      setAlertError(`Network error: ${err}`);
    }
    setChangelogLoading(false);
  };

  const deleteChangelogEntry = async (id: string) => {
    setChangelogLoading(true);
    try {
      await fetch("/api/changelog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", id }),
      });
      await loadChangelog();
    } catch {}
    setChangelogLoading(false);
  };

  // Load chat bans
  const loadBans = useCallback(async () => {
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "list-bans" }),
      });
      const data = await res.json();
      setChatBans(data.bans || []);
    } catch {}
  }, []);

  useEffect(() => {
    if (!authed) return;
    loadBans();
  }, [authed, loadBans]);

  const banUser = async () => {
    if (!banInput.trim()) return;
    setBansLoading(true);
    try {
      await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "ban", nickname: banInput.trim() }),
      });
      setBanInput("");
      await loadBans();
    } catch {}
    setBansLoading(false);
  };

  const unbanUser = async (nick: string) => {
    setBansLoading(true);
    try {
      await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "unban", nickname: nick }),
      });
      await loadBans();
    } catch {}
    setBansLoading(false);
  };

  // Poll suggestions
  const loadSuggestions = useCallback(async () => {
    try {
      const res = await fetch("/api/suggestions");
      const data = await res.json();
      setSuggestions(data.suggestions || []);
    } catch (_e) {}
  }, []);

  useEffect(() => {
    if (!authed) return;
    loadSuggestions();
    const iv = setInterval(loadSuggestions, 15_000);
    return () => clearInterval(iv);
  }, [authed, loadSuggestions]);

  const toggleSuggestionStatus = async (id: string, currentStatus: string) => {
    setSuggestionsLoading(true);
    try {
      await fetch("/api/suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "status",
          id,
          status: currentStatus === "wip" ? "completed" : "wip",
        }),
      });
      await loadSuggestions();
    } catch (_e) {}
    setSuggestionsLoading(false);
  };

  const loadMissileAlerts = useCallback(async () => {
    try {
      const res = await fetch("/api/alerts");
      const data = await res.json();
      setMissileAlerts(
        (data.alerts || []).filter((a: MissileAlertInfo) => a.id.startsWith("manual-"))
      );
    } catch (_e) {
      /* ignore */
    }
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
          ...(missileOrigin !== "auto" && { origin: missileOrigin }),
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
    } catch (_e) {
      /* ignore */
    }
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
    } catch (_e) {
      /* ignore */
    }
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

  const addNews = () => {
    if (!config || !newNewsUrl.trim()) return;
    const id = extractVideoId(newNewsUrl);
    if (!id) return;
    const label = newNewsLabel.trim() || `Live News ${(config.liveNews || []).length + 1}`;
    const next = { ...config, liveNews: [...(config.liveNews || []), { id, label }] };
    setConfig(next);
    save(next);
    setNewNewsUrl("");
    setNewNewsLabel("");
  };

  const removeNews = (index: number) => {
    if (!config) return;
    const next = { ...config, liveNews: (config.liveNews || []).filter((_, i) => i !== index) };
    setConfig(next);
    save(next);
  };

  const moveNews = (index: number, dir: -1 | 1) => {
    if (!config) return;
    const news = [...(config.liveNews || [])];
    const target = index + dir;
    if (target < 0 || target >= news.length) return;
    [news[index], news[target]] = [news[target], news[index]];
    const next = { ...config, liveNews: news };
    setConfig(next);
    save(next);
  };

  const updateNewsLabel = (index: number, label: string) => {
    if (!config) return;
    const news = [...(config.liveNews || [])];
    news[index] = { ...news[index], label };
    setConfig({ ...config, liveNews: news });
  };

  const saveNewsLabel = () => {
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
    return (
      <LoginScreen
        onAuth={() => {
          setAuthed(true);
        }}
      />
    );
  }

  // ─── Dashboard ────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-neutral-200">
      {/* Header */}
      <header className="border-b border-[#2a2a2a] bg-[#111]/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="text-neutral-500 hover:text-neutral-300 transition-colors text-sm"
            >
              &larr; Back
            </Link>
            <h1
              className="text-sm font-bold uppercase tracking-wider text-neutral-300"
              style={{ fontFamily: "JetBrains Mono, monospace" }}
            >
              Admin Panel
            </h1>
          </div>
          <div className="flex items-center gap-3">
            {saved && <span className="text-green-400 text-xs font-medium">Saved</span>}
            {error && <span className="text-red-400 text-xs font-medium">{error}</span>}
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
            <button
              onClick={() => setAlertError("")}
              className="text-red-400/60 hover:text-red-400 text-xs ml-4"
            >
              dismiss
            </button>
          </div>
        )}
        {/* ── Announcement ── */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2
              className="text-xs font-bold uppercase tracking-wider text-neutral-500"
              style={{ fontFamily: "JetBrains Mono, monospace" }}
            >
              Announcement
              {currentAnnouncement && (
                <span className="ml-2 px-1.5 py-0.5 bg-red-500/20 text-red-400 rounded text-[10px]">
                  LIVE
                </span>
              )}
            </h2>
            {currentAnnouncement && (
              <button
                onClick={clearAnnouncement}
                disabled={announcementLoading}
                className="text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 bg-red-500/20 text-red-400 border border-red-500/30 rounded-md hover:bg-red-500/30 disabled:opacity-30 transition-colors"
              >
                Clear
              </button>
            )}
          </div>

          {currentAnnouncement && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 mb-4">
              <p className="text-sm text-red-200">{currentAnnouncement}</p>
            </div>
          )}

          <div className="bg-[#111] border border-dashed border-[#2a2a2a] rounded-lg p-4">
            <p
              className="text-[10px] uppercase tracking-wider text-neutral-600 mb-3 font-bold"
              style={{ fontFamily: "JetBrains Mono, monospace" }}
            >
              {currentAnnouncement ? "Update Announcement" : "Post Announcement"}
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Announcement text..."
                value={announcementText}
                onChange={(e) => setAnnouncementText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && postAnnouncement()}
                className="flex-1 bg-[#1a1a1a] border border-[#2a2a2a] rounded-md px-3 py-2 text-sm text-neutral-200 placeholder-neutral-600 outline-none focus:border-neutral-500 transition-colors"
              />
              <button
                onClick={postAnnouncement}
                disabled={!announcementText.trim() || announcementLoading}
                className="px-4 py-2 bg-red-500/20 text-red-400 border border-red-500/30 rounded-md text-sm font-medium hover:bg-red-500/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                Post
              </button>
            </div>
          </div>
        </section>

        {/* ── Ticker Text ── */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2
              className="text-xs font-bold uppercase tracking-wider text-neutral-500"
              style={{ fontFamily: "JetBrains Mono, monospace" }}
            >
              Ticker Text
              {currentTickerText && (
                <span className="ml-2 px-1.5 py-0.5 bg-orange-500/20 text-orange-400 rounded text-[10px]">
                  LIVE
                </span>
              )}
            </h2>
            {currentTickerText && (
              <button
                onClick={clearTickerText}
                disabled={tickerTextLoading}
                className="text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 bg-red-500/20 text-red-400 border border-red-500/30 rounded-md hover:bg-red-500/30 disabled:opacity-30 transition-colors"
              >
                Clear
              </button>
            )}
          </div>

          {currentTickerText && (
            <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg px-4 py-3 mb-4">
              <p className="text-sm text-orange-200">{currentTickerText}</p>
            </div>
          )}

          <div className="bg-[#111] border border-dashed border-[#2a2a2a] rounded-lg p-4">
            <p
              className="text-[10px] uppercase tracking-wider text-neutral-600 mb-3 font-bold"
              style={{ fontFamily: "JetBrains Mono, monospace" }}
            >
              {currentTickerText ? "Update Ticker Text" : "Set Ticker Text"}
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Custom text appended to ticker roll..."
                value={tickerTextInput}
                onChange={(e) => setTickerTextInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && postTickerText()}
                className="flex-1 bg-[#1a1a1a] border border-[#2a2a2a] rounded-md px-3 py-2 text-sm text-neutral-200 placeholder-neutral-600 outline-none focus:border-neutral-500 transition-colors"
              />
              <button
                onClick={postTickerText}
                disabled={!tickerTextInput.trim() || tickerTextLoading}
                className="px-4 py-2 bg-orange-500/20 text-orange-400 border border-orange-500/30 rounded-md text-sm font-medium hover:bg-orange-500/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                Post
              </button>
            </div>
          </div>
        </section>

        {/* ── Changelog ── */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2
              className="text-xs font-bold uppercase tracking-wider text-neutral-500"
              style={{ fontFamily: "JetBrains Mono, monospace" }}
            >
              Changelog
              {changelogEntries.length > 0 && (
                <span className="ml-2 px-1.5 py-0.5 bg-green-500/20 text-green-400 rounded text-[10px]">
                  {changelogEntries.length} ENTRIES
                </span>
              )}
            </h2>
          </div>

          <div className="bg-[#111] border border-dashed border-[#2a2a2a] rounded-lg p-4 mb-4">
            <p
              className="text-[10px] uppercase tracking-wider text-neutral-600 mb-3 font-bold"
              style={{ fontFamily: "JetBrains Mono, monospace" }}
            >
              Add Change
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Describe the change..."
                value={changelogText}
                onChange={(e) => setChangelogText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addChangelogEntry()}
                className="flex-1 bg-[#1a1a1a] border border-[#2a2a2a] rounded-md px-3 py-2 text-sm text-neutral-200 placeholder-neutral-600 outline-none focus:border-neutral-500 transition-colors"
              />
              <button
                onClick={addChangelogEntry}
                disabled={!changelogText.trim() || changelogLoading}
                className="px-4 py-2 bg-green-500/20 text-green-400 border border-green-500/30 rounded-md text-sm font-medium hover:bg-green-500/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                Add
              </button>
            </div>
          </div>

          {changelogEntries.length === 0 ? (
            <div className="bg-[#151515] border border-[#2a2a2a] rounded-lg p-4">
              <p className="text-neutral-600 text-sm text-center">No changelog entries yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {changelogEntries.map((entry) => (
                <div
                  key={entry.id}
                  className="bg-[#151515] border border-[#2a2a2a] rounded-lg p-4 flex items-start gap-4"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-neutral-200">{entry.text}</p>
                    <span className="text-[10px] text-neutral-600 mt-1 block">
                      {new Date(entry.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <button
                    onClick={() => deleteChangelogEntry(entry.id)}
                    disabled={changelogLoading}
                    className="px-3 py-1.5 bg-red-500/20 text-red-400 border border-red-500/30 rounded-md text-xs font-bold uppercase hover:bg-red-500/30 disabled:opacity-30 transition-colors shrink-0"
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

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
                        Activated:{" "}
                        {new Date(alert.activatedAt).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      <span>
                        Last seen:{" "}
                        {new Date(alert.lastSeenAt).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
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

        {/* ── Airspace Override ── */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2
              className="text-xs font-bold uppercase tracking-wider text-neutral-500"
              style={{ fontFamily: "JetBrains Mono, monospace" }}
            >
              Airspace Override
              {Object.keys(airspaceOverrides).length > 0 && (
                <span className="ml-2 px-1.5 py-0.5 bg-sky-500/20 text-sky-400 rounded text-[10px]">
                  {Object.keys(airspaceOverrides).length} MANUAL
                </span>
              )}
            </h2>
            {Object.keys(airspaceOverrides).length > 0 && (
              <button
                onClick={clearAllAirspaceOverrides}
                disabled={airspaceLoading}
                className="text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 bg-red-500/20 text-red-400 border border-red-500/30 rounded-md hover:bg-red-500/30 disabled:opacity-30 transition-colors"
              >
                Clear All Overrides
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {[
              { fir: "OIIX", country: "Iran" },
              { fir: "LLLL", country: "Israel" },
              { fir: "OLBB", country: "Lebanon" },
              { fir: "OSTT", country: "Syria" },
              { fir: "ORBB", country: "Iraq" },
              { fir: "OJAC", country: "Jordan" },
              { fir: "OEJD", country: "Saudi Arabia" },
              { fir: "OYSC", country: "Yemen" },
              { fir: "OMAE", country: "UAE" },
              { fir: "OBBB", country: "Bahrain" },
            ].map(({ fir, country }) => {
              const override = airspaceOverrides[fir];
              const currentStatus = override?.status || null;
              return (
                <div
                  key={fir}
                  className="bg-[#151515] border rounded-lg p-3"
                  style={{ borderColor: override ? "rgba(56, 189, 248, 0.3)" : "#2a2a2a" }}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span
                      className="text-xs font-bold text-neutral-300"
                      style={{ fontFamily: "JetBrains Mono, monospace" }}
                    >
                      {country}
                    </span>
                    {override && (
                      <span className="text-[8px] font-bold text-sky-400 bg-sky-500/20 px-1 py-0.5 rounded uppercase">
                        M
                      </span>
                    )}
                  </div>
                  <p
                    className="text-[10px] text-neutral-600 mb-2"
                    style={{ fontFamily: "JetBrains Mono, monospace" }}
                  >
                    {fir} {override ? `\u2022 ${currentStatus?.toUpperCase()}` : "\u2022 AUTO"}
                  </p>
                  <div className="flex gap-1 mb-1.5">
                    {(["open", "restricted", "closed"] as const).map((s) => (
                      <button
                        key={s}
                        onClick={() => setAirspaceOverride(fir, s)}
                        disabled={airspaceLoading}
                        className="flex-1 py-1 rounded text-[9px] font-bold uppercase transition-colors disabled:opacity-30"
                        style={{
                          backgroundColor:
                            currentStatus === s
                              ? s === "open"
                                ? "rgba(34,197,94,0.25)"
                                : s === "restricted"
                                  ? "rgba(234,179,8,0.25)"
                                  : "rgba(239,68,68,0.25)"
                              : "rgba(255,255,255,0.03)",
                          color:
                            currentStatus === s
                              ? s === "open"
                                ? "#22c55e"
                                : s === "restricted"
                                  ? "#eab308"
                                  : "#ef4444"
                              : "#666",
                          border: `1px solid ${
                            currentStatus === s
                              ? s === "open"
                                ? "rgba(34,197,94,0.4)"
                                : s === "restricted"
                                  ? "rgba(234,179,8,0.4)"
                                  : "rgba(239,68,68,0.4)"
                              : "rgba(255,255,255,0.06)"
                          }`,
                          fontFamily: "JetBrains Mono, monospace",
                        }}
                      >
                        {s === "open" ? "OPN" : s === "restricted" ? "RST" : "CLS"}
                      </button>
                    ))}
                  </div>
                  {override && (
                    <button
                      onClick={() => clearAirspaceOverride(fir)}
                      disabled={airspaceLoading}
                      className="w-full py-1 text-[9px] font-bold uppercase text-neutral-500 hover:text-neutral-300 bg-[#1a1a1a] border border-[#2a2a2a] rounded transition-colors disabled:opacity-30"
                      style={{ fontFamily: "JetBrains Mono, monospace" }}
                    >
                      Revert to Auto
                    </button>
                  )}
                </div>
              );
            })}
          </div>
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
                <select
                  value={missileOrigin}
                  onChange={(e) => setMissileOrigin(e.target.value)}
                  className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-md px-2 py-1.5 text-xs text-neutral-200 outline-none focus:border-neutral-500 transition-colors"
                >
                  <option value="auto">Auto</option>
                  <option value="iran">Iran</option>
                  <option value="lebanon">Lebanon</option>
                  <option value="yemen">Yemen</option>
                  <option value="iraq">Iraq</option>
                  <option value="syria">Syria</option>
                  <option value="gaza">Gaza</option>
                </select>
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
              <p className="text-neutral-600 text-sm text-center">
                No active manual missile alerts
              </p>
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
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase ${
                          alert.threatType === "drone"
                            ? "bg-yellow-500/20 text-yellow-400"
                            : "bg-orange-500/20 text-orange-400"
                        }`}
                      >
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

        {/* ── Chat Bans (Shadow) ── */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2
              className="text-xs font-bold uppercase tracking-wider text-neutral-500"
              style={{ fontFamily: "JetBrains Mono, monospace" }}
            >
              Shadow Bans
              {chatBans.length > 0 && (
                <span className="ml-2 px-1.5 py-0.5 bg-red-500/20 text-red-400 rounded text-[10px]">
                  {chatBans.length} BANNED
                </span>
              )}
            </h2>
          </div>

          <div className="bg-[#111] border border-dashed border-[#2a2a2a] rounded-lg p-4 mb-4">
            <p
              className="text-[10px] uppercase tracking-wider text-neutral-600 mb-3 font-bold"
              style={{ fontFamily: "JetBrains Mono, monospace" }}
            >
              Ban Username
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="e.g. ABCD-1234"
                value={banInput}
                onChange={(e) => setBanInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && banUser()}
                className="flex-1 bg-[#1a1a1a] border border-[#2a2a2a] rounded-md px-3 py-2 text-sm text-neutral-200 placeholder-neutral-600 outline-none focus:border-neutral-500 transition-colors"
              />
              <button
                onClick={banUser}
                disabled={!banInput.trim() || bansLoading}
                className="px-4 py-2 bg-red-500/20 text-red-400 border border-red-500/30 rounded-md text-sm font-medium hover:bg-red-500/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                Ban
              </button>
            </div>
            <p className="text-[10px] text-neutral-600 mt-2">
              User can still send messages but they won&apos;t appear for anyone else.
            </p>
          </div>

          {chatBans.length === 0 ? (
            <div className="bg-[#151515] border border-[#2a2a2a] rounded-lg p-4">
              <p className="text-neutral-600 text-sm text-center">No banned users</p>
            </div>
          ) : (
            <div className="space-y-2">
              {chatBans.map((nick) => (
                <div
                  key={nick}
                  className="bg-[#151515] border border-red-500/20 rounded-lg p-4 flex items-center justify-between"
                >
                  <span
                    className="text-sm font-semibold text-neutral-200 uppercase"
                    style={{ fontFamily: "JetBrains Mono, monospace" }}
                  >
                    {nick}
                  </span>
                  <button
                    onClick={() => unbanUser(nick)}
                    disabled={bansLoading}
                    className="px-3 py-1.5 bg-green-500/20 text-green-400 border border-green-500/30 rounded-md text-xs font-bold uppercase hover:bg-green-500/30 disabled:opacity-30 transition-colors"
                  >
                    Unban
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── Suggestions ── */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2
              className="text-xs font-bold uppercase tracking-wider text-neutral-500"
              style={{ fontFamily: "JetBrains Mono, monospace" }}
            >
              Suggestions
              {suggestions.filter((s) => s.status === "wip").length > 0 && (
                <span className="ml-2 px-1.5 py-0.5 bg-amber-500/20 text-amber-400 rounded text-[10px]">
                  {suggestions.filter((s) => s.status === "wip").length} OPEN
                </span>
              )}
            </h2>
          </div>

          {suggestions.length === 0 ? (
            <div className="bg-[#151515] border border-[#2a2a2a] rounded-lg p-4">
              <p className="text-neutral-600 text-sm text-center">No suggestions yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {suggestions.map((sug) => {
                const isDone = sug.status === "completed";
                return (
                  <div
                    key={sug.id}
                    className={`bg-[#151515] border rounded-lg p-4 flex items-start gap-4 ${
                      isDone ? "border-green-500/20 opacity-50" : "border-[#2a2a2a]"
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span
                          className={`text-sm font-semibold ${isDone ? "text-neutral-500 line-through" : "text-neutral-200"}`}
                        >
                          {sug.title}
                        </span>
                        <span
                          className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${
                            sug.device === "desktop"
                              ? "bg-purple-500/20 text-purple-400"
                              : sug.device === "mobile"
                                ? "bg-green-500/20 text-green-400"
                                : "bg-neutral-700 text-neutral-400"
                          }`}
                        >
                          {sug.device === "all" ? "Both" : sug.device}
                        </span>
                        <span
                          className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${
                            isDone
                              ? "bg-green-500/20 text-green-400"
                              : "bg-amber-500/20 text-amber-400"
                          }`}
                        >
                          {isDone ? "Done" : "WIP"}
                        </span>
                        <span className="text-[10px] text-neutral-600 font-medium">
                          {sug.votes} vote{sug.votes !== 1 ? "s" : ""}
                        </span>
                      </div>
                      <p className="text-xs text-neutral-400 mb-1.5">{sug.description}</p>
                      <div className="flex items-center gap-2 text-[10px] text-neutral-600">
                        <span>by {sug.nickname}</span>
                        <span>{new Date(sug.createdAt).toLocaleString()}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => toggleSuggestionStatus(sug.id, sug.status)}
                        disabled={suggestionsLoading}
                        className={`px-3 py-1.5 rounded-md text-xs font-bold uppercase transition-colors disabled:opacity-30 ${
                          isDone
                            ? "bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:bg-amber-500/30"
                            : "bg-green-500/20 text-green-400 border border-green-500/30 hover:bg-green-500/30"
                        }`}
                      >
                        {isDone ? "Reopen" : "Done"}
                      </button>
                      <button
                        onClick={async () => {
                          setSuggestionsLoading(true);
                          try {
                            await fetch("/api/suggestions", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ action: "clear", id: sug.id }),
                            });
                            await loadSuggestions();
                          } catch {}
                          setSuggestionsLoading(false);
                        }}
                        disabled={suggestionsLoading}
                        className="px-3 py-1.5 bg-red-500/20 text-red-400 border border-red-500/30 rounded-md text-xs font-bold uppercase hover:bg-red-500/30 disabled:opacity-30 transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ── Live News ── */}
        {config && (
          <section>
            <h2
              className="text-xs font-bold uppercase tracking-wider text-neutral-500 mb-4"
              style={{ fontFamily: "JetBrains Mono, monospace" }}
            >
              Live News Streams
            </h2>

            {(config.liveNews || []).length === 0 && (
              <p className="text-neutral-600 text-sm mb-4">No live news streams added yet.</p>
            )}

            <div className="space-y-2">
              {(config.liveNews || []).map((stream, i) => (
                <div
                  key={`${stream.id}-${i}`}
                  className="bg-[#151515] border border-[#2a2a2a] rounded-lg p-3 flex items-center gap-3 group"
                >
                  <img
                    src={`https://img.youtube.com/vi/${stream.id}/mqdefault.jpg`}
                    alt=""
                    className="w-28 h-16 object-cover rounded bg-[#222] flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <input
                      type="text"
                      value={stream.label}
                      onChange={(e) => updateNewsLabel(i, e.target.value)}
                      onBlur={saveNewsLabel}
                      onKeyDown={(e) => e.key === "Enter" && saveNewsLabel()}
                      className="bg-transparent text-sm text-neutral-200 font-medium w-full outline-none border-b border-transparent focus:border-neutral-600 transition-colors"
                    />
                    <p className="text-[10px] text-neutral-600 mt-0.5 font-mono truncate">
                      {stream.id}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 opacity-50 group-hover:opacity-100 transition-opacity flex-shrink-0">
                    <button
                      onClick={() => moveNews(i, -1)}
                      disabled={i === 0}
                      className="p-1.5 rounded hover:bg-[#222] disabled:opacity-20 transition-colors"
                      title="Move up"
                    >
                      <svg
                        className="w-3.5 h-3.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                      </svg>
                    </button>
                    <button
                      onClick={() => moveNews(i, 1)}
                      disabled={i === (config.liveNews || []).length - 1}
                      className="p-1.5 rounded hover:bg-[#222] disabled:opacity-20 transition-colors"
                      title="Move down"
                    >
                      <svg
                        className="w-3.5 h-3.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    <button
                      onClick={() => removeNews(i)}
                      className="p-1.5 rounded hover:bg-red-500/20 text-neutral-500 hover:text-red-400 transition-colors"
                      title="Remove"
                    >
                      <svg
                        className="w-3.5 h-3.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M6 18L18 6M6 6l12 12"
                        />
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
                Add News Stream
              </p>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  placeholder="YouTube URL or video ID"
                  value={newNewsUrl}
                  onChange={(e) => setNewNewsUrl(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addNews()}
                  className="flex-1 bg-[#1a1a1a] border border-[#2a2a2a] rounded-md px-3 py-2 text-sm text-neutral-200 placeholder-neutral-600 outline-none focus:border-neutral-500 transition-colors"
                />
                <input
                  type="text"
                  placeholder="Label (optional)"
                  value={newNewsLabel}
                  onChange={(e) => setNewNewsLabel(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addNews()}
                  className="sm:w-40 bg-[#1a1a1a] border border-[#2a2a2a] rounded-md px-3 py-2 text-sm text-neutral-200 placeholder-neutral-600 outline-none focus:border-neutral-500 transition-colors"
                />
                <button
                  onClick={addNews}
                  disabled={!newNewsUrl.trim()}
                  className="px-4 py-2 bg-red-500/20 text-red-400 border border-red-500/30 rounded-md text-sm font-medium hover:bg-red-500/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  Add
                </button>
              </div>
            </div>
          </section>
        )}

        {/* ── Live Cams ── */}
        {config && (
          <section>
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
                      <svg
                        className="w-3.5 h-3.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                      </svg>
                    </button>
                    <button
                      onClick={() => moveCam(i, 1)}
                      disabled={i === config.liveCams.length - 1}
                      className="p-1.5 rounded hover:bg-[#222] disabled:opacity-20 transition-colors"
                      title="Move down"
                    >
                      <svg
                        className="w-3.5 h-3.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    <button
                      onClick={() => removeCam(i)}
                      className="p-1.5 rounded hover:bg-red-500/20 text-neutral-500 hover:text-red-400 transition-colors"
                      title="Remove"
                    >
                      <svg
                        className="w-3.5 h-3.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M6 18L18 6M6 6l12 12"
                        />
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
          </section>
        )}

        {/* ── Government Speech ── */}
        {config && (
          <section>
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
          </section>
        )}
      </div>
    </div>
  );
}
