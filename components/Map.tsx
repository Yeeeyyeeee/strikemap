"use client";

import { useEffect, useRef, useCallback } from "react";
import mapboxgl from "mapbox-gl";
import { Incident } from "@/lib/types";
import { getWeaponColor } from "./Legend";
import { MILITARY_BASES, BASE_COLORS, getBaseIcon } from "@/lib/militaryBases";
import { PROXY_GROUPS, PROXY_CONNECTIONS, createProxyCircle } from "@/lib/proxyGroups";
import { createCircleGeoJSON } from "@/lib/weaponsData";

/** Escape HTML entities to prevent XSS in Mapbox popup setHTML() */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ---- Time-based marker fading ----
function getMarkerOpacity(incident: Incident): number {
  const now = Date.now();
  let ts: number;

  if (incident.timestamp) {
    ts = new Date(incident.timestamp).getTime();
  } else if (incident.date) {
    ts = new Date(incident.date).getTime();
  } else {
    return 0.5;
  }

  if (isNaN(ts)) return 0.5;

  const ageMin = (now - ts) / 60_000;

  if (ageMin < 5) return 1.0;
  if (ageMin < 30) return 0.9;
  if (ageMin < 120) return 0.75;
  if (ageMin < 360) return 0.55;
  if (ageMin < 720) return 0.4;
  if (ageMin < 1440) return 0.25;
  return 0.12;
}

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

function getIncidentColor(incident: Incident): string {
  if (incident.intercepted_by) {
    if (incident.intercept_success === true) return "#22c55e";
    if (incident.intercept_success === false) return "#ef4444";
    return "#6b7280";
  }
  if (
    incident.side === "us_israel" ||
    incident.side === "us" ||
    incident.side === "israel"
  )
    return "#3b82f6";
  return getWeaponColor(incident.weapon);
}

// Source & layer IDs
const SRC = "incidents-src";
const LAYER_CLUSTERS = "incident-clusters";
const LAYER_CLUSTER_COUNT = "incident-cluster-count";
const LAYER_POINTS = "incident-points";
const LAYER_SELECTED = "incident-selected";
const SRC_SELECTED = "incident-selected-src";

