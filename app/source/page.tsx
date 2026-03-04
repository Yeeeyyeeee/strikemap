"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

// ─── Login Screen ───────────────────────────────────────────────
function LoginScreen({ onAuth }: { onAuth: (name: string) => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/source/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        const data = await res.json();
        onAuth(data.sourceName);
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
          Source Login
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

// ─── Siren Alert Type ───────────────────────────────────────────
interface SirenAlertInfo {
  id: string;
  country: string;
  activatedAt: number;
  lastSeenAt: number;
  sourceChannel: string;
  sourceText: string;
  status: string;
}

// ─── Source Portal Page ─────────────────────────────────────────
export default function SourcePage() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [sourceName, setSourceName] = useState("");
  const [sirenAlerts, setSirenAlerts] = useState<SirenAlertInfo[]>([]);
  const [sirenLoading, setSirenLoading] = useState(false);

  // Check existing session on mount
  useEffect(() => {
    fetch("/api/source/auth")
      .then((r) => r.json())
      .then((d) => {
        setAuthed(d.authenticated);
        if (d.sourceName) setSourceName(d.sourceName);
      })
      .catch(() => setAuthed(false));
  }, []);

  // Poll siren alerts
  const loadSirens = useCallback(async () => {
    try {
      const res = await fetch("/api/siren-alerts");
      const data = await res.json();
      setSirenAlerts(data.sirenAlerts || []);
    } catch {
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
    } catch {
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
    } catch {
      /* ignore */
    }
    setSirenLoading(false);
  };

  const logout = async () => {
    await fetch("/api/source/auth", { method: "DELETE" });
    setAuthed(false);
    setSourceName("");
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
        onAuth={(name) => {
          setSourceName(name);
          setAuthed(true);
        }}
      />
    );
  }

  // ─── Portal ───────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-neutral-200">
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
              Source Portal
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-neutral-500">{sourceName}</span>
            <button
              onClick={logout}
              className="text-neutral-600 hover:text-neutral-400 text-xs transition-colors"
            >
              Log out
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-8">
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
      </div>
    </div>
  );
}
