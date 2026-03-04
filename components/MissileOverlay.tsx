"use client";

import { useEffect, useRef, useMemo, useCallback } from "react";
import mapboxgl from "mapbox-gl";
import { MissileAlert } from "@/lib/types";
import { greatCircleArc, interpolateArc, bearingAtArcPoint } from "@/lib/greatCircle";
import { startSiren, stopSiren } from "@/lib/sounds";

interface MissileOverlayProps {
  alerts: MissileAlert[];
  map: mapboxgl.Map | null;
  onAlertClick?: (alert: MissileAlert) => void;
  soundEnabled?: boolean;
}

interface MissileState {
  alertId: string;
  arc: [number, number][]; // full great-circle arc [lng, lat][]
  startTime: number;
  duration: number;
  isDrone: boolean;
  headMarker: mapboxgl.Marker;
  originMarker: mapboxgl.Marker;
  impactMarker: mapboxgl.Marker;
  sourceId: string;
  glowLayerId: string;
  lineLayerId: string;
  lastArcIndex: number; // track how many points are in the trail GeoJSON
  arrived: boolean;
}

// Flight durations
const MISSILE_FLIGHT_MS = 3.5 * 60 * 1000;
const DRONE_FLIGHT_MS = 8 * 60 * 1000;
const MIN_VISIBLE_FLIGHT_MS = 4000;
const ARC_POINTS = 64;

const MISSILE_SVG = `<svg viewBox="0 0 48 48" width="48" height="48" xmlns="http://www.w3.org/2000/svg">
  <circle cx="24" cy="24" r="18" fill="rgba(255,60,60,0.35)"/>
  <circle cx="24" cy="24" r="10" fill="rgba(255,80,80,0.5)"/>
  <rect x="8" y="22" width="28" height="4" rx="1.5" fill="#ff4444" stroke="#fff" stroke-width="0.8"/>
  <path d="M36 22 L44 24 L36 26 Z" fill="#ffffff"/>
  <path d="M8 22 L13 22 L8 18 Z" fill="#cc3333" stroke="#fff" stroke-width="0.5"/>
  <path d="M8 26 L13 26 L8 30 Z" fill="#cc3333" stroke="#fff" stroke-width="0.5"/>
  <path d="M4 22.5 L8 24 L4 25.5 Z" fill="#ff8c00"/>
  <path d="M2 23 L5 24 L2 25 Z" fill="#ffcc00" opacity="0.8"/>
</svg>`;

const DRONE_SVG = `<svg viewBox="0 0 28 28" width="28" height="28" xmlns="http://www.w3.org/2000/svg">
  <path d="M14 9 L22 14 L14 16 L6 14 Z" fill="#a855f7" stroke="#fff" stroke-width="0.5"/>
  <line x1="7" y1="10" x2="21" y2="10" stroke="#a855f7" stroke-width="1.5"/>
  <circle cx="7" cy="10" r="2.5" fill="#a855f7" stroke="#fff" stroke-width="0.5"/>
  <circle cx="21" cy="10" r="2.5" fill="#a855f7" stroke="#fff" stroke-width="0.5"/>
  <circle cx="7" cy="18" r="2.5" fill="#a855f7" stroke="#fff" stroke-width="0.5"/>
  <circle cx="21" cy="18" r="2.5" fill="#a855f7" stroke="#fff" stroke-width="0.5"/>
  <line x1="7" y1="18" x2="21" y2="18" stroke="#a855f7" stroke-width="1.5"/>
</svg>`;

// Tehran fallback
const IRAN_DEFAULT_ORIGIN = { lat: 35.6892, lng: 51.3890 };

/**
 * Get the current UTC offset for Israel (IST +02:00 / IDT +03:00).
 */
function getIsraelOffset(): string {
  const now = new Date();
  const israelTime = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Jerusalem" }));
  const diffMs = israelTime.getTime() - now.getTime() + now.getTimezoneOffset() * 60000;
  const diffHours = Math.round(diffMs / 3600000);
  return `+${String(diffHours).padStart(2, "0")}:00`;
}

function getAlertEpoch(alert: MissileAlert): number {
  const offset = getIsraelOffset();
  const dateMatch = alert.rawText?.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  const timeMatch = alert.rawText?.match(/(\d{1,2}:\d{2})[:\s)]/);
  if (dateMatch && timeMatch) {
    const [, dd, mm, yyyy] = dateMatch;
    const [hh, min] = timeMatch[1].split(":");
    const d = new Date(`${yyyy}-${mm}-${dd}T${hh.padStart(2, "0")}:${min}:00${offset}`);
    if (!isNaN(d.getTime())) return d.getTime();
  }
  if (alert.timestamp) {
    const [hh, min] = alert.timestamp.split(":");
    const now = new Date();
    const d = new Date(
      `${now.toISOString().split("T")[0]}T${hh.padStart(2, "0")}:${min}:00${offset}`
    );
    if (!isNaN(d.getTime())) return d.getTime();
  }
  return Date.now();
}

