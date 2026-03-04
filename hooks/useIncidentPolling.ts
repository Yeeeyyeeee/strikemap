"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Incident } from "@/lib/types";
import { playImpactSound } from "@/lib/sounds";
import { INCIDENT_POLL_MS, STRIKE_FLASH_DURATION_MS } from "@/lib/constants";

interface IncidentPollingOptions {
  soundEnabled: boolean;
  notificationsEnabled: boolean;
  onNewStrikes?: (incidents: Incident[]) => void;
  sendNotification?: (title: string, options: NotificationOptions) => void;
  mapInstance?: {
    flyTo: (opts: { center: [number, number]; zoom: number; duration: number }) => void;
  } | null;
}

interface IncidentPollingResult {
  incidents: Incident[];
  loading: boolean;
  flashActive: boolean;
  flashKey: number;
  lastIranStrikeAt: number;
  lastUSStrikeAt: number;
  lastIsraelStrikeAt: number;
}

export function useIncidentPolling(options: IncidentPollingOptions): IncidentPollingResult {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [flashActive, setFlashActive] = useState(false);
  const flashKey = useRef(0);
  const [lastIranStrikeAt, setLastIranStrikeAt] = useState(0);
  const [lastUSStrikeAt, setLastUSStrikeAt] = useState(0);
  const [lastIsraelStrikeAt, setLastIsraelStrikeAt] = useState(0);

  const seenIncidentIds = useRef<Set<string>>(new Set());
  const isFirstLoad = useRef(true);

  // Keep refs to avoid stale closures
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const lastEtag = useRef<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      // Skip polling when tab is hidden — save server load
      if (document.hidden && !isFirstLoad.current) return;

      const headers: HeadersInit = {};
      if (lastEtag.current) headers["If-None-Match"] = lastEtag.current;

      const res = await fetch("/api/incidents", { headers });

      // 304 = nothing changed, skip the expensive JSON parse + React update
      if (res.status === 304) return;

      lastEtag.current = res.headers.get("etag");
      const data = await res.json();
      const allData: Incident[] = data.incidents || [];

      if (isFirstLoad.current) {
        for (const inc of allData) {
          if (inc.lat !== 0 && inc.lng !== 0) seenIncidentIds.current.add(inc.id);
        }
        isFirstLoad.current = false;
      } else {
        const newIncs = allData.filter(
          (inc: Incident) => inc.lat !== 0 && inc.lng !== 0 && !seenIncidentIds.current.has(inc.id)
        );
        for (const inc of newIncs) {
          seenIncidentIds.current.add(inc.id);
        }
        if (newIncs.length > 0) {
          const now = Date.now();
          if (newIncs.some((i) => i.side === "iran")) setLastIranStrikeAt(now);
          if (
            newIncs.some(
              (i) => i.side === "us" || (i.side === "us_israel" && i.location?.includes("Iran"))
            )
          )
            setLastUSStrikeAt(now);
          if (
            newIncs.some(
              (i) =>
                i.side === "israel" || (i.side === "us_israel" && !i.location?.includes("Iran"))
            )
          )
            setLastIsraelStrikeAt(now);

          if (optionsRef.current.soundEnabled) playImpactSound();
          flashKey.current += 1;
          setFlashActive(true);
          setTimeout(() => setFlashActive(false), STRIKE_FLASH_DURATION_MS);

          // Fly to the new strike
          const first = newIncs[0];
          optionsRef.current.mapInstance?.flyTo({
            center: [first.lng, first.lat],
            zoom: 7,
            duration: 1500,
          });

          // Push notification
          if (optionsRef.current.notificationsEnabled && optionsRef.current.sendNotification) {
            optionsRef.current.sendNotification("New Strike Detected", {
              body: `${first.weapon || "Strike"} at ${first.location} — ${first.description.slice(0, 100)}`,
              tag: `strike-${first.id}`,
            });
          }

          optionsRef.current.onNewStrikes?.(newIncs);
        }
      }

      // Only update state if incident list actually changed (avoids cascade re-renders)
      setIncidents((prev) => {
        if (prev.length !== allData.length) return allData;
        for (let i = 0; i < prev.length; i++) {
          if (prev[i].id !== allData[i].id) return allData;
        }
        return prev;
      });
    } catch {
      // Keep whatever we already have
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, INCIDENT_POLL_MS);
    return () => clearInterval(interval);
  }, [loadData]);

  return {
    incidents,
    loading,
    flashActive,
    flashKey: flashKey.current,
    lastIranStrikeAt,
    lastUSStrikeAt,
    lastIsraelStrikeAt,
  };
}
