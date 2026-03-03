"use client";

import { useEffect, useRef, useMemo } from "react";
import mapboxgl from "mapbox-gl";
import { MissileAlert } from "@/lib/types";
import { startSiren, stopSiren } from "@/lib/sounds";

interface MissileOverlayProps {
  alerts: MissileAlert[];
  map: mapboxgl.Map | null;
  onAlertClick?: (alert: MissileAlert) => void;
  soundEnabled?: boolean;
}

interface AnimState {
  startTime: number; // based on alert timestamp, not Date.now()
  duration: number;  // ms
  cleared: boolean;
  clearTime: number;
}

// Flight durations
const MISSILE_FLIGHT_MS = 3.5 * 60 * 1000; // 3.5 min for missiles
const DRONE_FLIGHT_MS = 8 * 60 * 1000;     // 8 min for drones (slower)

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
 */
function getAlertEpoch(alert: MissileAlert): number {
  const dateMatch = alert.rawText?.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  const timeMatch = alert.rawText?.match(/(\d{1,2}:\d{2})[:\s)]/);
  if (dateMatch && timeMatch) {
    const [, dd, mm, yyyy] = dateMatch;
    const [hh, min] = timeMatch[1].split(":");
    const d = new Date(`${yyyy}-${mm}-${dd}T${hh.padStart(2, "0")}:${min}:00+02:00`);
    if (!isNaN(d.getTime())) return d.getTime();
  }
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

const DRONE_SVG = `<svg viewBox="0 0 24 24" width="22" height="22" xmlns="http://www.w3.org/2000/svg">
  <path d="M12 8 L20 12 L12 14 L4 12 Z" fill="#a855f7" stroke="#fff" stroke-width="0.4"/>
  <line x1="6" y1="9" x2="18" y2="9" stroke="#a855f7" stroke-width="1.5"/>
  <circle cx="6" cy="9" r="2" fill="#a855f7" stroke="#fff" stroke-width="0.4"/>
  <circle cx="18" cy="9" r="2" fill="#a855f7" stroke="#fff" stroke-width="0.4"/>
  <circle cx="6" cy="15" r="2" fill="#a855f7" stroke="#fff" stroke-width="0.4"/>
  <circle cx="18" cy="15" r="2" fill="#a855f7" stroke="#fff" stroke-width="0.4"/>
  <line x1="6" y1="15" x2="18" y2="15" stroke="#a855f7" stroke-width="1.5"/>
</svg>`;