function createHeadMarkerEl(isDrone: boolean, title: string, onClick: () => void): HTMLDivElement {
  const el = document.createElement("div");
  el.className = isDrone ? "drone-icon" : "missile-icon";
  el.innerHTML = isDrone ? DRONE_SVG : MISSILE_SVG;
  el.style.cursor = "pointer";
  el.title = title;
  el.addEventListener("click", (e) => {
    e.stopPropagation();
    onClick();
  });
  return el;
}

function createOriginMarkerEl(isDrone: boolean, siteName?: string): HTMLDivElement {
  const el = document.createElement("div");
  el.className = isDrone ? "launch-site-marker drone" : "launch-site-marker";
  if (siteName) el.title = `Launch site: ${siteName}`;
  return el;
}

function createImpactMarkerEl(isDrone: boolean, onClick: () => void): HTMLDivElement {
  const el = document.createElement("div");
  el.className = isDrone ? "drone-pulse" : "impact-ring";
  el.style.cursor = "pointer";
  el.addEventListener("click", (e) => {
    e.stopPropagation();
    onClick();
  });
  return el;
}

export default function MissileOverlay({ alerts, map, onAlertClick, soundEnabled = true }: MissileOverlayProps) {
  const statesRef = useRef<Map<string, MissileState>>(new Map());
  const rafRef = useRef<number>(0);
  const alertsRef = useRef(alerts);
  alertsRef.current = alerts;
  const soundRef = useRef(soundEnabled);
  soundRef.current = soundEnabled;
  const onAlertClickRef = useRef(onAlertClick);
  onAlertClickRef.current = onAlertClick;
  const lastFrameRef = useRef(0);

  const activeAlerts = useMemo(
    () => alerts.filter((a) => a.lat !== 0 && a.lng !== 0 && a.status === "active"),
    [alerts]
  );

  // Clean up a single missile's Mapbox resources
  const cleanupMissile = useCallback((state: MissileState, currentMap: mapboxgl.Map) => {
    state.headMarker.remove();
    state.originMarker.remove();
    state.impactMarker.remove();
    try {
      if (currentMap.getLayer(state.glowLayerId)) currentMap.removeLayer(state.glowLayerId);
      if (currentMap.getLayer(state.lineLayerId)) currentMap.removeLayer(state.lineLayerId);
      if (currentMap.getSource(state.sourceId)) currentMap.removeSource(state.sourceId);
    } catch {
      // layers/sources may already be gone if map is being destroyed
    }
  }, []);

  // Setup / teardown missile states
  useEffect(() => {
    if (!map) return;

    const currentMap = map;

    for (const alert of activeAlerts) {
      if (statesRef.current.has(alert.id)) continue;

      const isDrone = alert.threatType === "drone";
      const isTest = alert.id.startsWith("test-");
      const isTimeline = alert.id.startsWith("timeline-");
      const duration = (isTest || isTimeline)
        ? (isDrone ? 20_000 : 12_000)
        : (isDrone ? DRONE_FLIGHT_MS : MISSILE_FLIGHT_MS);

      let startTime: number;
      if (isTest || isTimeline) {
        startTime = Date.now();
      } else {
        const alertEpoch = getAlertEpoch(alert);
        const elapsed = Date.now() - alertEpoch;
        if (elapsed >= duration) {
          startTime = Date.now() - (duration - MIN_VISIBLE_FLIGHT_MS);
        } else {
          startTime = alertEpoch;
        }
      }

      const originLat = alert.originLat || IRAN_DEFAULT_ORIGIN.lat;
      const originLng = alert.originLng || IRAN_DEFAULT_ORIGIN.lng;

      // Compute great-circle arc
      const arc = greatCircleArc(
        [originLng, originLat],
        [alert.lng, alert.lat],
        ARC_POINTS,
      ) as [number, number][];

      const alertId = alert.id;
      const handleClick = () => {
        const current = alertsRef.current.find((a) => a.id === alertId);
        if (current) onAlertClickRef.current?.(current);
      };

      const title = isDrone
        ? `Hostile drone incursion — ${alert.regions.join(", ") || alert.cities.slice(0, 3).join(", ")}`
        : `Incoming hostile missiles — ${alert.regions.join(", ") || alert.cities.slice(0, 3).join(", ")}`;

      // Create markers
      const headEl = createHeadMarkerEl(isDrone, title, handleClick);
      const headMarker = new mapboxgl.Marker({ element: headEl, anchor: "center", rotationAlignment: "map" })
        .setLngLat([originLng, originLat])
        .addTo(currentMap);

      const originEl = createOriginMarkerEl(isDrone, alert.originName);
      const originMarker = new mapboxgl.Marker({ element: originEl, anchor: "center" })
        .setLngLat([originLng, originLat])
        .addTo(currentMap);

      const impactEl = createImpactMarkerEl(isDrone, handleClick);
      const impactMarker = new mapboxgl.Marker({ element: impactEl, anchor: "center" })
        .setLngLat([alert.lng, alert.lat]);
      // Don't add to map yet — only shown on arrival

      // Create Mapbox source + layers for the trail
      const sourceId = `missile-trail-${alertId}`;
      const glowLayerId = `missile-glow-${alertId}`;
      const lineLayerId = `missile-line-${alertId}`;

      const color = isDrone ? "#a855f7" : "#ef4444";

      currentMap.addSource(sourceId, {
        type: "geojson",
        data: {
          type: "Feature",
          properties: {},
          geometry: { type: "LineString", coordinates: [arc[0]] },
        },
        lineMetrics: true,
      });

      // Glow layer (wider, blurred, low opacity)
      currentMap.addLayer({
        id: glowLayerId,
        type: "line",
        source: sourceId,
        paint: {
          "line-color": color,
          "line-width": 12,
          "line-blur": 8,
          "line-opacity": 0.25,
          "line-gradient": [
            "interpolate", ["linear"], ["line-progress"],
            0, "transparent",
            0.3, color,
            1, color,
          ],
        },
        layout: { "line-cap": "round", "line-join": "round" },
      });

      // Main trail line
      currentMap.addLayer({
        id: lineLayerId,
        type: "line",
        source: sourceId,
        paint: {
          "line-color": color,
          "line-width": [
            "interpolate", ["linear"], ["line-progress"],
            0, 1.5,
            0.35, 3.5,
            0.65, 3.5,
            1, 1.5,
          ],
          "line-opacity": 0.85,
          "line-gradient": [
            "interpolate", ["linear"], ["line-progress"],
            0, "transparent",
            0.15, color,
            1, color,
          ],
        },
        layout: {
          "line-cap": "round",
          "line-join": "round",
        },
      });

      statesRef.current.set(alertId, {
        alertId,
        arc,
        startTime,
        duration,
        isDrone,
        headMarker,
        originMarker,
        impactMarker,
        sourceId,
        glowLayerId,
        lineLayerId,
        lastArcIndex: 0,
        arrived: false,
      });
    }

    // Remove states for alerts no longer active
    const activeIds = new Set(activeAlerts.map((a) => a.id));
    for (const [id, state] of statesRef.current) {
      if (!activeIds.has(id)) {
        cleanupMissile(state, currentMap);
        statesRef.current.delete(id);
      }
    }
  }, [activeAlerts, map, cleanupMissile]);

  // Animation loop
  useEffect(() => {
    if (!map || activeAlerts.length === 0) {
      stopSiren();
      return;
    }

    const currentMap = map;

    function render() {
      const now = Date.now();

      // Throttle to ~30fps
      if (now - lastFrameRef.current < 33) {
        rafRef.current = requestAnimationFrame(render);
        return;
      }
      lastFrameRef.current = now;

      let anyActive = false;

      for (const state of statesRef.current.values()) {
        const elapsed = now - state.startTime;
        const t = Math.min(elapsed / state.duration, 1);

        if (t < 1) {
          // -- In flight --
          anyActive = true;

          // Update head marker position
          const headPos = interpolateArc(state.arc, t);
          state.headMarker.setLngLat(headPos);
          state.headMarker.getElement().style.display = "block";

          // Rotate head marker to match bearing
          const bearing = bearingAtArcPoint(state.arc, t);
          state.headMarker.setRotation(bearing - 90); // SVG points right, bearing is from north

          // Update trail GeoJSON — only when trail has grown by 1+ points
          const currentArcIndex = Math.floor(t * ARC_POINTS);
          if (currentArcIndex > state.lastArcIndex) {
            state.lastArcIndex = currentArcIndex;
            const trailCoords = state.arc.slice(0, currentArcIndex + 1);
            // Append current head position for smooth tip
            trailCoords.push(headPos);
            const source = currentMap.getSource(state.sourceId) as mapboxgl.GeoJSONSource | undefined;
            if (source) {
              source.setData({
                type: "Feature",
                properties: {},
                geometry: { type: "LineString", coordinates: trailCoords },
              });
            }
          }
        } else {
          // -- Arrived --
          anyActive = true;

          if (!state.arrived) {
            state.arrived = true;

            // Hide missile head for missiles, keep for drones
            if (!state.isDrone) {
              state.headMarker.getElement().style.display = "none";
            } else {
              // Park drone at target
              state.headMarker.setLngLat([state.arc[state.arc.length - 1][0], state.arc[state.arc.length - 1][1]]);
            }

            // Show impact/pulse marker
            state.impactMarker.addTo(currentMap);

            // Set full trail
            const source = currentMap.getSource(state.sourceId) as mapboxgl.GeoJSONSource | undefined;
            if (source) {
              source.setData({
                type: "Feature",
                properties: {},
                geometry: { type: "LineString", coordinates: state.arc },
              });
            }
          }
        }
      }

      // Siren control
      if (anyActive && soundRef.current) {
        startSiren();
      } else {
        stopSiren();
      }

      rafRef.current = requestAnimationFrame(render);
    }

    rafRef.current = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(rafRef.current);
      stopSiren();
    };
  }, [map, activeAlerts.length > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  // Full cleanup on unmount
  useEffect(() => {
    return () => {
      if (!map) return;
      for (const state of statesRef.current.values()) {
        cleanupMissile(state, map);
      }
      statesRef.current.clear();
    };
  }, [map, cleanupMissile]);

  // No DOM container needed — everything is Mapbox-native
  return null;
}
