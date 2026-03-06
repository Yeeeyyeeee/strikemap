"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Incident, MissileAlert, InterceptionOutcome } from "@/lib/types";
import { playAlertSound, playImpactSound } from "@/lib/sounds";
import { ALERT_POLL_MS, STRIKE_FLASH_DURATION_MS } from "@/lib/constants";
import { SirenAlertClient } from "@/hooks/useSirenPolling";

interface UnifiedPollingOptions {
  soundEnabled: boolean;
  soundAlerts?: boolean;
  soundImpacts?: boolean;
  notificationsEnabled: boolean;
  sendNotification?: (title: string, options: NotificationOptions) => void;
  mapInstance?: { flyTo: (opts: { center: [number, number]; zoom: number; duration: number }) => void } | null;
  autoZoomStrikes?: boolean;
  autoZoomAlerts?: boolean;
  alertCountries?: string[] | "all";
  onNewStrikes?: (incidents: Incident[]) => void;
  onNewSiren?: (country: string) => void;
}

interface UnifiedPollingResult {
  // Incidents
  incidents: Incident[];
  loading: boolean;
  incidentFlashActive: boolean;
  incidentFlashKey: number;
  lastIranStrikeAt: number;
  lastUSStrikeAt: number;
  lastIsraelStrikeAt: number;
  // Alerts
  alerts: MissileAlert[];
  outcomes: InterceptionOutcome[];
  alertFlashActive: boolean;
  alertFlashKey: number;
  activeIsraelRegions: string[];
  // Sirens
  sirenAlerts: SirenAlertClient[];
}

