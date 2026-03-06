"use client";

import { memo, useState, useEffect, useRef } from "react";
import { InterceptionOutcome } from "@/lib/types";
import { INTERCEPTION_BANNER_AUTO_DISMISS_MS } from "@/lib/constants";

interface InterceptionBannerProps {
  outcomes: InterceptionOutcome[];
}

export default memo(function InterceptionBanner({ outcomes }: InterceptionBannerProps) {
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const autoDismissTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Auto-dismiss each outcome after 2 minutes
  useEffect(() => {
    for (const outcome of outcomes) {
      if (dismissedIds.has(outcome.id)) continue;
      if (autoDismissTimers.current.has(outcome.id)) continue;

      const timer = setTimeout(() => {
        setDismissedIds((prev) => new Set([...prev, outcome.id]));
        autoDismissTimers.current.delete(outcome.id);
      }, INTERCEPTION_BANNER_AUTO_DISMISS_MS);

      autoDismissTimers.current.set(outcome.id, timer);
    }

    return () => {
      for (const [id, timer] of autoDismissTimers.current) {
        if (!outcomes.find((o) => o.id === id)) {
          clearTimeout(timer);
          autoDismissTimers.current.delete(id);
        }
      }
    };
  }, [outcomes, dismissedIds]);

  const visibleOutcomes = outcomes.filter((o) => !dismissedIds.has(o.id));
  if (visibleOutcomes.length === 0) return null;

  return (
    <div className="fixed top-[56px] z-[54] pointer-events-none left-2 right-2 md:left-[17rem] md:right-[19rem] flex flex-col items-center gap-2">
      {visibleOutcomes.map((outcome) => {
        const isHit = outcome.intercepted === false;
        return (
          <div
            key={outcome.id}
            className={`${isHit ? "interception-banner-inner hit-target" : "interception-banner-inner"} pointer-events-auto px-3 py-2.5 md:px-6 md:py-3 rounded-lg border ${isHit ? "border-orange-500/80 shadow-[0_0_40px_rgba(249,115,22,0.5)]" : "border-blue-500/80 shadow-[0_0_40px_rgba(59,130,246,0.5)]"} max-w-xl w-full relative`}
          >
            <button
              onClick={() => setDismissedIds((prev) => new Set([...prev, outcome.id]))}
              className="absolute top-1.5 right-1.5 text-white/40 hover:text-white transition-colors p-1"
              aria-label="Dismiss"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
            <div className="flex items-center justify-center gap-2">
              {isHit ? (
                <svg className="w-5 h-5 text-orange-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <circle cx="12" cy="12" r="6" />
                  <circle cx="12" cy="12" r="2" />
                </svg>
              ) : (
                <svg className="w-5 h-5 text-blue-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
              )}
              <span
                className="text-sm font-bold uppercase tracking-wider text-white"
                style={{ fontFamily: "JetBrains Mono, monospace" }}
              >
                {outcome.summary}
              </span>
              {isHit ? (
                <svg className="w-5 h-5 text-orange-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <circle cx="12" cy="12" r="6" />
                  <circle cx="12" cy="12" r="2" />
                </svg>
              ) : (
                <svg className="w-5 h-5 text-blue-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
              )}
            </div>
            <p className="text-[10px] text-white/50 mt-1 text-center">
              via IDF Spokesperson &bull;{" "}
              {new Date(outcome.detectedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </p>
          </div>
        );
      })}
    </div>
  );
});
