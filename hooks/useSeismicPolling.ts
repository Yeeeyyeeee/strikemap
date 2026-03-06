"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { SEISMIC_POLL_MS } from "@/lib/constants";

interface SeismicCounts {
  total: number;
  correlated: number;
  uncorrelated: number;
}

interface SeismicPollingResult {
  geojson: GeoJSON.FeatureCollection<GeoJSON.Point> | null;
  counts: SeismicCounts;
  loading: boolean;
}

export function useSeismicPolling(enabled: boolean): SeismicPollingResult {
  const [geojson, setGeojson] = useState<GeoJSON.FeatureCollection<GeoJSON.Point> | null>(null);
  const [counts, setCounts] = useState<SeismicCounts>({ total: 0, correlated: 0, uncorrelated: 0 });
  const [loading, setLoading] = useState(false);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const loadData = useCallback(async () => {
    if (!enabledRef.current) return;

    try {
      setLoading(true);
      const res = await fetch("/api/seismic");
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
    const iv = setInterval(loadData, SEISMIC_POLL_MS);
    return () => clearInterval(iv);
  }, [enabled, loadData]);

  return { geojson, counts, loading };
}