export function useUnifiedPolling(options: UnifiedPollingOptions): UnifiedPollingResult {
  // --- Incident state ---
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [incidentFlashActive, setIncidentFlashActive] = useState(false);
  const incidentFlashKey = useRef(0);
  const [lastIranStrikeAt, setLastIranStrikeAt] = useState(0);
  const [lastUSStrikeAt, setLastUSStrikeAt] = useState(0);
  const [lastIsraelStrikeAt, setLastIsraelStrikeAt] = useState(0);
  const seenIncidentIds = useRef<Set<string>>(new Set());
  const isFirstLoad = useRef(true);

  // --- Alert state ---
  const [alerts, setAlerts] = useState<MissileAlert[]>([]);
  const [outcomes, setOutcomes] = useState<InterceptionOutcome[]>([]);
  const [alertFlashActive, setAlertFlashActive] = useState(false);
  const alertFlashKey = useRef(0);
  const seenAlertIds = useRef<Set<string>>(new Set());
  const alertFirstPoll = useRef(true);

  // --- Siren state ---
  const [sirenAlerts, setSirenAlerts] = useState<SirenAlertClient[]>([]);
  const prevSirenCountries = useRef<Set<string>>(new Set());
  const sirenFirstPoll = useRef(true);

  // --- ETag ---
  const lastEtag = useRef<string | null>(null);

  // Stable ref for options to avoid stale closures
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const poll = useCallback(async () => {
    try {
      const headers: HeadersInit = {};
      if (lastEtag.current) headers["If-None-Match"] = lastEtag.current;

      const res = await fetch("/api/poll", { headers });

      // 304 = nothing changed
      if (res.status === 304) return;

      lastEtag.current = res.headers.get("etag");
      const data = await res.json();

      // ====== INCIDENTS ======
      const allIncidents: Incident[] = data.incidents || [];

      if (isFirstLoad.current) {
        for (const inc of allIncidents) {
          if (inc.lat !== 0 && inc.lng !== 0) seenIncidentIds.current.add(inc.id);
        }
      } else {
        const newIncs = allIncidents.filter(
          (inc) => inc.lat !== 0 && inc.lng !== 0 && !seenIncidentIds.current.has(inc.id)
        );
        for (const inc of newIncs) {
          seenIncidentIds.current.add(inc.id);
        }
        if (newIncs.length > 0) {
          const now = Date.now();
          if (newIncs.some((i) => i.side === "iran")) setLastIranStrikeAt(now);
          if (newIncs.some((i) => i.side === "us" || (i.side === "us_israel" && i.location?.includes("Iran")))) setLastUSStrikeAt(now);
          if (newIncs.some((i) => i.side === "israel" || (i.side === "us_israel" && !i.location?.includes("Iran")))) setLastIsraelStrikeAt(now);

          if (optionsRef.current.soundEnabled && optionsRef.current.soundImpacts !== false) playImpactSound();
          incidentFlashKey.current += 1;
          setIncidentFlashActive(true);
          setTimeout(() => setIncidentFlashActive(false), STRIKE_FLASH_DURATION_MS);

          const first = newIncs[0];

          // Fly to the new strike
          if (optionsRef.current.autoZoomStrikes !== false) {
            optionsRef.current.mapInstance?.flyTo({
              center: [first.lng, first.lat],
              zoom: 7,
              duration: 1500,
            });
          }

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

      // Only update state if incident list actually changed
      setIncidents((prev) => {
        if (prev.length !== allIncidents.length) return allIncidents;
        for (let i = 0; i < prev.length; i++) {
          if (prev[i].id !== allIncidents[i].id) return allIncidents;
        }
        return prev;
      });

      // ====== ALERTS ======
      const newAlerts: MissileAlert[] = data.alerts || [];
      const newOutcomes: InterceptionOutcome[] = data.outcomes || [];

      if (!alertFirstPoll.current) {
        const ac = optionsRef.current.alertCountries;
        const israelEnabled = !ac || ac === "all" || ac.includes("Israel");

        for (const alert of newAlerts) {
          if (!seenAlertIds.current.has(alert.id)) {
            if (israelEnabled) {
              if (optionsRef.current.soundEnabled && optionsRef.current.soundAlerts !== false) playAlertSound();
              alertFlashKey.current += 1;
              setAlertFlashActive(true);
              setTimeout(() => setAlertFlashActive(false), STRIKE_FLASH_DURATION_MS);

              if (alert.lat && alert.lng && optionsRef.current.autoZoomAlerts !== false) {
                optionsRef.current.mapInstance?.flyTo({
                  center: [alert.lng, alert.lat],
                  zoom: 7,
                  duration: 1500,
                });
              }

              if (optionsRef.current.notificationsEnabled && optionsRef.current.sendNotification) {
                const regionText = alert.regions.join(", ") || alert.cities.slice(0, 3).join(", ");
                optionsRef.current.sendNotification("SIRENS GOING OFF IN ISRAEL", {
                  body: `Sirens going off in: ${regionText} — Shelter in ${alert.timeToImpact}s`,
                  tag: `alert-${alert.id}`,
                });
              }
            }
            break;
          }
        }
      }

      seenAlertIds.current = new Set(newAlerts.map((a) => a.id));
      setAlerts(newAlerts);
      setOutcomes(newOutcomes);

      // ====== SIRENS ======
      const newSirenAlerts: SirenAlertClient[] = data.sirenAlerts || [];

      if (!sirenFirstPoll.current) {
        const newCountries = new Set(newSirenAlerts.map((a) => a.country));
        const prevSet = prevSirenCountries.current;
        const ac = optionsRef.current.alertCountries;

        for (const country of newCountries) {
          if (!prevSet.has(country)) {
            const countryEnabled = !ac || ac === "all" || ac.includes(country);
            if (countryEnabled) {
              if (optionsRef.current.soundEnabled && optionsRef.current.soundAlerts !== false) {
                playAlertSound();
              }
              if (optionsRef.current.notificationsEnabled && optionsRef.current.sendNotification) {
                optionsRef.current.sendNotification(
                  `SIRENS IN ${country.toUpperCase()}`,
                  {
                    body: `Sirens reported in ${country} — take shelter`,
                    tag: `siren-${country}`,
                  }
                );
              }
              optionsRef.current.onNewSiren?.(country);
            }
          }
        }
        prevSirenCountries.current = newCountries;
      } else {
        prevSirenCountries.current = new Set(newSirenAlerts.map((a) => a.country));
      }

      setSirenAlerts(newSirenAlerts);

      // ====== FIRST LOAD FLAGS ======
      isFirstLoad.current = false;
      alertFirstPoll.current = false;
      sirenFirstPoll.current = false;
    } catch {
      // Keep existing state on error
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    poll();
    const interval = setInterval(poll, ALERT_POLL_MS);
    return () => clearInterval(interval);
  }, [poll]);

  // Derive active Israel siren regions from current Tzofar alerts
  const activeIsraelRegions = useMemo(() => {
    const regionSet = new Set<string>();
    for (const alert of alerts) {
      if (alert.status === "active" && alert.regions) {
        for (const r of alert.regions) {
          if (r) regionSet.add(r);
        }
      }
    }
    return Array.from(regionSet);
  }, [alerts]);

  return {
    incidents,
    loading,
    incidentFlashActive,
    incidentFlashKey: incidentFlashKey.current,
    lastIranStrikeAt,
    lastUSStrikeAt,
    lastIsraelStrikeAt,
    alerts,
    outcomes,
    alertFlashActive,
    alertFlashKey: alertFlashKey.current,
    activeIsraelRegions,
    sirenAlerts,
  };
}
