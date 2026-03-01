"use client";

import { useEffect, useRef, useCallback } from "react";
import mapboxgl from "mapbox-gl";
import { Incident } from "@/lib/types";
import { getWeaponColor } from "./Legend";
import { MILITARY_BASES, BASE_COLORS, getBaseIcon } from "@/lib/militaryBases";
import { PROXY_GROUPS, PROXY_CONNECTIONS, createProxyCircle } from "@/lib/proxyGroups";
import { createCircleGeoJSON } from "@/lib/weaponsData";

interface MapProps {
  incidents: Incident[];
  onSelectIncident: (incident: Incident) => void;
  selectedIncident: Incident | null;
  onMapReady?: (map: mapboxgl.Map) => void;
  timelineActive?: boolean;
  showBases?: boolean;
  showProxies?: boolean;
  rangeWeapon?: { lat: number; lng: number; radiusKm: number } | null;
  onRangeWeaponClear?: () => void;
  initialCenter?: [number, number];
  initialZoom?: number;
  onMapClick?: () => void;
  mapStyleUrl?: string;
  markerSize?: number;
  markerOpacity?: number;
}

type MarkerIcon = "missile" | "drone" | "ship" | "mixed";

function getIconType(weapon: string): MarkerIcon {
  const w = weapon.toLowerCase();
  if (w.includes("drone") || w.includes("shahed")) {
    if (w.includes("missile") || w.includes("ballistic")) return "mixed";
    return "drone";
  }
  if (w.includes("anti-ship") || w.includes("ship")) return "ship";
  return "missile";
}

function createMarkerSvg(color: string, icon: MarkerIcon): string {
  const icons: Record<MarkerIcon, string> = {
    missile: `
      <svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
        <circle cx="16" cy="16" r="10" fill="none" stroke="${color}" stroke-width="1.5" opacity="0.4"/>
        <circle cx="16" cy="16" r="5" fill="${color}" opacity="0.9"/>
        <circle cx="16" cy="16" r="2" fill="#fff" opacity="0.8"/>
        <line x1="16" y1="2" x2="16" y2="9" stroke="${color}" stroke-width="1.5" stroke-linecap="round"/>
        <line x1="16" y1="23" x2="16" y2="30" stroke="${color}" stroke-width="1.5" stroke-linecap="round"/>
        <line x1="2" y1="16" x2="9" y2="16" stroke="${color}" stroke-width="1.5" stroke-linecap="round"/>
        <line x1="23" y1="16" x2="30" y2="16" stroke="${color}" stroke-width="1.5" stroke-linecap="round"/>
      </svg>`,
    drone: `
      <svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
        <circle cx="16" cy="16" r="10" fill="none" stroke="${color}" stroke-width="1.5" opacity="0.4"/>
        <polygon points="16,6 24,22 16,18 8,22" fill="${color}" opacity="0.9"/>
        <circle cx="16" cy="14" r="2" fill="#fff" opacity="0.8"/>
      </svg>`,
    ship: `
      <svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
        <circle cx="16" cy="16" r="10" fill="none" stroke="${color}" stroke-width="1.5" opacity="0.4"/>
        <circle cx="16" cy="12" r="3" fill="none" stroke="${color}" stroke-width="2"/>
        <line x1="16" y1="15" x2="16" y2="26" stroke="${color}" stroke-width="2" stroke-linecap="round"/>
        <path d="M10,22 Q16,28 22,22" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round"/>
        <line x1="12" y1="16" x2="20" y2="16" stroke="${color}" stroke-width="1.5" stroke-linecap="round"/>
      </svg>`,
    mixed: `
      <svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
        <circle cx="16" cy="16" r="10" fill="none" stroke="${color}" stroke-width="1.5" opacity="0.4"/>
        <rect x="10" y="10" width="12" height="12" rx="2" transform="rotate(45 16 16)" fill="${color}" opacity="0.9"/>
        <circle cx="16" cy="16" r="2" fill="#fff" opacity="0.8"/>
        <line x1="16" y1="3" x2="16" y2="8" stroke="${color}" stroke-width="1.5" stroke-linecap="round"/>
        <line x1="16" y1="24" x2="16" y2="29" stroke="${color}" stroke-width="1.5" stroke-linecap="round"/>
        <line x1="3" y1="16" x2="8" y2="16" stroke="${color}" stroke-width="1.5" stroke-linecap="round"/>
        <line x1="24" y1="16" x2="29" y2="16" stroke="${color}" stroke-width="1.5" stroke-linecap="round"/>
      </svg>`,
  };
  return icons[icon];
}

