"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { MissileAlert, InterceptionOutcome } from "@/lib/types";
import { fetchAlerts } from "@/lib/fetchAlerts";
import { playAlertSound } from "@/lib/sounds";
import { ALERT_POLL_MS, STRIKE_FLASH_DURATION_MS } from "@/lib/constants";

interface AlertPollingOptions {
  soundEnabled: boolean;
  notificationsEnabled: boolean;
  sendNotification?: (title: string, options: NotificationOptions) => void;
  mapInstance?: { flyTo: (opts: { center: [number, number]; zoom: number; duration: number }) => void } | null;
  alertCountries?: string[] | "all";
}

interface AlertPollingResult {
  alerts: MissileAlert[];
  outcomes: InterceptionOutcome[];
  flashActive: boolean;
  flashKey: number;
  /** Active Israel siren regions derived from Tzofar alerts (e.g. ["South", "Central"]) */
  activeIsraelRegions: string[];
}

export function useAlertPolling(options: AlertPollingOptions): AlertPollingResult {
  const [alerts, setAlerts] = useState<MissileAlert[]>([]);
  const [outcomes, setOutcomes] = useState<InterceptionOutcome[]>([]);
  const [flashActive, setFlashActive] = useState(false);
  const flashKey = useRef(0);
  const seenAlertIds = useRef<Set<string>>(new Set());

  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    let firstPoll = true;
    const pollAlerts = async () => {
      // Skip polling when tab is hidden — save server load
      if (document.hidden && !firstPoll) return;

      const { alerts: newAlerts, outcomes: newOutcomes } = await fetchAlerts();

      if (!firstPoll) {
        const ac = optionsRef.current.alertCountries;
        const israelEnabled = !ac || ac === "all" || ac.includes("Israel");

        for (const alert of newAlerts) {
          if (!seenAlertIds.current.has(alert.id)) {
            if (israelEnabled) {
              if (optionsRef.current.soundEnabled) playAlertSound();
              flashKey.current += 1;
              setFlashActive(true);
              setTimeout(() => setFlashActive(false), STRIKE_FLASH_DURATION_MS);

              if (alert.lat && alert.lng) {
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
      firstPoll = false;
      setAlerts(newAlerts);
      setOutcomes(newOutcomes);
    };
    pollAlerts();
    const interval = setInterval(pollAlerts, ALERT_POLL_MS);
    return () => clearInterval(interval);
  }, []);

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
    alerts,
    outcomes,
    flashActive,
    flashKey: flashKey.current,
    activeIsraelRegions,
  };
}
