"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import mapboxgl from "mapbox-gl";

interface HeatmapArea {
  lat: number;
  lng: number;
  name: string;
}

interface HeatmapMapProps {
  onAreaSelect: (area: HeatmapArea | null) => void;
  className?: string;
}

export default function HeatmapMap({ onAreaSelect, className }: HeatmapMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [loaded, setLoaded] = useState(false);

  const fetchAndSetData = useCallback(async (m: mapboxgl.Map) => {
    try {
      const res = await fetch("/api/heatmap");
      if (!res.ok) return;
      const data = await res.json();
      const source = m.getSource("media-heat") as mapboxgl.GeoJSONSource | undefined;
      if (source) {
        source.setData(data.points);
      }
    } catch {
      // silently fail
    }
  }, []);

  useEffect(() => {
    if (!mapContainer.current) return;
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!token) return;

    mapboxgl.accessToken = token;

    const m = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/dark-v11",
      center: [50, 28],
      zoom: 4,
      attributionControl: false,
    });

    m.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");

    m.on("load", async () => {
      // Add empty source, then fetch data
      m.addSource("media-heat", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });

      m.addLayer({
        id: "media-heatmap",
        type: "heatmap",
        source: "media-heat",
        paint: {
          "heatmap-weight": ["interpolate", ["linear"], ["get", "mediaCount"], 0, 0.5, 5, 1],
          "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 0, 1, 9, 3],
          "heatmap-color": [
            "interpolate",
            ["linear"],
            ["heatmap-density"],
            0, "rgba(0,0,0,0)",
            0.1, "rgba(100,0,0,0.3)",
            0.3, "rgba(180,30,0,0.5)",
            0.5, "rgba(220,60,0,0.6)",
            0.7, "rgba(255,100,0,0.7)",
            0.9, "rgba(255,180,0,0.8)",
            1, "rgba(255,255,100,0.9)",
          ],
          "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 0, 15, 6, 30, 12, 50],
          "heatmap-opacity": 0.8,
        },
      });

      // Add circle layer visible at higher zoom levels
      m.addLayer({
        id: "media-points",
        type: "circle",
        source: "media-heat",
        minzoom: 8,
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 4, 14, 10],
          "circle-color": [
            "match", ["get", "side"],
            "iran", "#ef4444",
            "us_israel", "#3b82f6",
            "us", "#3b82f6",
            "israel", "#3b82f6",
            "#f59e0b",
          ],
          "circle-opacity": 0.7,
          "circle-stroke-width": 1,
          "circle-stroke-color": "rgba(255,255,255,0.3)",
        },
      });

      await fetchAndSetData(m);
      setLoaded(true);
    });

    // Click handler — query nearby incidents
    m.on("click", (e) => {
      const features = m.queryRenderedFeatures(e.point, { layers: ["media-points", "media-heatmap"] });
      if (features.length > 0) {
        const coords = e.lngLat;
        onAreaSelect({
          lat: coords.lat,
          lng: coords.lng,
          name: `${coords.lat.toFixed(2)}, ${coords.lng.toFixed(2)}`,
        });
      } else {
        onAreaSelect(null);
      }
    });

    // Cursor style
    m.on("mouseenter", "media-points", () => { m.getCanvas().style.cursor = "pointer"; });
    m.on("mouseleave", "media-points", () => { m.getCanvas().style.cursor = ""; });

    map.current = m;

    return () => {
      m.remove();
      map.current = null;
    };
  }, [onAreaSelect, fetchAndSetData]);

  // Poll for data updates
  useEffect(() => {
    if (!loaded || !map.current) return;
    const m = map.current;
    const interval = setInterval(() => fetchAndSetData(m), 60_000);
    return () => clearInterval(interval);
  }, [loaded, fetchAndSetData]);

  return <div ref={mapContainer} className={`w-full h-full ${className || ""}`} />;
}