export default function MapView({
  incidents,
  onSelectIncident,
  selectedIncident,
  onMapReady,
  timelineActive = false,
  showBases = false,
  showProxies = false,
  rangeWeapon = null,
  onRangeWeaponClear,
  initialCenter,
  initialZoom,
  onMapClick,
  mapStyleUrl,
  markerSize = 1,
  markerOpacity = 1,
}: MapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const onMapClickRef = useRef(onMapClick);
  onMapClickRef.current = onMapClick;
  const markerClickedRef = useRef(false);
  const markersRef = useRef<Map<string, mapboxgl.Marker>>(new Map());
  const baseMarkersRef = useRef<mapboxgl.Marker[]>([]);
  const proxyLabelsRef = useRef<mapboxgl.Marker[]>([]);
  const prevIncidentIds = useRef<Set<string>>(new Set());

  const clearMarkers = useCallback(() => {
    markersRef.current.forEach((m) => m.remove());
    markersRef.current.clear();
  }, []);

  const clearBaseMarkers = useCallback(() => {
    baseMarkersRef.current.forEach((m) => m.remove());
    baseMarkersRef.current = [];
  }, []);

  const clearProxyLabels = useCallback(() => {
    proxyLabelsRef.current.forEach((m) => m.remove());
    proxyLabelsRef.current = [];
  }, []);

  useEffect(() => {
    if (!mapContainer.current) return;

    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!token || token === "your_mapbox_token_here") {
      console.warn("Mapbox token not configured");
      return;
    }

    mapboxgl.accessToken = token;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: mapStyleUrl || "mapbox://styles/mapbox/dark-v11",
      center: initialCenter || [50, 28],
      zoom: initialZoom ?? 4,
      attributionControl: false,
    });

    map.current.addControl(
      new mapboxgl.NavigationControl({ showCompass: false }),
      "top-right"
    );

    const m = map.current;
    m.on("load", () => onMapReady?.(m));
    m.on("click", () => {
      // Skip if a marker was just clicked (marker sets the flag before this fires)
      if (markerClickedRef.current) {
        markerClickedRef.current = false;
        return;
      }
      onMapClickRef.current?.();
    });

    return () => {
      clearMarkers();
      clearBaseMarkers();
      clearProxyLabels();
      map.current?.remove();
    };
  }, [clearMarkers, clearBaseMarkers, clearProxyLabels, onMapReady]);

  // Handle map style changes (skip the initial value)
  const initialStyleRef = useRef(mapStyleUrl);
  useEffect(() => {
    const m = map.current;
    if (!m || !mapStyleUrl) return;

    // Skip the first render — the map was initialized with this style
    if (mapStyleUrl === initialStyleRef.current) return;
    initialStyleRef.current = undefined; // only skip once

    // Wait until the map is fully loaded before changing style
    const applyStyle = () => {
      m.setStyle(mapStyleUrl);
      m.once("style.load", () => {
        clearMarkers();
        prevIncidentIds.current.clear();
      });
    };

    if (m.isStyleLoaded()) {
      applyStyle();
    } else {
      m.once("load", applyStyle);
    }
  }, [mapStyleUrl, clearMarkers]);

  // Incident markers — diff-based: only add/remove changed markers
  useEffect(() => {
    if (!map.current) return;

    const onMapReady = () => {
      const validIncidents = incidents.filter((i) => i.lat !== 0 && i.lng !== 0);
      const currentIds = new Set(validIncidents.map((i) => i.id));

      // Remove markers that are no longer in the incident list
      for (const [id, marker] of markersRef.current) {
        if (!currentIds.has(id)) {
          marker.remove();
          markersRef.current.delete(id);
        }
      }

      // Determine the 5 most recent incidents for pulse animation
      const sortedByDate = [...validIncidents].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      );
      const recentIds = new Set(sortedByDate.slice(0, 5).map((i) => i.id));

      // Add markers only for new incidents
      for (const incident of validIncidents) {
        if (markersRef.current.has(incident.id)) continue;

        const color = (incident.side === "us_israel" || incident.side === "us" || incident.side === "israel")
          ? "#3b82f6"
          : getWeaponColor(incident.weapon);
        const iconType = getIconType(incident.weapon);

        const el = document.createElement("div");
        el.className = "incident-marker";
        el.style.setProperty("--marker-color", color);
        const px = Math.round(32 * markerSize);
        el.style.width = `${px}px`;
        el.style.height = `${px}px`;
        el.style.opacity = String(markerOpacity);
        el.innerHTML = createMarkerSvg(color, iconType);

        if (recentIds.has(incident.id)) {
          el.classList.add("recent");
        }

        if (timelineActive && !prevIncidentIds.current.has(incident.id)) {
          el.classList.add("timeline-new");
        }

        el.addEventListener("click", (e) => {
          e.stopPropagation();
          markerClickedRef.current = true;
          onSelectIncident(incident);
        });

        const hasVideo = Boolean(
          incident.video_url ||
          incident.telegram_post_id ||
          (incident.source_url && /t\.me\/\w+\/\d+/.test(incident.source_url))
        );

        const popup = new mapboxgl.Popup({
          offset: 18,
          closeButton: false,
          closeOnClick: false,
          maxWidth: "240px",
        }).setHTML(
          `<div>
            <div style="font-weight:600;margin-bottom:4px;">${incident.location}</div>
            <div style="color:#999;font-size:11px;">${incident.date} · ${incident.weapon || "Strike"}${hasVideo ? ' · <span style="color:#a855f7;">VIDEO</span>' : ""}</div>
            <div style="color:#ccc;font-size:12px;margin-top:6px;">${incident.description}</div>
            <div style="color:${color};font-size:10px;margin-top:6px;cursor:pointer;">Click for details →</div>
          </div>`
        );

        const marker = new mapboxgl.Marker({ element: el })
          .setLngLat([incident.lng, incident.lat])
          .setPopup(popup)
          .addTo(map.current!);

        el.addEventListener("mouseenter", () => popup.addTo(map.current!));
        el.addEventListener("mouseleave", () => popup.remove());

        markersRef.current.set(incident.id, marker);
      }

      if (timelineActive) {
        prevIncidentIds.current = new Set(currentIds);
      }
    };

    if (map.current.loaded()) {
      onMapReady();
    } else {
      map.current.on("load", onMapReady);
    }
  }, [incidents, onSelectIncident, timelineActive, markerSize, markerOpacity]);

  // Update existing marker sizes/opacity when settings change
  useEffect(() => {
    const px = Math.round(32 * markerSize);
    markersRef.current.forEach((marker) => {
      const el = marker.getElement();
      el.style.width = `${px}px`;
      el.style.height = `${px}px`;
      el.style.opacity = String(markerOpacity);
    });
  }, [markerSize, markerOpacity]);

  // Fly to selected incident
  useEffect(() => {
    if (selectedIncident && map.current && selectedIncident.lat && selectedIncident.lng) {
      map.current.flyTo({
        center: [selectedIncident.lng, selectedIncident.lat],
        zoom: 7,
        duration: 1000,
      });
    }
  }, [selectedIncident]);

  // Military base markers
  useEffect(() => {
    if (!map.current) return;
    clearBaseMarkers();

    if (!showBases) return;

    const addBases = () => {
      MILITARY_BASES.forEach((base) => {
        const color = BASE_COLORS[base.operator];
        const el = document.createElement("div");
        el.className = "base-marker";
        el.style.setProperty("--base-color", color);
        el.style.color = color;
        el.innerHTML = getBaseIcon(base.type);

        const popup = new mapboxgl.Popup({
          offset: 14,
          closeButton: false,
          closeOnClick: false,
          maxWidth: "220px",
        }).setHTML(
          `<div>
            <div style="font-weight:600;color:${color};margin-bottom:4px;">${base.name}</div>
            <div style="color:#999;font-size:11px;">
              ${base.operator === "iran" ? "Iranian" : base.operator === "israel" ? "Israeli" : "US/Coalition"}
              · ${base.type.charAt(0).toUpperCase() + base.type.slice(1)} Base
            </div>
          </div>`
        );

        const marker = new mapboxgl.Marker({ element: el })
          .setLngLat([base.lng, base.lat])
          .addTo(map.current!);

        el.addEventListener("mouseenter", () => popup.addTo(map.current!));
        el.addEventListener("mouseleave", () => popup.remove());

        baseMarkersRef.current.push(marker);
      });
    };

    if (map.current.loaded()) {
      addBases();
    } else {
      map.current.on("load", addBases);
    }
  }, [showBases, clearBaseMarkers]);

  // Proxy network overlay
  useEffect(() => {
    const m = map.current;
    if (!m) return;

    const sourceId = "proxy-territories";
    const lineSourceId = "proxy-connections";
    const fillLayerId = "proxy-fill";
    const borderLayerId = "proxy-border";
    const lineLayerId = "proxy-lines";

    clearProxyLabels();

    const cleanup = () => {
      try {
        if (m.getLayer(fillLayerId)) m.removeLayer(fillLayerId);
        if (m.getLayer(borderLayerId)) m.removeLayer(borderLayerId);
        if (m.getLayer(lineLayerId)) m.removeLayer(lineLayerId);
        if (m.getSource(sourceId)) m.removeSource(sourceId);
        if (m.getSource(lineSourceId)) m.removeSource(lineSourceId);
      } catch { /* ignore */ }
    };

    if (!showProxies) {
      cleanup();
      return;
    }

    const addProxies = () => {
      cleanup();

      // Territory circles
      const features = PROXY_GROUPS.map((g) => {
        const feat = createProxyCircle(g.centerLat, g.centerLng, g.radiusKm);
        feat.properties = { color: g.color, name: g.name };
        return feat;
      });

      m.addSource(sourceId, {
        type: "geojson",
        data: { type: "FeatureCollection", features },
      });

      m.addLayer({
        id: fillLayerId,
        type: "fill",
        source: sourceId,
        paint: {
          "fill-color": ["get", "color"],
          "fill-opacity": 0.12,
        },
      });

      m.addLayer({
        id: borderLayerId,
        type: "line",
        source: sourceId,
        paint: {
          "line-color": ["get", "color"],
          "line-width": 1.5,
          "line-dasharray": [4, 3],
          "line-opacity": 0.5,
        },
      });

      // Connection lines from Tehran
      const lineFeatures = PROXY_CONNECTIONS.map((c) => ({
        type: "Feature" as const,
        properties: {},
        geometry: {
          type: "LineString" as const,
          coordinates: [c.from, c.to],
        },
      }));

      m.addSource(lineSourceId, {
        type: "geojson",
        data: { type: "FeatureCollection", features: lineFeatures },
      });

      m.addLayer({
        id: lineLayerId,
        type: "line",
        source: lineSourceId,
        paint: {
          "line-color": "#ef4444",
          "line-width": 1,
          "line-dasharray": [6, 4],
          "line-opacity": 0.4,
        },
      });

      // DOM labels at group centers
      PROXY_GROUPS.forEach((g) => {
        const el = document.createElement("div");
        el.className = "proxy-label";
        el.style.color = g.color;
        el.textContent = g.name;

        const marker = new mapboxgl.Marker({ element: el, anchor: "center" })
          .setLngLat([g.centerLng, g.centerLat])
          .addTo(m);

        proxyLabelsRef.current.push(marker);
      });
    };

    if (m.loaded()) {
      addProxies();
    } else {
      m.on("load", addProxies);
    }

    return cleanup;
  }, [showProxies, clearProxyLabels]);

  // Weapon range ring
  useEffect(() => {
    const m = map.current;
    if (!m) return;

    const rangeSourceId = "weapon-range";
    const rangeLayerId = "weapon-range-fill";
    const rangeBorderId = "weapon-range-border";

    const cleanup = () => {
      try {
        if (m.getLayer(rangeLayerId)) m.removeLayer(rangeLayerId);
        if (m.getLayer(rangeBorderId)) m.removeLayer(rangeBorderId);
        if (m.getSource(rangeSourceId)) m.removeSource(rangeSourceId);
      } catch { /* ignore */ }
    };

    if (!rangeWeapon) {
      cleanup();
      return;
    }

    const addRange = () => {
      cleanup();

      const circle = createCircleGeoJSON(rangeWeapon.lat, rangeWeapon.lng, rangeWeapon.radiusKm);

      m.addSource(rangeSourceId, {
        type: "geojson",
        data: circle,
      });

      m.addLayer({
        id: rangeLayerId,
        type: "fill",
        source: rangeSourceId,
        paint: {
          "fill-color": "#a855f7",
          "fill-opacity": 0.08,
        },
      });

      m.addLayer({
        id: rangeBorderId,
        type: "line",
        source: rangeSourceId,
        paint: {
          "line-color": "#a855f7",
          "line-width": 2,
          "line-dasharray": [6, 3],
          "line-opacity": 0.6,
        },
      });

      // Fly to the range area
      m.flyTo({
        center: [rangeWeapon.lng, rangeWeapon.lat],
        zoom: 4.5,
        duration: 1200,
      });

      // Auto-clear after 15 seconds
      setTimeout(() => {
        onRangeWeaponClear?.();
      }, 15000);
    };

    if (m.loaded()) {
      addRange();
    } else {
      m.on("load", addRange);
    }

    return cleanup;
  }, [rangeWeapon, onRangeWeaponClear]);

  return (
    <div ref={mapContainer} className="w-full h-full" />
  );
}