export default function MissileOverlay({ alerts, map, onAlertClick, soundEnabled = true }: MissileOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const animStates = useRef<Map<string, AnimState>>(new Map());
  const rafRef = useRef<number>(0);
  const elementsRef = useRef<
    Map<string, { missile: HTMLDivElement; trail: SVGSVGElement; ring: HTMLDivElement }>
  >(new Map());

  // Stable reference for render loop data — avoids recreating the render callback
  const alertsRef = useRef(alerts);
  alertsRef.current = alerts;
  const mapRef = useRef(map);
  mapRef.current = map;
  const soundRef = useRef(soundEnabled);
  soundRef.current = soundEnabled;
  const onAlertClickRef = useRef(onAlertClick);
  onAlertClickRef.current = onAlertClick;

  // Memoize active alerts by ID to avoid unnecessary re-renders
  const activeAlerts = useMemo(
    () => alerts.filter((a) => a.lat !== 0 && a.lng !== 0 && a.status === "active"),
    [alerts]
  );

  // Create/remove DOM elements for alerts
  useEffect(() => {
    if (!containerRef.current || !map) return;

    const container = containerRef.current;

    for (const alert of activeAlerts) {
      if (elementsRef.current.has(alert.id)) continue;

      const isDrone = alert.threatType === "drone";

      if (!animStates.current.has(alert.id)) {
        const alertEpoch = getAlertEpoch(alert);
        animStates.current.set(alert.id, {
          startTime: alertEpoch,
          duration: isDrone ? DRONE_FLIGHT_MS : MISSILE_FLIGHT_MS,
          cleared: false,
          clearTime: 0,
        });
      }

      // Create missile/drone element
      const missile = document.createElement("div");
      missile.className = isDrone ? "drone-icon" : "missile-icon";
      missile.innerHTML = isDrone ? DRONE_SVG : MISSILE_SVG;
      missile.style.pointerEvents = "auto";
      missile.style.cursor = "pointer";
      missile.title = isDrone
        ? `Hostile drone incursion — ${alert.regions.join(", ") || alert.cities.slice(0, 3).join(", ")}`
        : `Incoming hostile missiles — ${alert.regions.join(", ") || alert.cities.slice(0, 3).join(", ")}`;
      const alertId = alert.id;
      missile.addEventListener("click", (e) => {
        e.stopPropagation();
        const current = alertsRef.current.find((a) => a.id === alertId);
        if (current) onAlertClickRef.current?.(current);
      });
      container.appendChild(missile);

      // Drones: static pulse ring at target. Missiles: trail SVG + impact ring.
      let trail: SVGSVGElement;
      let ring: HTMLDivElement;

      if (isDrone) {
        // Drone: no trail, just a purple pulse ring
        trail = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        trail.style.display = "none"; // not used for drones

        ring = document.createElement("div");
        ring.className = "drone-pulse";
        ring.style.display = "block";
        ring.style.pointerEvents = "auto";
        ring.style.cursor = "pointer";
        ring.addEventListener("click", (e) => {
          e.stopPropagation();
          const current = alertsRef.current.find((a) => a.id === alertId);
          if (current) onAlertClickRef.current?.(current);
        });
        container.appendChild(ring);
      } else {
        // Missile: animated trail + impact ring
        const trail_ = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        trail_.setAttribute("class", "missile-trail");
        trail_.style.position = "absolute";
        trail_.style.inset = "0";
        trail_.style.width = "100%";
        trail_.style.height = "100%";
        trail_.style.pointerEvents = "none";
        trail_.style.overflow = "visible";
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("fill", "none");
        path.setAttribute("stroke", "#ef4444");
        path.setAttribute("stroke-width", "2");
        path.setAttribute("stroke-dasharray", "8 4");
        path.setAttribute("opacity", "0.6");
        trail_.appendChild(path);
        container.appendChild(trail_);
        trail = trail_;

        ring = document.createElement("div");
        ring.className = "impact-ring";
        ring.style.display = "none";
        ring.style.pointerEvents = "auto";
        ring.style.cursor = "pointer";
        ring.addEventListener("click", (e) => {
          e.stopPropagation();
          const current = alertsRef.current.find((a) => a.id === alertId);
          if (current) onAlertClickRef.current?.(current);
        });
        container.appendChild(ring);
      }

      elementsRef.current.set(alert.id, { missile, trail, ring });
    }

    // Remove elements for alerts no longer active
    const activeIds = new Set(activeAlerts.map((a) => a.id));
    for (const [id, els] of elementsRef.current) {
      if (!activeIds.has(id)) {
        els.missile.remove();
        els.trail.remove();
        els.ring.remove();
        elementsRef.current.delete(id);
        animStates.current.delete(id);
      }
    }
  }, [activeAlerts, map]);

  // Animation loop — uses refs so callback is stable and never recreated
  useEffect(() => {
    if (!map || activeAlerts.length === 0) {
      stopSiren();
      return;
    }

    function render() {
      const currentMap = mapRef.current;
      const container = containerRef.current;
      if (!currentMap || !container) {
        rafRef.current = requestAnimationFrame(render);
        return;
      }

      const now = Date.now();
      let anyInFlight = false;
      const currentAlerts = alertsRef.current.filter(
        (a) => a.lat !== 0 && a.lng !== 0 && a.status === "active"
      );

      for (const alert of currentAlerts) {
        const state = animStates.current.get(alert.id);
        if (!state) continue;

        const els = elementsRef.current.get(alert.id);
        if (!els) continue;

        const isDrone = alert.threatType === "drone";

        if (isDrone) {
          // --- DRONE: static icon at spotted location with pulsing ring ---
          anyInFlight = true;
          const target = currentMap.project([alert.lng, alert.lat]);
          els.missile.style.transform = `translate(${target.x - 11}px, ${target.y - 11}px)`;
          els.missile.style.display = "block";
          els.ring.style.display = "block";
          els.ring.style.transform = `translate(${target.x}px, ${target.y}px)`;
        } else {
          // --- MISSILE: animated Bezier trajectory from origin to target ---
          const rawOrigin = currentMap.project([alert.originLng, alert.originLat]);
          const target = currentMap.project([alert.lng, alert.lat]);

          // Clamp origin to viewport edge if off-screen — preserves direction,
          // prevents broken Bezier curves on mobile when zoomed out
          const cw = container.clientWidth;
          const ch = container.clientHeight;
          const pad = 40; // px padding inside viewport edge
          let origin = rawOrigin;
          const isOffScreen = rawOrigin.x < -pad || rawOrigin.x > cw + pad || rawOrigin.y < -pad || rawOrigin.y > ch + pad;
          if (isOffScreen) {
            // Direction from target to origin
            const dx = rawOrigin.x - target.x;
            const dy = rawOrigin.y - target.y;
            const len = Math.sqrt(dx * dx + dy * dy);
            if (len > 0) {
              const nx = dx / len;
              const ny = dy / len;
              // Walk from target toward origin until we hit viewport edge
              const maxDist = Math.max(cw, ch);
              const sx = target.x + nx * maxDist;
              const sy = target.y + ny * maxDist;
              // Clamp to viewport bounds
              const clampX = Math.max(-pad, Math.min(cw + pad, sx));
              const clampY = Math.max(-pad, Math.min(ch + pad, sy));
              origin = { x: clampX, y: clampY } as mapboxgl.Point;
            }
          }

          // Control point for the arc
          const midX = (origin.x + target.x) / 2;
          const dist = Math.sqrt((target.x - origin.x) ** 2 + (target.y - origin.y) ** 2);
          const arcHeight = Math.min(dist * 0.4, 200);
          const midY = Math.min(origin.y, target.y) - arcHeight;
          const ctrl = { x: midX, y: midY };

          // Flight progress based on real alert time
          const elapsed = now - state.startTime;
          const t = Math.min(elapsed / state.duration, 1);

          // Update trail SVG
          const pathD = bezierPath(origin, ctrl, target);
          const pathEl = els.trail.querySelector("path");
          if (pathEl) {
            pathEl.setAttribute("d", pathD);
            const totalLen = (pathEl as SVGPathElement).getTotalLength?.() || dist;
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
      }

      // Siren while any alert is active
      if (anyInFlight && soundRef.current) {
        startSiren();
      } else {
        stopSiren();
      }

      rafRef.current = requestAnimationFrame(render);
    }

    rafRef.current = requestAnimationFrame(render);

    // Also re-render on map move for reprojection
    const moveHandler = () => {}; // RAF already handles reprojection each frame
    map.on("move", moveHandler);

    return () => {
      cancelAnimationFrame(rafRef.current);
      map.off("move", moveHandler);
      stopSiren();
    };
    // Only restart the loop when activeAlerts changes (memoized) or map changes
  }, [map, activeAlerts.length > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      ref={containerRef}
      className="missile-overlay"
    />
  );
}
