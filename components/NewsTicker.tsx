"use client";

import { memo, useMemo, useRef, useEffect, useCallback } from "react";
import { Incident } from "@/lib/types";

interface BriefingHeadline {
  headline: string;
  severity: "low" | "medium" | "high" | "critical";
}

interface NewsTickerProps {
  incidents: Incident[];
  customText?: string | null;
  briefingHeadlines?: BriefingHeadline[];
}

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

function formatTimeAgo(ts: string): string {
  const t = new Date(ts).getTime();
  if (isNaN(t)) return "";
  const diff = Date.now() - t;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function buildHeadline(inc: Incident): string {
  const parts: string[] = [];

  const sideLabel =
    inc.side === "iran" ? "IRAN STRIKE" :
    inc.side === "us_israel" ? "US/ISRAEL STRIKE" :
    inc.side === "us" ? "US STRIKE" :
    inc.side === "israel" ? "ISRAEL STRIKE" : "STRIKE";

  parts.push(sideLabel + ":");

  if (inc.location) {
    parts.push(inc.location);
  } else if (inc.description) {
    parts.push(inc.description.slice(0, 80));
  }

  if (inc.weapon) parts.push(`— ${inc.weapon}`);

  const cas = (inc.casualties_military || 0) + (inc.casualties_civilian || 0);
  if (cas > 0) parts.push(`— ${cas} casualties`);

  if (inc.damage_severity === "catastrophic" || inc.damage_severity === "severe") {
    parts.push(`— ${inc.damage_severity} damage`);
  }

  if (inc.intercepted_by) {
    parts.push(`— intercepted by ${inc.intercepted_by}`);
  }

  const time = inc.timestamp || inc.date;
  const ago = time ? formatTimeAgo(time) : "";
  if (ago) parts.push(`(${ago})`);

  return parts.join(" ");
}

function scoreIncident(inc: Incident): number {
  let s = 0;
  if (inc.damage_severity === "catastrophic") s += 100;
  else if (inc.damage_severity === "severe") s += 50;
  else if (inc.damage_severity === "moderate") s += 20;
  s += (inc.casualties_military || 0) + (inc.casualties_civilian || 0);
  return s;
}

function getIncidentTime(inc: Incident): number {
  const ts = inc.timestamp || inc.date;
  if (!ts) return 0;
  const t = new Date(ts).getTime();
  return isNaN(t) ? 0 : t;
}

const SEVERITY_PREFIX: Record<string, string> = {
  critical: "BREAKING",
  high: "ALERT",
  medium: "UPDATE",
  low: "REPORT",
};

const SEP = "     \u2022     "; // bullet separator

export default memo(function NewsTicker({ incidents, customText, briefingHeadlines }: NewsTickerProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<number>(0);
  const posRef = useRef(0);

  const headlines = useMemo(() => {
    // Prefer briefing headlines if available
    if (briefingHeadlines && briefingHeadlines.length > 0) {
      return briefingHeadlines.map((h) => {
        const prefix = SEVERITY_PREFIX[h.severity] || "REPORT";
        return `${prefix}: ${h.headline}`;
      });
    }

    // Fallback: build from incidents within past 6 hours
    if (incidents.length === 0) return [];

    const cutoff = Date.now() - SIX_HOURS_MS;
    const recent = incidents.filter((i) => {
      if (i.isStatement) return false;
      const t = getIncidentTime(i);
      return t >= cutoff;
    });

    if (recent.length === 0) {
      // Nothing in 6h — show top incidents by severity regardless of time
      const sorted = [...incidents]
        .filter((i) => !i.isStatement)
        .sort((a, b) => {
          const sA = scoreIncident(a);
          const sB = scoreIncident(b);
          if (sA !== sB) return sB - sA;
          return getIncidentTime(b) - getIncidentTime(a);
        })
        .slice(0, 10);
      return sorted.map(buildHeadline).filter((h) => h.length > 15);
    }

    const sorted = [...recent]
      .sort((a, b) => {
        const sA = scoreIncident(a);
        const sB = scoreIncident(b);
        if (sA !== sB) return sB - sA;
        return getIncidentTime(b) - getIncidentTime(a);
      })
      .slice(0, 15);

    return sorted.map(buildHeadline).filter((h) => h.length > 15);
  }, [incidents, briefingHeadlines]);

  const tickerContent = useMemo(() => {
    const parts: string[] = [];
    if (headlines.length > 0) {
      parts.push(headlines.join(SEP));
    } else {
      parts.push("MONITORING LIVE CONFLICT DATA...");
    }
    if (customText) {
      parts.push(customText);
    }
    return parts.join(SEP);
  }, [headlines, customText]);

  // JS-based scrolling with requestAnimationFrame
  const animate = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;

    const speed = 60; // pixels per second
    let lastTime = performance.now();

    const tick = (now: number) => {
      const delta = (now - lastTime) / 1000;
      lastTime = now;
      posRef.current -= speed * delta;

      // Each copy is half the total scrollWidth
      const halfWidth = el.scrollWidth / 2;
      if (halfWidth > 0 && Math.abs(posRef.current) >= halfWidth) {
        posRef.current += halfWidth;
      }

      el.style.transform = `translateX(${posRef.current}px)`;
      animRef.current = requestAnimationFrame(tick);
    };

    animRef.current = requestAnimationFrame(tick);
  }, []);

  useEffect(() => {
    // Small delay to let the DOM render and measure scrollWidth
    const timer = setTimeout(() => {
      posRef.current = 0;
      animate();
    }, 100);

    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(animRef.current);
    };
  }, [tickerContent, animate]);

  return (
    <div
      className="md:bottom-0 bottom-14"
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        height: 28,
        overflow: "hidden",
        zIndex: 49,
        backgroundColor: "#7f1d1d",
        borderTop: "1px solid #991b1b",
        transform: "translateZ(0)",
        willChange: "transform",
      }}
    >
      {/* Edge fades */}
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 32, zIndex: 10, pointerEvents: "none", background: "linear-gradient(to right, #7f1d1d, transparent)" }} />
      <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 32, zIndex: 10, pointerEvents: "none", background: "linear-gradient(to left, #7f1d1d, transparent)" }} />

      <div style={{ display: "flex", alignItems: "center", height: "100%" }}>
        {/* LIVE badge */}
        <span
          style={{
            flexShrink: 0,
            padding: "0 8px",
            fontSize: 9,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            height: "100%",
            display: "flex",
            alignItems: "center",
            fontFamily: "JetBrains Mono, monospace",
            color: "#ffffff",
            backgroundColor: "rgba(0,0,0,0.25)",
            borderRight: "1px solid rgba(255,255,255,0.15)",
            zIndex: 20,
          }}
        >
          LIVE
        </span>

        {/* Scrolling area */}
        <div style={{ flex: 1, overflow: "hidden", height: "100%", display: "flex", alignItems: "center" }}>
          <div
            ref={scrollRef}
            style={{
              display: "inline-flex",
              whiteSpace: "nowrap",
              fontSize: 11,
              fontFamily: "JetBrains Mono, monospace",
              color: "#fecaca",
            }}
          >
            <span style={{ paddingRight: 80 }}>{tickerContent}</span>
            <span style={{ paddingRight: 80 }}>{tickerContent}</span>
          </div>
        </div>
      </div>
    </div>
  );
});
