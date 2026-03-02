"use client";

import { useState, useEffect, useRef } from "react";
import { MissileAlert } from "@/lib/types";
import { fetchAlerts } from "@/lib/fetchAlerts";
import { playAlertSound } from "@/lib/sounds";
import { ALERT_POLL_MS, STRIKE_FLASH_DURATION_MS } from "@/lib/constants";

interface AlertPollingOptions {
  soundEnabled: boolean;
  notificationsEnabled: boolean;
  sendNotification?: (title: string, options: NotificationOptions) => void;
  mapInstance?: { flyTo: (opts: { center: [number, number]; zoom: number; duration: number }) => void } | null;
}

interface AlertPollingResult {
  alerts: MissileAlert[];
  flashActive: boolean;
  flashKey: number;
}

export function useAlertPolling(options: AlertPollingOptions): AlertPollingResult {
  const [alerts, setAlerts] = useState<MissileAlert[]>([]);
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

      const newAlerts = await fetchAlerts();

      if (!firstPoll) {
        for (const alert of newAlerts) {
          if (!seenAlertIds.current.has(alert.id)) {
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
              optionsRef.current.sendNotification("INCOMING HOSTILE MISSILES", {
                body: `Alert: ${alert.regions.join(", ") || alert.cities.slice(0, 3).join(", ")} — Shelter in ${alert.timeToImpact}s`,
                tag: `alert-${alert.id}`,
              });
            }
            break;
          }
        }
      }

      seenAlertIds.current = new Set(newAlerts.map((a) => a.id));
      firstPoll = false;
      setAlerts(newAlerts);
    };
    pollAlerts();
    const interval = setInterval(pollAlerts, ALERT_POLL_MS);
    return () => clearInterval(interval);
  }, []);

  return {
    alerts,
    flashActive,
    flashKey: flashKey.current,
  };
}
