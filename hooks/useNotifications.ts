"use client";

import { useState, useEffect, useRef, useCallback } from "react";

export function useNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [supported, setSupported] = useState(false);
  const swRegistration = useRef<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    setSupported(true);
    setPermission(Notification.permission);

    // Register service worker
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .then((reg) => {
          swRegistration.current = reg;
        })
        .catch((err) => {
          console.warn("[sw] Registration failed:", err);
        });
    }
  }, []);

  const requestPermission = useCallback(async () => {
    if (!("Notification" in window)) return "denied" as NotificationPermission;
    const result = await Notification.requestPermission();
    setPermission(result);
    return result;
  }, []);

  const sendNotification = useCallback(
    (title: string, options?: NotificationOptions) => {
      if (permission !== "granted") return;

      // Use service worker registration if available (works in background)
      if (swRegistration.current) {
        swRegistration.current.showNotification(title, options);
      } else if ("Notification" in window) {
        new Notification(title, options);
      }
    },
    [permission]
  );

  return { permission, requestPermission, sendNotification, supported };
}
