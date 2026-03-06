"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { VESSELS_POLL_MS } from "@/lib/constants";

interface VesselPollingResult {
  geojson: GeoJSON.FeatureCollection<GeoJSON.Point> | null;
  count: number;
  loading: boolean;
}

export function useVesselPolling(enabled: boolean): VesselPollingResult {
  const [geojson, setGeojson] = useState<GeoJSON.FeatureCollection<GeoJSON.Point> | null>(null);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const loadData = useCallback(async () => {
    if (!enabledRef.current) return;

    try {
      setLoading(true);
      const res = await fetch("/api/tracking/vessels");
      if (!res.ok) return;
      const data = await res.json();
      setGeojson(data.geojson || null);
      setCount(data.count || 0);
    } catch {
      // Keep existing data on error
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      setGeojson(null);
      setCount(0);
      return;
    }

    loadData();
    const iv = setInterval(loadData, VESSELS_POLL_MS);
    return () => clearInterval(iv);
  }, [enabled, loadData]);

  return { geojson, count, loading };
}
