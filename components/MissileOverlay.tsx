"use client";

import { useEffect, useRef, useCallback } from "react";
import mapboxgl from "mapbox-gl";
import { MissileAlert } from "@/lib/types";
import { startSiren, stopSiren } from "@/lib/sounds";

interface MissileOverlayProps {
  alerts: MissileAlert[];
  map: mapboxgl.Map | null;
  onAlertClick?: (alert: MissileAlert) => void;
}

interface AnimState {
  startTime: number; // based on alert timestamp, not Date.now()
  duration: number;  // ms
  cleared: boolean;
  clearTime: number;
}

// Flight duration: 3.5 minutes
const FLIGHT_DURATION_MS = 3.5 * 60 * 1000;

/** Quadratic Bezier point at parameter t */
function bezier(
  t: number,
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  p2: { x: number; y: number }
) {
  const mt = 1 - t;
  return {
    x: mt * mt * p0.x + 2 * mt * t * p1.x + t * t * p2.x,
    y: mt * mt * p0.y + 2 * mt * t * p1.y + t * t * p2.y,
  };
}

/** Quadratic Bezier tangent angle at parameter t (for rotation) */
function bezierAngle(
  t: number,
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  p2: { x: number; y: number }
) {
  const mt = 1 - t;
  const dx = 2 * mt * (p1.x - p0.x) + 2 * t * (p2.x - p1.x);
  const dy = 2 * mt * (p1.y - p0.y) + 2 * t * (p2.y - p1.y);
  return Math.atan2(dy, dx);
}

/** Build SVG path string for a quadratic Bezier */
function bezierPath(
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  p2: { x: number; y: number }
) {
  return `M ${p0.x} ${p0.y} Q ${p1.x} ${p1.y} ${p2.x} ${p2.y}`;
}

/**
 * Parse the alert timestamp into an epoch ms.
 * The alert has a timestamp like "13:28" and a date from the post.
 * We use the alert's raw timestamp field to derive when it was issued.
 */
function getAlertEpoch(alert: MissileAlert): number {
  // Try to extract from rawText: "(DD/MM/YYYY HH:MM)" or "(DD/MM/YYYY): HH:MM:"
  const dateMatch = alert.rawText?.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  const timeMatch = alert.rawText?.match(/(\d{1,2}:\d{2})[:\s)]/);
  if (dateMatch && timeMatch) {
    const [, dd, mm, yyyy] = dateMatch;
    const [hh, min] = timeMatch[1].split(":");
    const d = new Date(`${yyyy}-${mm}-${dd}T${hh.padStart(2, "0")}:${min}:00+02:00`);
    if (!isNaN(d.getTime())) return d.getTime();
  }
  // Fallback: use timestamp field "HH:MM" with today's date in Israel
  if (alert.timestamp) {
    const [hh, min] = alert.timestamp.split(":");
    const now = new Date();
    const d = new Date(
      `${now.toISOString().split("T")[0]}T${hh.padStart(2, "0")}:${min}:00+02:00`
    );
    if (!isNaN(d.getTime())) return d.getTime();
  }
  return Date.now();
}

const MISSILE_SVG = `<svg viewBox="0 0 24 24" width="20" height="20" xmlns="http://www.w3.org/2000/svg">
  <path d="M2 12 L8 8 L22 12 L8 16 Z" fill="#ef4444" stroke="#fff" stroke-width="0.5"/>
  <path d="M2 12 L5 9.5 L5 14.5 Z" fill="#f97316"/>
</svg>`;

