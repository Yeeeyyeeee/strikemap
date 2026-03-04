"use client";

import { useState, useEffect, useRef } from "react";
import { playAlertSound } from "@/lib/sounds";
import { SIREN_POLL_MS } from "@/lib/constants";

export interface SirenAlertClient {
  id: string;
  country: string;
  activatedAt: number;
  lastSeenAt: number;
  sourceChannel: string;
  status: "active" | "cleared";
}

interface SirenPollingOptions {
  soundEnabled: boolean;
  notificationsEnabled: boolean;
  sendNotification?: (title: string, options: NotificationOptions) => void;
  onNewSiren?: (country: string) => void;
  alertCountries?: string[] | "all";
}

interface SirenPollingResult {
  sirenAlerts: SirenAlertClient[];
}

export function useSirenPolling(options: SirenPollingOptions): SirenPollingResult {
  const [sirenAlerts, setSirenAlerts] = useState<SirenAlertClient[]>([]);
  const prevCountries = useRef<Set<string>>(new Set());
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    let firstPoll = true;

    const poll = async () => {
      if (document.hidden && !firstPoll) return;

      try {
        const res = await fetch("/api/siren-alerts");
        const data = await res.json();
        const alerts: SirenAlertClient[] = data.sirenAlerts || [];

        if (!firstPoll) {
          const newCountries = new Set(alerts.map((a) => a.country));
          const prevSet = prevCountries.current;

          // Detect newly activated sirens
          const ac = optionsRef.current.alertCountries;
          for (const country of newCountries) {
            if (!prevSet.has(country)) {
              const countryEnabled = !ac || ac === "all" || ac.includes(country);
              if (countryEnabled) {
                if (optionsRef.current.soundEnabled) {
                  playAlertSound();
                }
                if (
                  optionsRef.current.notificationsEnabled &&
                  optionsRef.current.sendNotification
                ) {
                  optionsRef.current.sendNotification(`SIRENS IN ${country.toUpperCase()}`, {
                    body: `Sirens reported in ${country} — take shelter`,
                    tag: `siren-${country}`,
                  });
                }
                optionsRef.current.onNewSiren?.(country);
              }
            }
          }

          prevCountries.current = newCountries;
        } else {
          // First poll: seed the set but don't trigger sounds
          prevCountries.current = new Set(alerts.map((a) => a.country));
        }

        firstPoll = false;
        setSirenAlerts(alerts);
      } catch {
        // Keep existing state
      }
    };

    poll();
    const interval = setInterval(poll, SIREN_POLL_MS);
    return () => clearInterval(interval);
  }, []);

  return { sirenAlerts };
}
