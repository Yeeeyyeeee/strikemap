"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import mapboxgl from "mapbox-gl";
import { Incident } from "@/lib/types";
import { getWeaponColor } from "./Legend";
import { MilitaryBase, MILITARY_BASES, BASE_COLORS, OPERATOR_LABELS, getBaseIcon } from "@/lib/militaryBases";
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
  showFirms?: boolean;
  firmsGeoJSON?: GeoJSON.FeatureCollection<GeoJSON.Point> | null;
  showAircraft?: boolean;
  aircraftGeoJSON?: GeoJSON.FeatureCollection<GeoJSON.Point> | null;
  showVessels?: boolean;
  vesselGeoJSON?: GeoJSON.FeatureCollection<GeoJSON.Point> | null;
  rangeWeapon?: { lat: number; lng: number; radiusKm: number } | null;
  onRangeWeaponClear?: () => void;
  initialCenter?: [number, number];
  initialZoom?: number;
  onMapClick?: () => void;
  onSelectBase?: (base: MilitaryBase) => void;
  mapStyleUrl?: string;
  markerSize?: number;
  markerOpacity?: number;
  flashCountry?: string | null;
  sirenCountries?: string[];
  showCountries?: boolean;
  showSeismic?: boolean;
  seismicGeoJSON?: GeoJSON.FeatureCollection<GeoJSON.Point> | null;
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
const COUNTRY_BOUNDARIES_SRC = "country-boundaries-src";

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
  showFirms = false,
  firmsGeoJSON = null,
  showAircraft = false,
  aircraftGeoJSON = null,
  showVessels = false,
  vesselGeoJSON = null,
  rangeWeapon = null,
  onRangeWeaponClear,
  initialCenter,
  initialZoom,
  onMapClick,
  onSelectBase,
  mapStyleUrl,
  markerSize = 1,
  markerOpacity = 1,
  flashCountry = null,
  sirenCountries = [],
  showCountries = false,
  showSeismic = false,
  seismicGeoJSON = null,
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
  const [styleRevision, setStyleRevision] = useState(0);

  // Stable refs for values used in init useEffect (prevent map re-creation)
  const onMapReadyRef = useRef(onMapReady);
  onMapReadyRef.current = onMapReady;

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

    // Shared country-boundaries vector source (used by country overlay, flash, siren)
    // Single source avoids 3x tile fetches for the same tileset
    if (!m.getSource(COUNTRY_BOUNDARIES_SRC)) {
      m.addSource(COUNTRY_BOUNDARIES_SRC, {
        type: "vector",
        url: "mapbox://mapbox.country-boundaries-v1",
      });
    }

    layersReady.current = true;
  }, [markerSize]);

  // Stable ref so init useEffect doesn't re-run when markerSize changes
  const addIncidentLayersRef = useRef(addIncidentLayers);
  addIncidentLayersRef.current = addIncidentLayers;

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
      addIncidentLayersRef.current(m);
      onMapReadyRef.current?.(m);
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
  }, []);

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
        setStyleRevision((r) => r + 1);
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
  }, [incidents, timelineActive, markerOpacity, styleRevision]);

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
  }, [markerSize, styleRevision]);

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
  }, [selectedIncident, styleRevision]);

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
              ${OPERATOR_LABELS[base.operator]}
              · ${escapeHtml(base.type.charAt(0).toUpperCase() + base.type.slice(1))} Base
            </div>
          </div>`
        );

        const marker = new mapboxgl.Marker({ element: el })
          .setLngLat([base.lng, base.lat])
          .addTo(map.current!);

        el.addEventListener("mouseenter", () => popup.addTo(map.current!));
        el.addEventListener("mouseleave", () => popup.remove());
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          popup.remove();
          onSelectBase?.(base);
        });

        baseMarkersRef.current.push(marker);
      });
    };

    if (map.current.isStyleLoaded()) {
      addBases();
    } else {
      map.current.once("idle", addBases);
    }
  }, [showBases, clearBaseMarkers, onSelectBase]);

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

    if (m.isStyleLoaded()) {
      addProxies();
    } else {
      m.once("idle", addProxies);
    }

    return cleanup;
  }, [showProxies, clearProxyLabels, styleRevision]);

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
  }, [rangeWeapon, onRangeWeaponClear, styleRevision]);

  // FIRMS thermal hotspot overlay — uses setData + visibility to avoid source recreation
  useEffect(() => {
    const m = map.current;
    if (!m) return;

    const firmsSourceId = "firms-hotspots";
    const firmsLayerId = "firms-points";
    const firmsGlowId = "firms-glow";

    const hideLayers = () => {
      try {
        if (m.getLayer(firmsGlowId)) m.setLayoutProperty(firmsGlowId, "visibility", "none");
        if (m.getLayer(firmsLayerId)) m.setLayoutProperty(firmsLayerId, "visibility", "none");
      } catch { /* ignore */ }
    };

    if (!showFirms || !firmsGeoJSON) {
      hideLayers();
      return;
    }

    const ensureFirms = () => {
      // If source already exists, just update data and show layers
      const existingSrc = m.getSource(firmsSourceId) as mapboxgl.GeoJSONSource | undefined;
      if (existingSrc) {
        existingSrc.setData(firmsGeoJSON);
        try {
          if (m.getLayer(firmsGlowId)) m.setLayoutProperty(firmsGlowId, "visibility", "visible");
          if (m.getLayer(firmsLayerId)) m.setLayoutProperty(firmsLayerId, "visibility", "visible");
        } catch { /* ignore */ }
        return;
      }

      // First time: create source and layers
      m.addSource(firmsSourceId, {
        type: "geojson",
        data: firmsGeoJSON,
      });

      // Glow effect layer (behind) — large soft halo
      m.addLayer({
        id: firmsGlowId,
        type: "circle",
        source: firmsSourceId,
        paint: {
          "circle-color": [
            "case",
            ["==", ["get", "correlated"], "1"],
            "#ef4444",
            "#f97316",
          ],
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            3, 12,
            6, 20,
            10, 30,
            14, 45,
          ],
          "circle-opacity": 0.25,
          "circle-blur": 1,
        },
      });

      // Main hotspot points — bold and visible
      m.addLayer({
        id: firmsLayerId,
        type: "circle",
        source: firmsSourceId,
        paint: {
          "circle-color": [
            "case",
            ["==", ["get", "correlated"], "1"],
            "#ef4444",
            "#f97316",
          ],
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            3, 5,
            6, 8,
            10, 12,
            14, 18,
          ],
          "circle-opacity": 0.9,
          "circle-stroke-width": 2,
          "circle-stroke-color": [
            "case",
            ["==", ["get", "correlated"], "1"],
            "#fca5a5",
            "#fdba74",
          ],
          "circle-stroke-opacity": 0.7,
        },
      });
    };

    const onFirmsMouseMove = (e: mapboxgl.MapMouseEvent & { features?: mapboxgl.MapboxGeoJSONFeature[] }) => {
      if (!e.features || e.features.length === 0) return;
      m.getCanvas().style.cursor = "pointer";
      const props = e.features[0].properties!;
      const coords = (e.features[0].geometry as GeoJSON.Point).coordinates as [number, number];
      const isCorrelated = props.correlated === "1";
      const statusColor = isCorrelated ? "#ef4444" : "#f97316";
      const statusLabel = isCorrelated ? "STRIKE CONFIRMED" : "UNCONFIRMED";
      popupRef.current!
        .setLngLat(coords)
        .setHTML(
          `<div>
            <div style="font-weight:700;color:${statusColor};font-size:11px;margin-bottom:4px;letter-spacing:0.5px;">${statusLabel}</div>
            <div style="color:#ccc;font-size:11px;">FRP: <b>${props.frp} MW</b> · Confidence: <b>${props.confidence}%</b></div>
            <div style="color:#999;font-size:10px;margin-top:3px;">${props.satellite} · ${props.acq_date} ${props.acq_time} UTC · ${props.daynight === "D" ? "Day" : "Night"}</div>
            <div style="color:#666;font-size:10px;margin-top:3px;">${coords[1].toFixed(3)}°N, ${coords[0].toFixed(3)}°E</div>
          </div>`
        )
        .addTo(m);
    };

    const onFirmsMouseLeave = () => {
      m.getCanvas().style.cursor = "";
      popupRef.current?.remove();
    };

    // Click FIRMS dot with correlated incident → select that incident
    const onFirmsClick = (e: mapboxgl.MapMouseEvent & { features?: mapboxgl.MapboxGeoJSONFeature[] }) => {
      if (!e.features || e.features.length === 0) return;
      const incId = e.features[0].properties?.incidentId;
      if (incId) {
        const incident = incidentMapRef.current.get(incId);
        if (incident) onSelectIncidentRef.current(incident);
      }
    };

    if (m.isStyleLoaded()) {
      ensureFirms();
    } else {
      m.once("idle", ensureFirms);
    }

    m.on("mousemove", firmsLayerId, onFirmsMouseMove);
    m.on("mouseleave", firmsLayerId, onFirmsMouseLeave);
    m.on("click", firmsLayerId, onFirmsClick);

    return () => {
      hideLayers();
      m.off("mousemove", firmsLayerId, onFirmsMouseMove);
      m.off("mouseleave", firmsLayerId, onFirmsMouseLeave);
      m.off("click", firmsLayerId, onFirmsClick);
    };
  }, [showFirms, firmsGeoJSON, styleRevision]);

  // Seismic event overlay
  useEffect(() => {
    const m = map.current;
    if (!m) return;

    const seismicSourceId = "seismic-events";
    const seismicLayerId = "seismic-points";
    const seismicGlowId = "seismic-glow";

    const hideLayers = () => {
      try {
        if (m.getLayer(seismicGlowId)) m.setLayoutProperty(seismicGlowId, "visibility", "none");
        if (m.getLayer(seismicLayerId)) m.setLayoutProperty(seismicLayerId, "visibility", "none");
      } catch { /* ignore */ }
    };

    if (!showSeismic || !seismicGeoJSON) {
      hideLayers();
      return;
    }

    const ensureSeismic = () => {
      const existingSrc = m.getSource(seismicSourceId) as mapboxgl.GeoJSONSource | undefined;
      if (existingSrc) {
        existingSrc.setData(seismicGeoJSON);
        try {
          if (m.getLayer(seismicGlowId)) m.setLayoutProperty(seismicGlowId, "visibility", "visible");
          if (m.getLayer(seismicLayerId)) m.setLayoutProperty(seismicLayerId, "visibility", "visible");
        } catch { /* ignore */ }
        return;
      }

      m.addSource(seismicSourceId, {
        type: "geojson",
        data: seismicGeoJSON,
      });

      // Glow layer
      m.addLayer({
        id: seismicGlowId,
        type: "circle",
        source: seismicSourceId,
        paint: {
          "circle-color": [
            "case",
            ["==", ["get", "correlated"], "1"],
            "#22c55e",
            "#eab308",
          ],
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            3, 10,
            6, 18,
            10, 26,
            14, 40,
          ],
          "circle-opacity": 0.2,
          "circle-blur": 1,
        },
      });

      // Main points
      m.addLayer({
        id: seismicLayerId,
        type: "circle",
        source: seismicSourceId,
        paint: {
          "circle-color": [
            "case",
            ["==", ["get", "correlated"], "1"],
            "#22c55e",
            "#eab308",
          ],
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            3, 4,
            6, 7,
            10, 10,
            14, 15,
          ],
          "circle-opacity": 0.85,
          "circle-stroke-width": 2,
          "circle-stroke-color": [
            "case",
            ["==", ["get", "correlated"], "1"],
            "#86efac",
            "#fde047",
          ],
          "circle-stroke-opacity": 0.6,
        },
      });
    };

    const onSeismicMouseMove = (e: mapboxgl.MapMouseEvent & { features?: mapboxgl.MapboxGeoJSONFeature[] }) => {
      if (!e.features || e.features.length === 0) return;
      m.getCanvas().style.cursor = "pointer";
      const props = e.features[0].properties!;
      const coords = (e.features[0].geometry as GeoJSON.Point).coordinates as [number, number];
      const isCorrelated = props.correlated === "1";
      const statusColor = isCorrelated ? "#22c55e" : "#eab308";
      const statusLabel = isCorrelated ? "STRIKE MATCH" : "SEISMIC EVENT";
      const time = new Date(props.timestamp).toLocaleString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" });
      popupRef.current!
        .setLngLat(coords)
        .setHTML(
          `<div>
            <div style="font-weight:700;color:${statusColor};font-size:11px;margin-bottom:4px;letter-spacing:0.5px;">${statusLabel}</div>
            <div style="color:#ccc;font-size:11px;">M<b>${props.magnitude}</b> · Depth: <b>${props.depth} km</b></div>
            <div style="color:#999;font-size:11px;margin-top:3px;">${escapeHtml(props.place)}</div>
            <div style="color:#999;font-size:10px;margin-top:3px;">${time} UTC · ${escapeHtml(props.type)}</div>
            <div style="color:#666;font-size:10px;margin-top:3px;">${coords[1].toFixed(3)}°N, ${coords[0].toFixed(3)}°E</div>
          </div>`
        )
        .addTo(m);
    };

    const onSeismicMouseLeave = () => {
      m.getCanvas().style.cursor = "";
      popupRef.current?.remove();
    };

    const onSeismicClick = (e: mapboxgl.MapMouseEvent & { features?: mapboxgl.MapboxGeoJSONFeature[] }) => {
      if (!e.features || e.features.length === 0) return;
      const incId = e.features[0].properties?.incidentId;
      if (incId) {
        const incident = incidentMapRef.current.get(incId);
        if (incident) onSelectIncidentRef.current(incident);
      }
    };

    if (m.isStyleLoaded()) {
      ensureSeismic();
    } else {
      m.once("idle", ensureSeismic);
    }

    m.on("mousemove", seismicLayerId, onSeismicMouseMove);
    m.on("mouseleave", seismicLayerId, onSeismicMouseLeave);
    m.on("click", seismicLayerId, onSeismicClick);

    return () => {
      hideLayers();
      m.off("mousemove", seismicLayerId, onSeismicMouseMove);
      m.off("mouseleave", seismicLayerId, onSeismicMouseLeave);
      m.off("click", seismicLayerId, onSeismicClick);
    };
  }, [showSeismic, seismicGeoJSON, styleRevision]);

  // ── Aircraft tracking layer ──────────────────────────────────────────────
  useEffect(() => {
    const m = map.current;
    if (!m) return;

    const srcId = "aircraft-tracking-src";
    const layerId = "aircraft-points";
    const glowId = "aircraft-glow";

    const hideLayers = () => {
      try {
        if (m.getLayer(glowId)) m.setLayoutProperty(glowId, "visibility", "none");
        if (m.getLayer(layerId)) m.setLayoutProperty(layerId, "visibility", "none");
      } catch { /* ignore */ }
    };

    if (!showAircraft || !aircraftGeoJSON) {
      hideLayers();
      return;
    }

    const ensureAircraft = () => {
      const existingSrc = m.getSource(srcId) as mapboxgl.GeoJSONSource | undefined;
      if (existingSrc) {
        existingSrc.setData(aircraftGeoJSON);
        try {
          if (m.getLayer(glowId)) m.setLayoutProperty(glowId, "visibility", "visible");
          if (m.getLayer(layerId)) m.setLayoutProperty(layerId, "visibility", "visible");
        } catch { /* ignore */ }
        return;
      }

      m.addSource(srcId, { type: "geojson", data: aircraftGeoJSON });

      // Glow layer
      m.addLayer({
        id: glowId,
        type: "circle",
        source: srcId,
        paint: {
          "circle-color": "#00ff88",
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 3, 10, 6, 16, 10, 24],
          "circle-opacity": 0.2,
          "circle-blur": 1,
        },
      });

      // Main points
      m.addLayer({
        id: layerId,
        type: "circle",
        source: srcId,
        paint: {
          "circle-color": "#00ff88",
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 3, 4, 6, 6, 10, 9, 14, 12],
          "circle-opacity": 0.85,
          "circle-stroke-width": 1.5,
          "circle-stroke-color": "#00cc66",
          "circle-stroke-opacity": 0.6,
        },
      });
    };

    const buildAircraftPopup = (p: Record<string, unknown>) => {
      const e = (v: unknown) => escapeHtml(String(v ?? ""));
      return `<div>
        <div style="font-weight:700;color:#00ff88;font-size:12px;margin-bottom:4px;letter-spacing:0.5px;">${e(p.callsign) || "UNKNOWN"}</div>
        <div style="color:#ccc;font-size:11px;">Country: <b>${e(p.country) || "Unknown"}</b></div>
        <div style="color:#ccc;font-size:11px;">Type: <b>Military${p.type ? ` (${e(p.type)})` : ""}</b></div>
        <div style="color:#ccc;font-size:11px;">Alt: <b>${p.alt ? `FL${Math.round(Number(p.alt) / 100)}` : "N/A"}</b> · Speed: <b>${p.speed ? `${Math.round(Number(p.speed))}kts` : "N/A"}</b></div>
        <div style="color:#999;font-size:10px;margin-top:3px;">Heading: ${p.heading ? `${Math.round(Number(p.heading))}°` : "N/A"}</div>
        <div style="color:#666;font-size:10px;margin-top:3px;">ICAO: ${e(p.hex)} ${p.registration ? `· ${e(p.registration)}` : ""}</div>
      </div>`;
    };

    const onMouseMove = (e: mapboxgl.MapMouseEvent & { features?: mapboxgl.MapboxGeoJSONFeature[] }) => {
      if (!e.features || e.features.length === 0) return;
      m.getCanvas().style.cursor = "pointer";
      const p = e.features[0].properties!;
      const coords = (e.features[0].geometry as GeoJSON.Point).coordinates as [number, number];
      popupRef.current!.setLngLat(coords).setHTML(buildAircraftPopup(p)).addTo(m);
    };

    const onMouseLeave = () => {
      m.getCanvas().style.cursor = "";
      popupRef.current?.remove();
    };

    const onClick = (e: mapboxgl.MapMouseEvent & { features?: mapboxgl.MapboxGeoJSONFeature[] }) => {
      if (!e.features || e.features.length === 0) return;
      const p = e.features[0].properties!;
      const coords = (e.features[0].geometry as GeoJSON.Point).coordinates as [number, number];
      new mapboxgl.Popup({ closeButton: true, closeOnClick: true, className: "dark-popup", maxWidth: "260px" })
        .setLngLat(coords)
        .setHTML(buildAircraftPopup(p))
        .addTo(m);
    };

    if (m.isStyleLoaded()) {
      ensureAircraft();
    } else {
      m.once("idle", ensureAircraft);
    }

    m.on("mousemove", layerId, onMouseMove);
    m.on("mouseleave", layerId, onMouseLeave);
    m.on("click", layerId, onClick);

    return () => {
      hideLayers();
      m.off("mousemove", layerId, onMouseMove);
      m.off("mouseleave", layerId, onMouseLeave);
      m.off("click", layerId, onClick);
    };
  }, [showAircraft, aircraftGeoJSON, styleRevision]);

  // ── Vessel tracking layer ────────────────────────────────────────────────
  useEffect(() => {
    const m = map.current;
    if (!m) return;

    const srcId = "vessel-tracking-src";
    const layerId = "vessel-points";

    const hideLayers = () => {
      try {
        if (m.getLayer(layerId)) m.setLayoutProperty(layerId, "visibility", "none");
      } catch { /* ignore */ }
    };

    if (!showVessels || !vesselGeoJSON) {
      hideLayers();
      return;
    }

    const ensureVessels = () => {
      const existingSrc = m.getSource(srcId) as mapboxgl.GeoJSONSource | undefined;
      if (existingSrc) {
        existingSrc.setData(vesselGeoJSON);
        try {
          if (m.getLayer(layerId)) m.setLayoutProperty(layerId, "visibility", "visible");
        } catch { /* ignore */ }
        return;
      }

      m.addSource(srcId, { type: "geojson", data: vesselGeoJSON });

      m.addLayer({
        id: layerId,
        type: "circle",
        source: srcId,
        paint: {
          "circle-color": [
            "match",
            ["get", "shipType"],
            "military", "#ff4444",
            "tanker", "#f59e0b",
            "cargo", "#8b5cf6",
            "passenger", "#3b82f6",
            "fishing", "#22c55e",
            "tug", "#6b7280",
            "#38bdf8", // default: other
          ],
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 3, 2, 6, 4, 10, 7, 14, 10],
          "circle-opacity": 0.75,
          "circle-stroke-width": 1,
          "circle-stroke-color": "rgba(255,255,255,0.3)",
        },
      });
    };

    const vesselTypeColors: Record<string, string> = {
      military: "#ff4444", tanker: "#f59e0b", cargo: "#8b5cf6",
      passenger: "#3b82f6", fishing: "#22c55e", tug: "#6b7280", other: "#38bdf8",
    };

    const buildVesselPopup = (p: Record<string, unknown>) => {
      const e = (v: unknown) => escapeHtml(String(v ?? ""));
      const color = vesselTypeColors[p.shipType as string] || "#38bdf8";
      return `<div>
        <div style="font-weight:700;color:${color};font-size:12px;margin-bottom:4px;letter-spacing:0.5px;">${e(p.name) || "UNKNOWN"}</div>
        <div style="color:#ccc;font-size:11px;">Country: <b>${e(p.country) || "Unknown"}</b></div>
        <div style="color:#ccc;font-size:11px;">Type: <b>${e((p.shipType as string || "other").toUpperCase())}</b></div>
        <div style="color:#ccc;font-size:11px;">Speed: <b>${p.sog != null ? `${Number(p.sog).toFixed(1)}kts` : "N/A"}</b> · Course: <b>${p.cog != null ? `${Math.round(Number(p.cog))}°` : "N/A"}</b></div>
        <div style="color:#666;font-size:10px;margin-top:3px;">MMSI: ${e(p.mmsi)}</div>
      </div>`;
    };

    const onMouseMove = (e: mapboxgl.MapMouseEvent & { features?: mapboxgl.MapboxGeoJSONFeature[] }) => {
      if (!e.features || e.features.length === 0) return;
      m.getCanvas().style.cursor = "pointer";
      const p = e.features[0].properties!;
      const coords = (e.features[0].geometry as GeoJSON.Point).coordinates as [number, number];
      popupRef.current!.setLngLat(coords).setHTML(buildVesselPopup(p)).addTo(m);
    };

    const onMouseLeave = () => {
      m.getCanvas().style.cursor = "";
      popupRef.current?.remove();
    };

    const onClick = (e: mapboxgl.MapMouseEvent & { features?: mapboxgl.MapboxGeoJSONFeature[] }) => {
      if (!e.features || e.features.length === 0) return;
      const p = e.features[0].properties!;
      const coords = (e.features[0].geometry as GeoJSON.Point).coordinates as [number, number];
      new mapboxgl.Popup({ closeButton: true, closeOnClick: true, className: "dark-popup", maxWidth: "260px" })
        .setLngLat(coords)
        .setHTML(buildVesselPopup(p))
        .addTo(m);
    };

    if (m.isStyleLoaded()) {
      ensureVessels();
    } else {
      m.once("idle", ensureVessels);
    }

    m.on("mousemove", layerId, onMouseMove);
    m.on("mouseleave", layerId, onMouseLeave);
    m.on("click", layerId, onClick);

    return () => {
      hideLayers();
      m.off("mousemove", layerId, onMouseMove);
      m.off("mouseleave", layerId, onMouseLeave);
      m.off("click", layerId, onClick);
    };
  }, [showVessels, vesselGeoJSON, styleRevision]);

  // Country border/fill overlay toggle
  useEffect(() => {
    const m = map.current;
    if (!m) return;

    const fillId = "country-overlay-fill";
    const lineId = "country-overlay-line";

    const removeLayers = () => {
      try {
        if (m.getLayer(lineId)) m.removeLayer(lineId);
        if (m.getLayer(fillId)) m.removeLayer(fillId);
      } catch { /* ignore */ }
    };

    if (!showCountries) {
      removeLayers();
      return;
    }

    const ISO_CODES = [
      "IRN", "ISR", "IRQ", "SYR", "LBN", "JOR",
      "SAU", "YEM", "ARE", "BHR", "KWT", "QAT", "OMN", "PSE",
    ];

    const addLayers = () => {
      removeLayers();

      if (!m.getSource(COUNTRY_BOUNDARIES_SRC)) return;

      const beforeLayer = m.getLayer("incident-clusters") ? "incident-clusters" : undefined;

      m.addLayer({
        id: fillId,
        type: "fill",
        source: COUNTRY_BOUNDARIES_SRC,
        "source-layer": "country_boundaries",
        filter: ["in", ["get", "iso_3166_1_alpha_3"], ["literal", ISO_CODES]],
        paint: {
          "fill-color": [
            "match", ["get", "iso_3166_1_alpha_3"],
            "IRN", "rgba(251, 146, 60, 0.15)",
            "ISR", "rgba(59, 130, 246, 0.15)",
            "IRQ", "rgba(234, 179, 8, 0.12)",
            "SYR", "rgba(168, 85, 247, 0.12)",
            "LBN", "rgba(34, 197, 94, 0.12)",
            "JOR", "rgba(249, 115, 22, 0.12)",
            "SAU", "rgba(236, 72, 153, 0.10)",
            "YEM", "rgba(6, 182, 212, 0.12)",
            "ARE", "rgba(139, 92, 246, 0.10)",
            "BHR", "rgba(20, 184, 166, 0.10)",
            "KWT", "rgba(251, 191, 36, 0.12)",
            "QAT", "rgba(217, 119, 6, 0.12)",
            "OMN", "rgba(56, 189, 248, 0.10)",
            "PSE", "rgba(74, 222, 128, 0.12)",
            "rgba(100, 100, 100, 0.08)",
          ],
        },
      }, beforeLayer);

      m.addLayer({
        id: lineId,
        type: "line",
        source: COUNTRY_BOUNDARIES_SRC,
        "source-layer": "country_boundaries",
        filter: ["in", ["get", "iso_3166_1_alpha_3"], ["literal", ISO_CODES]],
        paint: {
          "line-color": "rgba(255, 255, 255, 0.35)",
          "line-width": 1.5,
        },
      }, beforeLayer);
    };

    if (m.isStyleLoaded()) {
      addLayers();
    } else {
      m.once("idle", addLayers);
    }

    return removeLayers;
  }, [showCountries, styleRevision]);

  // Country name → ISO 3166-1 alpha-3 mapping for flash/siren effects
  const countryToISO = useCallback((name: string): string | null => {
    const map: Record<string, string> = {
      "Iran": "IRN", "Israel": "ISR", "Iraq": "IRQ", "Syria": "SYR",
      "Lebanon": "LBN", "Jordan": "JOR", "Saudi Arabia": "SAU", "Yemen": "YEM",
      "United Arab Emirates": "ARE", "Bahrain": "BHR", "Kuwait": "KWT",
      "Qatar": "QAT", "Oman": "OMN", "Palestine": "PSE",
      "Pakistan": "PAK", "Afghanistan": "AFG", "Cyprus": "CYP",
      "UAE": "ARE", "Gaza": "PSE", "Turkey": "TUR",
    };
    return map[name] ?? null;
  }, []);

  // One-shot flash for strike on a country (fade out over 3s) — uses shared country vector source
  useEffect(() => {
    const m = map.current;
    if (!m || !flashCountry) return;
    const iso = countryToISO(flashCountry);
    if (!iso) return;

    const fillId = "country-flash-fill";
    const lineId = "country-flash-line";

    const addFlash = () => {
      try {
        if (!m.getSource(COUNTRY_BOUNDARIES_SRC)) return;

        // Remove old layers if present
        if (m.getLayer(fillId)) m.removeLayer(fillId);
        if (m.getLayer(lineId)) m.removeLayer(lineId);

        const isoFilter: mapboxgl.FilterSpecification = ["==", ["get", "iso_3166_1_alpha_3"], iso];

        m.addLayer({
          id: fillId,
          type: "fill",
          source: COUNTRY_BOUNDARIES_SRC,
          "source-layer": "country_boundaries",
          filter: isoFilter,
          paint: { "fill-color": "#ef4444", "fill-opacity": 0.35 },
        });
        m.addLayer({
          id: lineId,
          type: "line",
          source: COUNTRY_BOUNDARIES_SRC,
          "source-layer": "country_boundaries",
          filter: isoFilter,
          paint: { "line-color": "#ef4444", "line-width": 2, "line-opacity": 0.8 },
        });

        // Fade out over 3s
        const steps = 30;
        const interval = 100;
        let step = 0;
        const fadeTimer = setInterval(() => {
          step++;
          const progress = step / steps;
          try {
            m.setPaintProperty(fillId, "fill-opacity", 0.35 * (1 - progress));
            m.setPaintProperty(lineId, "line-opacity", 0.8 * (1 - progress));
          } catch { /* layer removed */ }
          if (step >= steps) {
            clearInterval(fadeTimer);
            try {
              if (m.getLayer(fillId)) m.removeLayer(fillId);
              if (m.getLayer(lineId)) m.removeLayer(lineId);
            } catch { /* ignore */ }
          }
        }, interval);

        return fadeTimer;
      } catch { /* layers not ready */ }
      return undefined;
    };

    let fadeTimer: ReturnType<typeof setInterval> | undefined;
    if (m.isStyleLoaded()) {
      fadeTimer = addFlash();
    } else {
      m.once("idle", () => { fadeTimer = addFlash(); });
    }

    return () => {
      if (fadeTimer) clearInterval(fadeTimer);
      try {
        if (m.getLayer(fillId)) m.removeLayer(fillId);
        if (m.getLayer(lineId)) m.removeLayer(lineId);
      } catch { /* ignore */ }
    };
  }, [flashCountry, sirenCountries, countryToISO, styleRevision]);

  // Sustained pulsing flash for siren countries — uses shared country vector source
  useEffect(() => {
    const m = map.current;
    if (!m) return;

    const sirenFillId = "country-siren-fill";
    const sirenLineId = "country-siren-line";

    const removeLayers = () => {
      try {
        if (m.getLayer(sirenFillId)) m.removeLayer(sirenFillId);
        if (m.getLayer(sirenLineId)) m.removeLayer(sirenLineId);
      } catch { /* ignore */ }
    };

    if (sirenCountries.length === 0) {
      removeLayers();
      return;
    }

    // Convert country names to ISO codes
    const isoCodes = sirenCountries
      .map((name) => countryToISO(name))
      .filter((c): c is string => c !== null);

    if (isoCodes.length === 0) {
      removeLayers();
      return;
    }

    const addSiren = () => {
      removeLayers();

      if (!m.getSource(COUNTRY_BOUNDARIES_SRC)) return;

      const isoFilter: mapboxgl.FilterSpecification = [
        "in", ["get", "iso_3166_1_alpha_3"],
        ["literal", isoCodes],
      ];

      m.addLayer({
        id: sirenFillId,
        type: "fill",
        source: COUNTRY_BOUNDARIES_SRC,
        "source-layer": "country_boundaries",
        filter: isoFilter,
        paint: { "fill-color": "#ef4444", "fill-opacity": 0.08 },
      });
      m.addLayer({
        id: sirenLineId,
        type: "line",
        source: COUNTRY_BOUNDARIES_SRC,
        "source-layer": "country_boundaries",
        filter: isoFilter,
        paint: { "line-color": "#ef4444", "line-width": 2.5, "line-opacity": 0.3 },
      });
    };

    if (m.isStyleLoaded()) {
      addSiren();
    } else {
      m.once("idle", addSiren);
    }

    // Pulsing animation: opacity oscillates between 0.08 and 0.30
    let frame = 0;
    const pulseTimer = setInterval(() => {
      frame++;
      const cycle = (Math.sin(frame * 0.12) + 1) / 2;
      const fillOp = 0.08 + cycle * 0.22;
      const lineOp = 0.3 + cycle * 0.5;
      try {
        m.setPaintProperty(sirenFillId, "fill-opacity", fillOp);
        m.setPaintProperty(sirenLineId, "line-opacity", lineOp);
      } catch { /* ignore */ }
    }, 50);

    return () => {
      clearInterval(pulseTimer);
      removeLayers();
    };
  }, [sirenCountries, countryToISO, styleRevision]);

  return <div ref={mapContainer} className="w-full h-full" />;
}
