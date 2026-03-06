"use client";

import { useState, useEffect } from "react";
import ChatPanel from "@/components/ChatPanel";

export default function ModPage() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [modName, setModName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Check session on mount
  useEffect(() => {
    fetch("/api/mod/auth")
      .then((r) => r.json())
      .then((d) => {
        if (d.authenticated) {
          setModName(d.name);
          setAuthed(true);
        } else {
          setAuthed(false);
        }
      })
      .catch(() => setAuthed(false));
  }, []);

  const login = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/mod/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setModName(data.name);
        setAuthed(true);
      } else {
        setError("Wrong password");
      }
    } catch {
      setError("Connection error");
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    await fetch("/api/mod/auth", { method: "DELETE" });
    setAuthed(false);
    setModName("");
    setPassword("");
  };

  // Loading state
  if (authed === null) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <p className="text-neutral-600 text-sm">Checking session...</p>
      </div>
    );
  }

  // Login screen
  if (!authed) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="w-full max-w-xs">
          <h1
            className="text-xs font-bold uppercase tracking-wider text-neutral-500 text-center mb-6"
            style={{ fontFamily: "JetBrains Mono, monospace" }}
          >
            Moderator Login
          </h1>
          <div className="bg-[#151515] border border-[#2a2a2a] rounded-lg p-5 space-y-4">
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && login()}
              autoFocus
              className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-md px-3 py-2.5 text-sm text-neutral-200 placeholder-neutral-600 outline-none focus:border-neutral-500 transition-colors"
            />
            {error && (
              <p className="text-red-400 text-xs text-center">{error}</p>
            )}
            <button
              onClick={login}
              disabled={loading || !password}
              className="w-full py-2.5 bg-green-500/20 text-green-400 border border-green-500/30 rounded-md text-sm font-medium hover:bg-green-500/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? "..." : "Log in"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Mod panel with embedded chat
  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#2a2a2a] bg-[#111]">
        <div className="flex items-center gap-3">
          <h1
            className="text-xs font-bold uppercase tracking-wider text-neutral-500"
            style={{ fontFamily: "JetBrains Mono, monospace" }}
          >
            Mod Panel
          </h1>
          <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-green-500/20 text-green-400 border border-green-500/30">
            {modName}
          </span>
        </div>
        <button
          onClick={logout}
          className="text-[11px] text-neutral-500 hover:text-neutral-300 transition-colors"
        >
          Logout
        </button>
      </div>

      {/* Chat panel - rendered inline, always open */}
      <div className="flex-1 relative">
        <ChatPanel
          open={true}
          onClose={() => {}}
          defaultTab="chat"
          modMode={true}
          modName={modName}
        />
      </div>
    </div>
  );
}