export default function MissileOverlay({ alerts, map, onAlertClick }: MissileOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const animStates = useRef<Map<string, AnimState>>(new Map());
  const rafRef = useRef<number>(0);
  const elementsRef = useRef<
    Map<string, { missile: HTMLDivElement; trail: SVGSVGElement; ring: HTMLDivElement }>
  >(new Map());

  // Only show active (not cleared) alerts
  const activeAlerts = alerts.filter((a) => a.lat !== 0 && a.lng !== 0 && a.status === "active");

  const render = useCallback(() => {
    if (!map || !containerRef.current) return;
    const now = Date.now();
    let anyInFlight = false;

    for (const alert of activeAlerts) {
      const state = animStates.current.get(alert.id);
      if (!state) continue;

      const els = elementsRef.current.get(alert.id);
      if (!els) continue;

      // Project geo coords to screen pixels
      const origin = map.project([alert.originLng, alert.originLat]);
      const target = map.project([alert.lng, alert.lat]);

      // Control point for the arc — midpoint raised upward
      const midX = (origin.x + target.x) / 2;
      const dist = Math.sqrt((target.x - origin.x) ** 2 + (target.y - origin.y) ** 2);
      const arcHeight = Math.min(dist * 0.4, 400);
      const midY = Math.min(origin.y, target.y) - arcHeight;
      const ctrl = { x: midX, y: midY };

      // Flight progress based on real alert time (survives refresh)
      const elapsed = now - state.startTime;
      const t = Math.min(elapsed / state.duration, 1);

      // Update trail SVG
      const pathD = bezierPath(origin, ctrl, target);
      const pathEl = els.trail.querySelector("path");
      if (pathEl) {
        pathEl.setAttribute("d", pathD);
        const totalLen = pathEl.getTotalLength?.() || dist;
        pathEl.setAttribute("stroke-dasharray", `${totalLen * t} ${totalLen}`);
      }

      if (t < 1) {
        // Missile in flight
        anyInFlight = true;
        const pos = bezier(t, origin, ctrl, target);
        const angle = bezierAngle(t, origin, ctrl, target);
        els.missile.style.transform = `translate(${pos.x - 10}px, ${pos.y - 10}px) rotate(${angle}rad)`;
        els.missile.style.display = "block";
        els.ring.style.display = "none";
      } else {
        // Missile reached target — show impact ring
        anyInFlight = true;
        els.missile.style.display = "none";
        els.ring.style.display = "block";
        els.ring.style.transform = `translate(${target.x}px, ${target.y}px)`;
      }
    }

    // Siren while any alert is active
    if (anyInFlight) {
      startSiren();
    } else {
      stopSiren();
    }

    rafRef.current = requestAnimationFrame(render);
  }, [activeAlerts, map]);

  // Create/remove DOM elements for alerts
  useEffect(() => {
    if (!containerRef.current || !map) return;

    const container = containerRef.current;

    for (const alert of activeAlerts) {
      if (elementsRef.current.has(alert.id)) continue;

      // Use the real alert timestamp so position is consistent across refreshes
      if (!animStates.current.has(alert.id)) {
        const alertEpoch = getAlertEpoch(alert);
        animStates.current.set(alert.id, {
          startTime: alertEpoch,
          duration: FLIGHT_DURATION_MS,
          cleared: false,
          clearTime: 0,
        });
      }

      // Create missile element
      const missile = document.createElement("div");
      missile.className = "missile-icon";
      missile.innerHTML = MISSILE_SVG;
      missile.style.pointerEvents = "auto";
      missile.style.cursor = "pointer";
      missile.title = `Incoming hostile missiles — ${alert.regions.join(", ") || alert.cities.slice(0, 3).join(", ")}`;
      missile.addEventListener("click", (e) => {
        e.stopPropagation();
        onAlertClick?.(alert);
      });
      container.appendChild(missile);

      // Create trail SVG
      const trail = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      trail.setAttribute("class", "missile-trail");
      trail.style.position = "absolute";
      trail.style.inset = "0";
      trail.style.width = "100%";
      trail.style.height = "100%";
      trail.style.pointerEvents = "none";
      trail.style.overflow = "visible";
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", "#ef4444");
      path.setAttribute("stroke-width", "2");
      path.setAttribute("stroke-dasharray", "8 4");
      path.setAttribute("opacity", "0.6");
      trail.appendChild(path);
      container.appendChild(trail);

      // Create impact ring
      const ring = document.createElement("div");
      ring.className = "impact-ring";
      ring.style.display = "none";
      ring.style.pointerEvents = "auto";
      ring.style.cursor = "pointer";
      ring.addEventListener("click", (e) => {
        e.stopPropagation();
        onAlertClick?.(alert);
      });
      container.appendChild(ring);

      elementsRef.current.set(alert.id, { missile, trail, ring });
    }

    // Remove elements for alerts no longer active
    for (const [id, els] of elementsRef.current) {
      if (!activeAlerts.find((a) => a.id === id)) {
        els.missile.remove();
        els.trail.remove();
        els.ring.remove();
        elementsRef.current.delete(id);
        animStates.current.delete(id);
      }
    }
  }, [activeAlerts, map, onAlertClick]);

  // Animation loop
  useEffect(() => {
    if (!map || activeAlerts.length === 0) {
      stopSiren();
      return;
    }

    rafRef.current = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(rafRef.current);
      stopSiren();
    };
  }, [map, activeAlerts, render]);

  // Reproject on map move
  useEffect(() => {
    if (!map) return;
    const handler = () => {};
    map.on("move", handler);
    return () => {
      map.off("move", handler);
    };
  }, [map]);

  return (
    <div
      ref={containerRef}
      className="missile-overlay"
    />
  );
}
