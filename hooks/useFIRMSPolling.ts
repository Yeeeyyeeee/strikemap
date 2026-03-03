"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { FIRMS_POLL_MS } from "@/lib/constants";

interface FIRMSCounts {
  total: number;
  correlated: number;
  uncorrelated: number;
}

interface FIRMSPollingResult {
  geojson: GeoJSON.FeatureCollection<GeoJSON.Point> | null;
  counts: FIRMSCounts;
  loading: boolean;
}

export function useFIRMSPolling(enabled: boolean): FIRMSPollingResult {
  const [geojson, setGeojson] = useState<GeoJSON.FeatureCollection<GeoJSON.Point> | null>(null);
  const [counts, setCounts] = useState<FIRMSCounts>({ total: 0, correlated: 0, uncorrelated: 0 });
  const [loading, setLoading] = useState(false);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const loadData = useCallback(async () => {
    if (!enabledRef.current) return;
    if (document.hidden) return;

    try {
      setLoading(true);
      const res = await fetch("/api/satellite/firms");
      if (!res.ok) return;
      const data = await res.json();
      setGeojson(data.geojson || null);
      setCounts(data.counts || { total: 0, correlated: 0, uncorrelated: 0 });
    } catch {
      // Keep existing data on error
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch immediately when enabled, then poll
  useEffect(() => {
    if (!enabled) {
      setGeojson(null);
      setCounts({ total: 0, correlated: 0, uncorrelated: 0 });
      return;
    }

    loadData();
    const iv = setInterval(loadData, FIRMS_POLL_MS);
    return () => clearInterval(iv);
  }, [enabled, loadData]);

  return { geojson, counts, loading };
}