function buildGeoJSON(
  incidents: Incident[],
  timelineActive: boolean,
  baseOpacity: number
): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: "FeatureCollection",
    features: incidents.map((inc) => ({
      type: "Feature" as const,
      properties: {
        id: inc.id,
        color: getIncidentColor(inc),
        opacity: timelineActive ? baseOpacity : getMarkerOpacity(inc) * baseOpacity,
        location: inc.location || "",
        date: inc.date || "",
        weapon: inc.weapon || "Strike",
        description: (inc.description || "").slice(0, 120),
        hasVideo: Boolean(
          inc.video_url ||
            inc.telegram_post_id ||
            (inc.source_url && /t\.me\/\w+\/\d+/.test(inc.source_url))
        )
          ? "1"
          : "",
      },
      geometry: {
        type: "Point" as const,
        coordinates: [inc.lng, inc.lat],
      },
    })),
  };
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
  const onSelectIncidentRef = useRef(onSelectIncident);
  onSelectIncidentRef.current = onSelectIncident;
  const incidentMapRef = useRef<Map<string, Incident>>(new Map());
  const baseMarkersRef = useRef<mapboxgl.Marker[]>([]);
  const proxyLabelsRef = useRef<mapboxgl.Marker[]>([]);
  const selectedIncidentRef = useRef<Incident | null>(null);
  selectedIncidentRef.current = selectedIncident;
  const timelineActiveRef = useRef(timelineActive);
  timelineActiveRef.current = timelineActive;
  const markerOpacityRef = useRef(markerOpacity);
  markerOpacityRef.current = markerOpacity;
  const popupRef = useRef<mapboxgl.Popup | null>(null);
  const layersReady = useRef(false);

  const clearBaseMarkers = useCallback(() => {
    baseMarkersRef.current.forEach((m) => m.remove());
    baseMarkersRef.current = [];
  }, []);

  const clearProxyLabels = useCallback(() => {
    proxyLabelsRef.current.forEach((m) => m.remove());
    proxyLabelsRef.current = [];
  }, []);

  // Add incident layers to the map (called after style loads)
  const addIncidentLayers = useCallback((m: mapboxgl.Map) => {
    if (m.getSource(SRC)) return; // already added

    m.addSource(SRC, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
      cluster: true,
      clusterMaxZoom: 7,
      clusterRadius: 40,
    });

    // Cluster circles
    m.addLayer({
      id: LAYER_CLUSTERS,
      type: "circle",
      source: SRC,
      filter: ["has", "point_count"],
      paint: {
        "circle-color": [
          "step",
          ["get", "point_count"],
          "#ef4444",
          20,
          "#f97316",
          50,
          "#eab308",
        ],
        "circle-radius": [
          "step",
          ["get", "point_count"],
          14,
          10,
          18,
          50,
          24,
        ],
        "circle-opacity": 0.75,
        "circle-stroke-width": 2,
        "circle-stroke-color": "rgba(0,0,0,0.3)",
      },
    });

    // Cluster count labels
    m.addLayer({
      id: LAYER_CLUSTER_COUNT,
      type: "symbol",
      source: SRC,
      filter: ["has", "point_count"],
      layout: {
        "text-field": "{point_count_abbreviated}",
        "text-size": 12,
        "text-font": ["DIN Pro Medium", "Arial Unicode MS Bold"],
      },
      paint: {
        "text-color": "#ffffff",
      },
    });

    // Individual points — GPU-rendered circles
    m.addLayer({
      id: LAYER_POINTS,
      type: "circle",
      source: SRC,
      filter: ["!", ["has", "point_count"]],
      paint: {
        "circle-color": ["get", "color"],
        "circle-opacity": ["get", "opacity"],
        "circle-radius": [
          "interpolate",
          ["linear"],
          ["zoom"],
          3,
          3 * markerSize,
          6,
          5 * markerSize,
          10,
          7 * markerSize,
          14,
          10 * markerSize,
        ],
        "circle-stroke-width": [
          "interpolate",
          ["linear"],
          ["zoom"],
          3,
          0,
          8,
          1.5,
        ],
        "circle-stroke-color": ["get", "color"],
        "circle-stroke-opacity": 0.4,
      },
    });

    // Selected point highlight
    m.addSource(SRC_SELECTED, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });

    m.addLayer({
      id: LAYER_SELECTED,
      type: "circle",
      source: SRC_SELECTED,
      paint: {
        "circle-color": ["get", "color"],
        "circle-opacity": 1,
        "circle-radius": [
          "interpolate",
          ["linear"],
          ["zoom"],
          3,
          6 * markerSize,
          6,
          9 * markerSize,
          10,
          12 * markerSize,
          14,
          16 * markerSize,
        ],
        "circle-stroke-width": 2,
        "circle-stroke-color": "#ffffff",
        "circle-stroke-opacity": 0.8,
      },
    });

    layersReady.current = true;
  }, [markerSize]);

  // Initialize map
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

    // Reusable popup for hover
    popupRef.current = new mapboxgl.Popup({
      offset: 14,
      closeButton: false,
      closeOnClick: false,
      maxWidth: "240px",
    });

    m.on("load", () => {
      addIncidentLayers(m);
      onMapReady?.(m);
    });

    // Click on individual point — select incident
    m.on("click", LAYER_POINTS, (e) => {
      if (!e.features || e.features.length === 0) return;
      const id = e.features[0].properties?.id;
      const incident = incidentMapRef.current.get(id);
      if (incident) onSelectIncidentRef.current(incident);
    });

    // Click on cluster — zoom in
    m.on("click", LAYER_CLUSTERS, (e) => {
      if (!e.features || e.features.length === 0) return;
      const clusterId = e.features[0].properties?.cluster_id;
      const src = m.getSource(SRC) as mapboxgl.GeoJSONSource;
      src.getClusterExpansionZoom(clusterId, (err, zoom) => {
        if (err || zoom == null) return;
        const coords = (e.features![0].geometry as GeoJSON.Point).coordinates;
        m.easeTo({ center: coords as [number, number], zoom });
      });
    });

    // Click on empty area — deselect
    m.on("click", (e) => {
      const features = m.queryRenderedFeatures(e.point, {
        layers: [LAYER_POINTS, LAYER_CLUSTERS, LAYER_SELECTED],
      });
      if (features.length === 0) {
        onMapClickRef.current?.();
      }
    });

    // Hover popup on points
    m.on("mousemove", LAYER_POINTS, (e) => {
      if (!e.features || e.features.length === 0) return;
      m.getCanvas().style.cursor = "pointer";
      const props = e.features[0].properties!;
      const coords = (e.features[0].geometry as GeoJSON.Point)
        .coordinates as [number, number];
      const videoTag =
        props.hasVideo === "1"
          ? ' · <span style="color:#a855f7;">VIDEO</span>'
          : "";
      popupRef.current!
        .setLngLat(coords)
        .setHTML(
          `<div>
            <div style="font-weight:600;margin-bottom:4px;">${escapeHtml(props.location)}</div>
            <div style="color:#999;font-size:11px;">${escapeHtml(props.date)} · ${escapeHtml(props.weapon)}${videoTag}</div>
            <div style="color:#ccc;font-size:12px;margin-top:6px;">${escapeHtml(props.description)}</div>
            <div style="color:${props.color};font-size:10px;margin-top:6px;cursor:pointer;">Click for details →</div>
          </div>`
        )
        .addTo(m);
    });

    m.on("mouseleave", LAYER_POINTS, () => {
      m.getCanvas().style.cursor = "";
      popupRef.current?.remove();
    });

    // Cursor on clusters
    m.on("mouseenter", LAYER_CLUSTERS, () => {
      m.getCanvas().style.cursor = "pointer";
    });
    m.on("mouseleave", LAYER_CLUSTERS, () => {
      m.getCanvas().style.cursor = "";
    });

    return () => {
      layersReady.current = false;
      popupRef.current?.remove();
      clearBaseMarkers();
      clearProxyLabels();
      map.current?.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clearBaseMarkers, clearProxyLabels, onMapReady, addIncidentLayers]);

  // Handle map style changes
  const initialStyleRef = useRef(mapStyleUrl);
  useEffect(() => {
    const m = map.current;
    if (!m || !mapStyleUrl) return;
    if (mapStyleUrl === initialStyleRef.current) return;
    initialStyleRef.current = undefined;

    const applyStyle = () => {
      layersReady.current = false;
      m.setStyle(mapStyleUrl);
      m.once("style.load", () => {
        addIncidentLayers(m);
      });
    };

    if (m.isStyleLoaded()) {
      applyStyle();
    } else {
      m.once("load", applyStyle);
    }
  }, [mapStyleUrl, addIncidentLayers]);

  // Update GeoJSON source when incidents change
  useEffect(() => {
    const m = map.current;
    if (!m) return;

    const update = () => {
      if (!layersReady.current) return;

      // Update incident lookup map
      incidentMapRef.current.clear();
      for (const inc of incidents) {
        incidentMapRef.current.set(inc.id, inc);
      }

      const geojson = buildGeoJSON(incidents, timelineActive, markerOpacity);
      const src = m.getSource(SRC) as mapboxgl.GeoJSONSource | undefined;
      if (src) src.setData(geojson);
    };

    if (m.loaded() && layersReady.current) {
      update();
    } else {
      m.once("load", () => {
        // Small delay to ensure layers are added
        requestAnimationFrame(update);
      });
    }
  }, [incidents, timelineActive, markerOpacity]);

  // Update marker sizes when settings change
  useEffect(() => {
    const m = map.current;
    if (!m || !layersReady.current) return;
    try {
      if (m.getLayer(LAYER_POINTS)) {
        m.setPaintProperty(LAYER_POINTS, "circle-radius", [
          "interpolate",
          ["linear"],
          ["zoom"],
          3, 3 * markerSize,
          6, 5 * markerSize,
          10, 7 * markerSize,
          14, 10 * markerSize,
        ]);
      }
    } catch { /* layer might not exist yet */ }
  }, [markerSize]);

  // Recalculate age-based fading every 60 seconds
  useEffect(() => {
    const iv = setInterval(() => {
      const m = map.current;
      if (!m || !layersReady.current || timelineActiveRef.current) return;
      const geojson = buildGeoJSON(
        Array.from(incidentMapRef.current.values()),
        false,
        markerOpacityRef.current
      );
      const src = m.getSource(SRC) as mapboxgl.GeoJSONSource | undefined;
      if (src) src.setData(geojson);
    }, 60_000);
    return () => clearInterval(iv);
  }, []);

  // Update selected incident highlight
  useEffect(() => {
    const m = map.current;
    if (!m || !layersReady.current) return;

    const src = m.getSource(SRC_SELECTED) as mapboxgl.GeoJSONSource | undefined;
    if (!src) return;

    if (selectedIncident && selectedIncident.lat && selectedIncident.lng) {
      src.setData({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: { color: getIncidentColor(selectedIncident) },
            geometry: {
              type: "Point",
              coordinates: [selectedIncident.lng, selectedIncident.lat],
            },
          },
        ],
      });
    } else {
      src.setData({ type: "FeatureCollection", features: [] });
    }
  }, [selectedIncident]);

  // Fly to selected incident — zoom in but never zoom out
  useEffect(() => {
    if (selectedIncident && map.current && selectedIncident.lat && selectedIncident.lng) {
      const currentZoom = map.current.getZoom();
      map.current.flyTo({
        center: [selectedIncident.lng, selectedIncident.lat],
        zoom: Math.max(currentZoom, 7),
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
            <div style="font-weight:600;color:${color};margin-bottom:4px;">${escapeHtml(base.name)}</div>
            <div style="color:#999;font-size:11px;">
              ${base.operator === "iran" ? "Iranian" : base.operator === "israel" ? "Israeli" : "US/Coalition"}
              · ${escapeHtml(base.type.charAt(0).toUpperCase() + base.type.slice(1))} Base
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
      } catch {
        /* ignore */
      }
    };

    if (!showProxies) {
      cleanup();
      return;
    }

    const addProxies = () => {
      cleanup();

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
      } catch {
        /* ignore */
      }
    };

    if (!rangeWeapon) {
      cleanup();
      return;
    }

    const addRange = () => {
      cleanup();

      const circle = createCircleGeoJSON(
        rangeWeapon.lat,
        rangeWeapon.lng,
        rangeWeapon.radiusKm
      );

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

      m.flyTo({
        center: [rangeWeapon.lng, rangeWeapon.lat],
        zoom: 4.5,
        duration: 1200,
      });

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

  return <div ref={mapContainer} className="w-full h-full" />;
}
