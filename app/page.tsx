"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import dynamic from "next/dynamic";
import Header from "@/components/Header";
import IncidentCard from "@/components/IncidentCard";
import BaseCard from "@/components/BaseCard";
import { MilitaryBase } from "@/lib/militaryBases";
import Legend from "@/components/Legend";
import AccuracyGauge from "@/components/AccuracyGauge";
import FeedSidebar from "@/components/FeedSidebar";
import { Incident, MissileAlert, ViewMode } from "@/lib/types";
import MissileOverlay from "@/components/MissileOverlay";
import A10Overlay from "@/components/A10Overlay";
import { detectCountry, shouldFlashCountry } from "@/lib/countryDetection";
import AnimationTestPanel from "@/components/AnimationTestPanel";
import StrikeFlash from "@/components/StrikeFlash";
import NewsTicker from "@/components/NewsTicker";
import MapOverlayControls from "@/components/MapOverlayControls";

import CasualtyTracker from "@/components/CasualtyTracker";
import StrikeCounter from "@/components/StrikeCounter";
import CyberStatus from "@/components/CyberStatus";
import ConflictClock from "@/components/ConflictClock";
import EscalationMeter from "@/components/EscalationMeter";
import LiveFeedMobile, { LiveFeedDesktop } from "@/components/LiveFeedPlayer";
import LiveVideoPanel from "@/components/LiveVideoPanel";
import CurrentCam from "@/components/CurrentCam";
import { MAP_STYLES, getStoredStyle, setStoredStyle } from "@/lib/mapStyles";
import { UserSettings, loadSettings, saveSettings } from "@/lib/settings";
import { ALERT_FILTER_COUNTRIES } from "@/lib/constants";
import FloatingWidget from "@/components/FloatingWidget";
import { WIDGET_MAP, DEFAULT_ACTIVE_WIDGETS, getBaseWidgetId } from "@/components/widgetRegistry";
import { setVolume as setAudioVolume, playImpactSound, resumeAudio } from "@/lib/sounds";
import SettingsPanel from "@/components/SettingsPanel";
import ChatPanel, { type ChatTab } from "@/components/ChatPanel";
import AirspaceStatus from "@/components/AirspaceStatus";
import SpeechPanel from "@/components/SpeechPanel";
import Timeline from "@/components/Timeline";
import { useTimeline } from "@/hooks/useTimeline";
import { useShare } from "@/components/ShareButton";
import { useNotifications } from "@/hooks/useNotifications";
import { useIncidentPolling } from "@/hooks/useIncidentPolling";
import { useAlertPolling } from "@/hooks/useAlertPolling";
import { useNotamPolling } from "@/hooks/useNotamPolling";
import { useSirenPolling } from "@/hooks/useSirenPolling";
import { useFIRMSPolling } from "@/hooks/useFIRMSPolling";
import SatellitePanel from "@/components/SatellitePanel";
import SirenBanner from "@/components/SirenBanner";
import InterceptionBanner from "@/components/InterceptionBanner";
import MobileTabBar, { type MobileTab } from "@/components/MobileTabBar";
import MobileStatsPanel from "@/components/MobileStatsPanel";
import MobileFeedPanel from "@/components/MobileFeedPanel";
import Link from "next/link";
import { decodeState } from "@/lib/urlState";
import mapboxgl from "mapbox-gl";

const MapView = dynamic(() => import("@/components/Map"), { ssr: false });

const isMapView = (mode: ViewMode) =>
  !["leadership", "stats", "weapons", "killchain", "airspace"].includes(mode);

export default function Home() {
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [selectedBase, setSelectedBase] = useState<MilitaryBase | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("all");
  const [mapInstance, setMapInstance] = useState<mapboxgl.Map | null>(null);
  const [selectedAlert, setSelectedAlert] = useState<MissileAlert | null>(null);
  const [showBases, setShowBases] = useState(false);
  const [showProxies, setShowProxies] = useState(false);
  const [showFirms, setShowFirms] = useState(false);
  const [showCountries, setShowCountries] = useState(false);
  const [rangeWeapon, setRangeWeapon] = useState<{ lat: number; lng: number; radiusKm: number } | null>(null);
  const [mapStyle, setMapStyle] = useState("dark");
  const [settings, setSettings] = useState<UserSettings>(loadSettings);
  const [disclaimerAccepted, setDisclaimerAccepted] = useState(false);
  const [speechConfig, setSpeechConfig] = useState<{ id: string; title: string; enabled: boolean } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [announcement, setAnnouncement] = useState<string | null>(null);
  const [tickerText, setTickerText] = useState<string | null>(null);
  const [briefingHeadlines, setBriefingHeadlines] = useState<{ headline: string; severity: "low" | "medium" | "high" | "critical" }[]>([]);
  const [announcementDismissed, setAnnouncementDismissed] = useState<string | null>(() => {
    if (typeof window !== "undefined") return sessionStorage.getItem("strikemap-announcement-dismissed");
    return null;
  });
  const [mobileTab, setMobileTab] = useState<MobileTab>("map");
  const [a10Trigger, setA10Trigger] = useState<Incident | null>(null);
  const [flashCountryName, setFlashCountryName] = useState<string | null>(null);
  const [debugPanel, setDebugPanel] = useState(false);
  const [testAlerts, setTestAlerts] = useState<MissileAlert[]>([]);
  const [testSirenCountries, setTestSirenCountries] = useState<string[]>([]);
  const [chatOpen, setChatOpen] = useState(false);
  const [liveVideoOpen, setLiveVideoOpen] = useState(false);
  const [chatTab, setChatTab] = useState<ChatTab>("chat");
  const [hasUnreadChat, setHasUnreadChat] = useState(false);
  const chatMsgCountRef = useRef(0);
  const [activeUsers, setActiveUsers] = useState(0);

  // Widget system state
  const [activeWidgets, setActiveWidgets] = useState<string[]>(() => {
    const s = loadSettings();
    const saved = s.activeWidgets ?? DEFAULT_ACTIVE_WIDGETS;
    // Auto-add new widgets for existing users
    const toAdd = ["feed", "strike-counter"].filter((id) => !saved.includes(id));
    if (toAdd.length > 0) return [...saved, ...toAdd];
    return saved;
  });
  const [widgetPositions, setWidgetPositions] = useState<Record<string, { x: number; y: number; w?: number; h?: number }>>(() => {
    const s = loadSettings();
    return s.widgetPositions ?? {};
  });
  const [widgetPickerOpen, setWidgetPickerOpen] = useState(false);
  const [widgetZStack, setWidgetZStack] = useState<string[]>([]);

  // Timeline state
  const [timelineActive, setTimelineActive] = useState(false);
  const [timelineIndex, setTimelineIndex] = useState(0);
  const [timelinePlaying, setTimelinePlaying] = useState(false);
  const [timelineSpeed, setTimelineSpeed] = useState(1);
  const [timelineFlashKey, setTimelineFlashKey] = useState(0);
  const [timelineA10, setTimelineA10] = useState<Incident | null>(null);
  const [timelineMissiles, setTimelineMissiles] = useState<MissileAlert[]>([]);
  const prevTimelineIndex = useRef(timelineIndex);

  // Initialize audio volume from saved settings
  useEffect(() => {
    setAudioVolume(settings.volume ?? 80);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debug panel keyboard shortcut (Ctrl+Shift+D) — dev only
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === "D") {
        e.preventDefault();
        setDebugPanel((p) => !p);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Unread chat detection
  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch("/api/chat");
        const data = await res.json();
        const count = data.messages?.length || 0;
        if (chatMsgCountRef.current > 0 && count > chatMsgCountRef.current && !chatOpen) {
          setHasUnreadChat(true);
        }
        chatMsgCountRef.current = count;
      } catch {}
    };
    check();
    const iv = setInterval(check, 15_000);
    return () => clearInterval(iv);
  }, [chatOpen]);

  // Clear unread when chat is opened
  useEffect(() => {
    if (chatOpen) setHasUnreadChat(false);
  }, [chatOpen]);

  // Active user heartbeat — unique session ID per tab
  useEffect(() => {
    const sessionId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const heartbeat = async () => {
      try {
        const res = await fetch("/api/active-users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId }),
        });
        const data = await res.json();
        if (typeof data.count === "number") setActiveUsers(data.count);
      } catch {}
    };
    heartbeat();
    const iv = setInterval(heartbeat, 60_000);
    return () => clearInterval(iv);
  }, []);

  // Notifications
  const { sendNotification } = useNotifications();
  const sendNotificationRef = useRef(sendNotification);
  sendNotificationRef.current = sendNotification;

  // Settings ref for polling callbacks
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  // URL state restoration
  const pendingSelectedId = useRef<string | null>(null);
  const [initialCenter, setInitialCenter] = useState<[number, number] | undefined>();
  const [initialZoom, setInitialZoom] = useState<number | undefined>();

  // Check if disclaimer was already accepted this session
  useEffect(() => {
    if (typeof window !== "undefined" && sessionStorage.getItem("strikemap-disclaimer") === "1") {
      setDisclaimerAccepted(true);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const state = decodeState(window.location.search);
    if (state.viewMode) setViewMode(state.viewMode);
    if (state.center) setInitialCenter(state.center);
    if (state.zoom != null) setInitialZoom(state.zoom);
    if (state.selectedId) pendingSelectedId.current = state.selectedId;
    const savedStyle = getStoredStyle();
    if (savedStyle !== "dark") setMapStyle(savedStyle);
  }, []);

  // Polling hooks
  const {
    incidents,
    loading,
    flashActive: incidentFlashActive,
    flashKey: incidentFlashKey,
    lastIranStrikeAt,
    lastUSStrikeAt,
    lastIsraelStrikeAt,
  } = useIncidentPolling({
    soundEnabled: settingsRef.current.soundEnabled,
    notificationsEnabled: settingsRef.current.notificationsEnabled,
    sendNotification: sendNotificationRef.current,
    mapInstance,
    onNewStrikes: (newIncs) => {
      let hasA10 = false;
      for (const inc of newIncs) {
        // A-10 BRRT for US/Israel strikes on Iran
        const side = inc.side;
        if ((side === "us" || side === "israel" || side === "us_israel") &&
            inc.location?.toLowerCase().includes("iran")) {
          setA10Trigger(inc);
          setTimeout(() => setA10Trigger(null), 5000);
          hasA10 = true;
        }
        // Territory flash for non-Iran/non-Israel countries
        const country = detectCountry(inc.location);
        if (shouldFlashCountry(country)) {
          setFlashCountryName(country);
          setTimeout(() => setFlashCountryName(null), 4000);
        }
      }
      // Delay incident card + zoom-in so A-10 animation plays first
      if (newIncs.length > 0) {
        const delay = hasA10 ? 3500 : 0;
        setTimeout(() => setSelectedIncident(newIncs[0]), delay);
      }
    },
  });

  const {
    alerts,
    outcomes,
    flashActive: alertFlashActive,
    flashKey: alertFlashKey,
    activeIsraelRegions,
  } = useAlertPolling({
    soundEnabled: settingsRef.current.soundEnabled,
    notificationsEnabled: settingsRef.current.notificationsEnabled,
    sendNotification: sendNotificationRef.current,
    mapInstance,
    alertCountries: settingsRef.current.alertCountries,
  });

  const notams = useNotamPolling();

  const { sirenAlerts } = useSirenPolling({
    soundEnabled: settingsRef.current.soundEnabled,
    notificationsEnabled: settingsRef.current.notificationsEnabled,
    sendNotification: sendNotificationRef.current,
    onNewSiren: (country) => {
      setFlashCountryName(country);
      setTimeout(() => setFlashCountryName(null), 4000);
    },
    alertCountries: settingsRef.current.alertCountries,
  });

  // Jordan sirens mirror Israel — whenever Israel has active alerts, inject Jordan siren
  const sirenAlertsWithJordan = useMemo(() => {
    const israelActive = activeIsraelRegions.length > 0 || alerts.some((a) => a.status === "active");
    if (!israelActive) return sirenAlerts;
    // Don't duplicate if Jordan is already in the list
    if (sirenAlerts.some((a) => a.country === "Jordan")) return sirenAlerts;
    return [
      ...sirenAlerts,
      {
        id: "jordan-mirror-israel",
        country: "Jordan",
        activatedAt: Date.now(),
        lastSeenAt: Date.now(),
        sourceChannel: "israel-mirror",
        status: "active" as const,
      },
    ];
  }, [sirenAlerts, activeIsraelRegions, alerts]);

  // Flash Israel on map when Tzofar sirens first fire
  const prevIsraelRegionsRef = useRef<string[]>([]);
  useEffect(() => {
    if (activeIsraelRegions.length > 0 && prevIsraelRegionsRef.current.length === 0) {
      setFlashCountryName("Israel");
      setTimeout(() => setFlashCountryName(null), 4000);
    }
    prevIsraelRegionsRef.current = activeIsraelRegions;
  }, [activeIsraelRegions]);

  // Memoize siren country list so the Map effect doesn't re-run on every poll
  const sirenCountryList = useMemo(() => {
    const countries = [
      ...sirenAlertsWithJordan.map((a) => a.country),
      ...testSirenCountries,
      ...(activeIsraelRegions.length > 0 ? ["Israel"] : []),
    ];
    return [...new Set(countries)].sort();
  }, [
    // eslint-disable-next-line react-hooks/exhaustive-deps
    sirenAlertsWithJordan.map((a) => a.country).sort().join(","),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    testSirenCountries.join(","),
    activeIsraelRegions.length > 0,
  ]);

  const firmsEnabled = showFirms || viewMode === "satellite";
  const { geojson: firmsGeoJSON, counts: firmsCounts } = useFIRMSPolling(firmsEnabled);

  const flashActive = incidentFlashActive || alertFlashActive || timelineFlashKey > 0;
  const flashKeyTotal = incidentFlashKey + alertFlashKey + timelineFlashKey;

  // Resolve pending selected incident from URL state
  useEffect(() => {
    if (pendingSelectedId.current && incidents.length > 0) {
      const found = incidents.find((i: Incident) => i.id === pendingSelectedId.current);
      if (found) setSelectedIncident(found);
      pendingSelectedId.current = null;
    }
  }, [incidents]);

  // Fetch announcement
  useEffect(() => {
    const fetchAnnouncement = () => {
      fetch("/api/announcement")
        .then((r) => r.json())
        .then((d) => {
          const text = d.announcement?.text || null;
          setAnnouncement(text);
        })
        .catch(() => {});
    };
    fetchAnnouncement();
    const interval = setInterval(fetchAnnouncement, 30_000);
    return () => clearInterval(interval);
  }, []);

  // Fetch ticker text
  useEffect(() => {
    const fetchTickerText = () => {
      fetch("/api/ticker-text")
        .then((r) => r.json())
        .then((d) => setTickerText(d.text || null))
        .catch(() => {});
    };
    fetchTickerText();
    const interval = setInterval(fetchTickerText, 30_000);
    return () => clearInterval(interval);
  }, []);

  // Fetch 6-hour briefing headlines for ticker
  useEffect(() => {
    const fetchBriefing = () => {
      fetch("/api/report?period=6")
        .then((r) => r.json())
        .then((d) => {
          if (d.report?.key_developments?.length > 0) {
            setBriefingHeadlines(d.report.key_developments.map((dev: { headline: string; severity: string }) => ({
              headline: dev.headline,
              severity: dev.severity as "low" | "medium" | "high" | "critical",
            })));
          }
        })
        .catch(() => {});
    };
    fetchBriefing();
    // Refresh every 10 minutes (report cached for 6 hours server-side)
    const interval = setInterval(fetchBriefing, 10 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // Fetch YouTube speech config
  useEffect(() => {
    fetch("/api/youtube-links")
      .then((r) => r.json())
      .then((d) => { if (d.speech) setSpeechConfig(d.speech); })
      .catch(() => {});
  }, []);

  // Filter by view mode
  const filteredIncidents = useMemo(() => {
    let result = viewMode === "all" || !isMapView(viewMode)
      ? incidents
      : viewMode === "us_israel"
        ? incidents.filter((i) => i.side === "us_israel" || i.side === "us" || i.side === "israel")
        : incidents.filter((i) => i.side === viewMode);
    if (settings.dateFrom) {
      result = result.filter((i) => i.date >= settings.dateFrom!);
    }
    return result;
  }, [viewMode, incidents, settings.dateFrom]);

  // Timeline: sorted unique hour slots from ALL incidents
  const getHourKey = useCallback((inc: Incident): string => {
    if (inc.timestamp) {
      // "2026-03-01T14:30:00+00:00" → "2026-03-01T14"
      const m = inc.timestamp.match(/^(\d{4}-\d{2}-\d{2})T(\d{2})/);
      if (m) return `${m[1]}T${m[2]}`;
    }
    return `${inc.date}T00`;
  }, []);

  const allHours = useMemo(() => {
    const hourSet = new Set(incidents.map(getHourKey));
    return Array.from(hourSet).sort();
  }, [incidents, getHourKey]);

  // Pre-compute hourKey → incidents for animation replay
  const hourToIncidents = useMemo(() => {
    const map = new Map<string, Incident[]>();
    for (const inc of incidents) {
      const key = getHourKey(inc);
      const arr = map.get(key);
      if (arr) arr.push(inc);
      else map.set(key, [inc]);
    }
    return map;
  }, [incidents, getHourKey]);

  // Timeline slots: prepend empty slot so index 0 = blank map
  const timelineSlots = useMemo(() => ["", ...allHours], [allHours]);

  // Apply timeline filter on top of side filter
  const timelineFilteredIncidents = useMemo(() => {
    if (!timelineActive || allHours.length === 0) return filteredIncidents;
    if (timelineIndex === 0) return []; // blank start
    const cutoffHour = allHours[timelineIndex - 1];
    return filteredIncidents.filter((i) => getHourKey(i) <= cutoffHour);
  }, [timelineActive, timelineIndex, allHours, filteredIncidents, getHourKey]);

  // Only pass incidents with valid coordinates to the map (skip ~58% that have none)
  const mapIncidents = useMemo(
    () => timelineFilteredIncidents.filter((i) => i.lat !== 0 && i.lng !== 0),
    [timelineFilteredIncidents]
  );

  useTimeline({
    totalSteps: timelineSlots.length,
    currentIndex: timelineIndex,
    onIndexChange: setTimelineIndex,
    isPlaying: timelinePlaying,
    speed: timelineSpeed,
  });

  // Auto-pause at end
  useEffect(() => {
    if (timelineIndex >= timelineSlots.length - 1 && timelinePlaying) {
      setTimelinePlaying(false);
    }
  }, [timelineIndex, timelineSlots.length, timelinePlaying]);

  // Animation replay: fire StrikeFlash, A10, flyTo, crosshairs, territory flash, and sounds
  const crosshairMarkersRef = useRef<mapboxgl.Marker[]>([]);

  useEffect(() => {
    if (!timelineActive || !timelinePlaying) {
      prevTimelineIndex.current = timelineIndex;
      return;
    }
    const prev = prevTimelineIndex.current;
    prevTimelineIndex.current = timelineIndex;

    if (timelineIndex <= prev) return;

    // Collect incidents in newly revealed hour slots
    // Index i reveals allHours[i-1] (index 0 is blank start)
    const newIncidents: Incident[] = [];
    for (let i = prev; i < timelineIndex; i++) {
      if (i >= 0 && i < allHours.length) {
        const key = allHours[i];
        const batch = hourToIncidents.get(key);
        if (batch) newIncidents.push(...batch);
      }
    }

    if (newIncidents.length === 0) return;

    // Only consider incidents with valid coordinates for map animations
    const geoIncidents = newIncidents.filter((i) => i.lat !== 0 && i.lng !== 0);

    // Trigger StrikeFlash
    setTimelineFlashKey((k) => k + 1);

    // Play impact sound if sound enabled
    if (settingsRef.current.soundEnabled) {
      playImpactSound();
    }

    if (geoIncidents.length === 0) return;

    // Territory flash for non-Iran/non-Israel countries (matches live behavior)
    for (const inc of geoIncidents) {
      const country = detectCountry(inc.location);
      if (shouldFlashCountry(country)) {
        setFlashCountryName(country);
        setTimeout(() => setFlashCountryName(null), 4000);
        break;
      }
    }

    // Spawn crosshair markers at each new strike location
    if (mapInstance) {
      // Clear previous crosshairs
      for (const m of crosshairMarkersRef.current) m.remove();
      crosshairMarkersRef.current = [];

      for (const inc of geoIncidents) {
        const color = (inc.side === "us" || inc.side === "israel" || inc.side === "us_israel")
          ? "#3b82f6" : "#ef4444";
        const el = document.createElement("div");
        el.className = "timeline-crosshair";
        el.style.setProperty("--crosshair-color", color);
        el.innerHTML = `<svg width="48" height="48" viewBox="0 0 48 48" fill="none">
          <circle cx="24" cy="24" r="14" stroke="${color}" stroke-width="2" opacity="0.9"/>
          <circle cx="24" cy="24" r="4" stroke="${color}" stroke-width="1.5" opacity="0.7"/>
          <line x1="24" y1="2" x2="24" y2="10" stroke="${color}" stroke-width="2" stroke-linecap="round"/>
          <line x1="24" y1="38" x2="24" y2="46" stroke="${color}" stroke-width="2" stroke-linecap="round"/>
          <line x1="2" y1="24" x2="10" y2="24" stroke="${color}" stroke-width="2" stroke-linecap="round"/>
          <line x1="38" y1="24" x2="46" y2="24" stroke="${color}" stroke-width="2" stroke-linecap="round"/>
        </svg>`;
        const marker = new mapboxgl.Marker({ element: el, anchor: "center" })
          .setLngLat([inc.lng, inc.lat])
          .addTo(mapInstance);
        crosshairMarkersRef.current.push(marker);
      }

      // Fade out and remove crosshairs after 3s
      setTimeout(() => {
        for (const m of crosshairMarkersRef.current) {
          const el = m.getElement();
          el.classList.add("fade-out");
        }
        setTimeout(() => {
          for (const m of crosshairMarkersRef.current) m.remove();
          crosshairMarkersRef.current = [];
        }, 1000);
      }, 3000);
    }

    // Synthesize missile flight animations from incidents
    const syntheticAlerts: MissileAlert[] = geoIncidents.map((inc, idx) => {
      const side = inc.side;
      const isDrone = inc.weapon?.toLowerCase().includes("drone") ||
                      inc.weapon?.toLowerCase().includes("uav") ||
                      inc.weapon?.toLowerCase().includes("shahed");
      // Determine origin based on who launched
      let originLat: number, originLng: number;
      if (side === "iran") {
        // Iran launching toward Israel/Gulf
        originLat = 35.69; originLng = 51.39; // Tehran
      } else if (side === "israel") {
        originLat = 31.77; originLng = 35.22; // Jerusalem
      } else {
        // US or US/Israel — from Persian Gulf / Diego Garcia area
        originLat = 25.3; originLng = 51.5; // Qatar/Gulf region
      }
      return {
        id: `timeline-${timelineIndex}-${idx}`,
        postId: inc.id,
        timestamp: new Date().toISOString(),
        regions: [inc.location || "Unknown"],
        cities: [],
        lat: inc.lat,
        lng: inc.lng,
        originLat,
        originLng,
        timeToImpact: isDrone ? 20 : 12,
        status: "active" as const,
        rawText: "",
        threatType: isDrone ? "drone" as const : "missile" as const,
      };
    });
    setTimelineMissiles(syntheticAlerts);

    // Clear synthetic missiles after flight completes
    const maxFlight = syntheticAlerts.some((a) => a.threatType === "drone") ? 22_000 : 14_000;
    setTimeout(() => {
      setTimelineMissiles((prev) =>
        prev.filter((a) => !syntheticAlerts.some((s) => s.id === a.id))
      );
    }, maxFlight);

    // Check for US/Israel strikes on Iran → trigger A10 overlay with flyTo
    let hasA10 = false;
    for (const inc of geoIncidents) {
      const side = inc.side;
      if (
        (side === "us" || side === "israel" || side === "us_israel") &&
        inc.location?.toLowerCase().includes("iran")
      ) {
        // Fly to target first, then trigger A10 after arrival
        mapInstance?.flyTo({
          center: [inc.lng, inc.lat],
          zoom: 7,
          duration: 1200,
        });
        setTimeout(() => {
          setTimelineA10(inc);
          setTimeout(() => setTimelineA10(null), 5000);
        }, 800);
        hasA10 = true;
        break;
      }
    }

    // Fly to first new strike (if no A10 already flying there)
    if (!hasA10) {
      const first = geoIncidents[0];
      mapInstance?.flyTo({
        center: [first.lng, first.lat],
        zoom: 7,
        duration: 1200,
      });
    }
  }, [timelineIndex, timelineActive, timelinePlaying, allHours, hourToIncidents, mapInstance]);

  // Cleanup crosshairs and missiles when timeline is deactivated
  useEffect(() => {
    if (!timelineActive) {
      for (const m of crosshairMarkersRef.current) m.remove();
      crosshairMarkersRef.current = [];
      setTimelineMissiles([]);
    }
  }, [timelineActive]);

  const weapons = Array.from(
    new Set(timelineFilteredIncidents.map((i) => i.weapon).filter(Boolean))
  );

  // Filter alerts/sirens by selected countries for display (map overlays use unfiltered)
  const filteredAlerts = useMemo(() => {
    const ac = settings.alertCountries;
    if (!ac || ac === "all") return alerts;
    // Tzofar alerts are always Israel
    return ac.includes("Israel") ? alerts : [];
  }, [alerts, settings.alertCountries]);

  const filteredSirenAlerts = useMemo(() => {
    const ac = settings.alertCountries;
    if (!ac || ac === "all") return sirenAlertsWithJordan;
    return sirenAlertsWithJordan.filter((a) => ac.includes(a.country));
  }, [sirenAlertsWithJordan, settings.alertCountries]);

  const activeAlertCount = filteredAlerts.filter((a) => a.status === "active").length;

  const handleSelectIncident = useCallback((incident: Incident) => {
    setSelectedAlert(null);
    setSelectedBase(null);
    setSelectedIncident(incident);
  }, []);

  const handleAlertClick = useCallback((alert: MissileAlert) => {
    setSelectedIncident(null);
    setSelectedBase(null);
    setSelectedAlert(alert);
  }, []);

  const handleSelectBase = useCallback((base: MilitaryBase) => {
    setSelectedIncident(null);
    setSelectedAlert(null);
    setSelectedBase(base);
  }, []);

  const handleTimelineToggle = useCallback(() => {
    setTimelineActive((prev) => {
      if (prev) {
        setTimelinePlaying(false);
        setTimelineIndex(0);
        setTimelineSpeed(1);
      }
      return !prev;
    });
  }, []);

  const handleTimelinePlayPause = useCallback(() => {
    // Resume AudioContext from this user gesture so timeline sounds work
    if (settingsRef.current.soundEnabled) resumeAudio();
    setTimelinePlaying((prev) => {
      if (!prev && timelineIndex >= timelineSlots.length - 1) {
        setTimelineIndex(0);
      }
      return !prev;
    });
  }, [timelineIndex, timelineSlots.length]);

  const handleMapClick = useCallback(() => {
    setSelectedIncident(null);
    setSelectedAlert(null);
    setSelectedBase(null);
  }, []);
  const handleRangeWeaponClear = useCallback(() => setRangeWeapon(null), []);
  const handleToggleBases = useCallback(() => setShowBases((p) => !p), []);
  const handleToggleProxies = useCallback(() => setShowProxies((p) => !p), []);
  const handleToggleFirms = useCallback(() => setShowFirms((p) => !p), []);
  const handleToggleCountries = useCallback(() => setShowCountries((p) => !p), []);
  const handleMapStyleChange = useCallback((id: string) => {
    setStoredStyle(id);
    setMapStyle(id);
  }, []);

  const handleSettingsChange = useCallback((next: UserSettings) => {
    setSettings(next);
    saveSettings(next);
    settingsRef.current = next;
  }, []);

  const handleToggleSettings = useCallback(() => {
    setSettingsOpen((prev) => !prev);
  }, []);

  const handleToggleSound = useCallback(() => {
    setSettings((prev) => {
      const next = { ...prev, soundEnabled: !prev.soundEnabled };
      saveSettings(next);
      settingsRef.current = next;
      // Unlock AudioContext from this user gesture
      if (next.soundEnabled) resumeAudio();
      return next;
    });
  }, []);

  const handleVolumeChange = useCallback((v: number) => {
    setAudioVolume(v);
    setSettings((prev) => {
      const next = { ...prev, volume: v };
      saveSettings(next);
      settingsRef.current = next;
      return next;
    });
  }, []);

  const handleToggleNotifications = useCallback(() => {
    setSettings((prev) => {
      const next = { ...prev, notificationsEnabled: !prev.notificationsEnabled };
      saveSettings(next);
      settingsRef.current = next;
      return next;
    });
  }, []);

  // Widget handlers
  const handleAddWidget = useCallback((id: string) => {
    setActiveWidgets((prev) => {
      if (prev.includes(id)) return prev;
      const next = [...prev, id];
      setSettings((s) => {
        const ns = { ...s, activeWidgets: next };
        saveSettings(ns);
        settingsRef.current = ns;
        return ns;
      });
      return next;
    });
  }, []);

  const handleRemoveWidget = useCallback((id: string) => {
    setActiveWidgets((prev) => {
      const next = prev.filter((w) => w !== id);
      setSettings((s) => {
        const ns = { ...s, activeWidgets: next };
        saveSettings(ns);
        settingsRef.current = ns;
        return ns;
      });
      return next;
    });
  }, []);

  const handleWidgetPositionChange = useCallback((id: string, pos: { x: number; y: number }) => {
    setWidgetPositions((prev) => {
      const next = { ...prev, [id]: { ...prev[id], x: pos.x, y: pos.y } };
      setSettings((s) => {
        const ns = { ...s, widgetPositions: next };
        saveSettings(ns);
        settingsRef.current = ns;
        return ns;
      });
      return next;
    });
  }, []);

  const handleWidgetResize = useCallback((id: string, w: number, h?: number) => {
    setWidgetPositions((prev) => {
      const next = { ...prev, [id]: { ...prev[id], x: prev[id]?.x ?? 0, y: prev[id]?.y ?? 0, w, ...(h !== undefined ? { h } : {}) } };
      setSettings((s) => {
        const ns = { ...s, widgetPositions: next };
        saveSettings(ns);
        settingsRef.current = ns;
        return ns;
      });
      return next;
    });
  }, []);

  const handleWidgetFocus = useCallback((id: string) => {
    setWidgetZStack((prev) => {
      const filtered = prev.filter((w) => w !== id);
      return [...filtered, id];
    });
  }, []);

  const handleResetWidgets = useCallback(() => {
    setActiveWidgets(DEFAULT_ACTIVE_WIDGETS);
    setWidgetPositions({});
    setWidgetZStack([]);
    setWidgetPickerOpen(false);
    setSettings((s) => {
      const ns = { ...s, activeWidgets: DEFAULT_ACTIVE_WIDGETS, widgetPositions: {} };
      saveSettings(ns);
      settingsRef.current = ns;
      return ns;
    });
  }, []);

  const handleToggleWidgetPicker = useCallback(() => {
    setWidgetPickerOpen((p) => !p);
  }, []);

  const handleDuplicateWidget = useCallback((baseId: string) => {
    setActiveWidgets((prev) => {
      // Find max instance number for this base widget
      let maxNum = 0;
      for (const wid of prev) {
        if (wid === baseId) continue; // base instance (no suffix)
        if (wid.startsWith(baseId + ":")) {
          const num = parseInt(wid.slice(baseId.length + 1), 10);
          if (num > maxNum) maxNum = num;
        }
      }
      const newId = `${baseId}:${maxNum + 1}`;
      const next = [...prev, newId];
      // Set staggered default position
      const def = WIDGET_MAP[baseId];
      if (def) {
        const instanceCount = prev.filter((w) => getBaseWidgetId(w) === baseId).length;
        const offset = instanceCount * 32;
        setWidgetPositions((pp) => {
          const np = { ...pp, [newId]: { x: def.defaultPosition.x + offset, y: def.defaultPosition.y + offset } };
          setSettings((s) => {
            const ns = { ...s, activeWidgets: next, widgetPositions: np };
            saveSettings(ns);
            settingsRef.current = ns;
            return ns;
          });
          return np;
        });
      } else {
        setSettings((s) => {
          const ns = { ...s, activeWidgets: next };
          saveSettings(ns);
          settingsRef.current = ns;
          return ns;
        });
      }
      return next;
    });
  }, []);

  const renderWidgetContent = useCallback((widgetId: string) => {
    switch (getBaseWidgetId(widgetId)) {
      case "escalation":
        return <EscalationMeter incidents={incidents} notams={notams} />;
      case "currentcam":
        return <CurrentCam />;
      case "airspace":
        return <AirspaceStatus />;
      case "accuracy-iran":
        return <AccuracyGauge incidents={incidents} side="iran" />;
      case "accuracy-us":
        return <AccuracyGauge incidents={incidents} side="us_israel" />;
      case "casualties":
        return <CasualtyTracker />;
      case "clock":
        return <ConflictClock incidents={incidents} lastIranStrikeAt={lastIranStrikeAt} lastUSStrikeAt={lastUSStrikeAt} lastIsraelStrikeAt={lastIsraelStrikeAt} />;
      case "strike-counter":
        return <StrikeCounter incidents={incidents} />;
      case "cyber-status":
        return <CyberStatus />;
      case "feed":
        return <FeedSidebar incidents={incidents} onSelectIncident={handleSelectIncident} />;
      default:
        return null;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incidents, notams, lastIranStrikeAt, lastUSStrikeAt, lastIsraelStrikeAt]);

  const mapStyleUrl = MAP_STYLES.find((s) => s.id === mapStyle)?.url;

  const { handleShare, copied: shareCopied } = useShare({
    mapInstance,
    viewMode,
    selectedIncidentId: selectedIncident?.id,
  });

  return (
    <div className="h-screen w-screen overflow-hidden">
      <StrikeFlash key={flashKeyTotal} active={flashActive} />
      <SirenBanner alerts={filteredSirenAlerts} israelRegions={activeIsraelRegions} />
      <InterceptionBanner outcomes={outcomes} />
      <Header
        incidents={incidents}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        activeAlertCount={activeAlertCount}
        timelineActive={timelineActive}
        onTimelineToggle={handleTimelineToggle}
        settingsOpen={settingsOpen}
        onToggleSettings={handleToggleSettings}
        soundEnabled={settings.soundEnabled}
        onToggleSound={handleToggleSound}
        volume={settings.volume ?? 80}
        onVolumeChange={handleVolumeChange}
        notificationsEnabled={settings.notificationsEnabled}
        onToggleNotifications={handleToggleNotifications}
        chatOpen={chatOpen}
        onToggleChat={() => { if (chatOpen && chatTab === "chat") { setChatOpen(false); } else { setChatTab("chat"); setChatOpen(true); } }}
        onToggleSuggestions={() => { if (chatOpen && chatTab === "suggestions") { setChatOpen(false); } else { setChatTab("suggestions"); setChatOpen(true); } }}
        onToggleChanges={() => { if (chatOpen && chatTab === "changes") { setChatOpen(false); } else { setChatTab("changes"); setChatOpen(true); } }}
        hasUnreadChat={hasUnreadChat}
        activeUsers={activeUsers}
        onToggleWidgetPicker={handleToggleWidgetPicker}
        widgetPickerOpen={widgetPickerOpen}
        activeWidgets={activeWidgets}
        onAddWidget={handleAddWidget}
        onRemoveWidget={handleRemoveWidget}
        onResetWidgets={handleResetWidgets}
      />

      <NewsTicker incidents={incidents} customText={tickerText} briefingHeadlines={briefingHeadlines} />

      {settingsOpen && (
        <SettingsPanel settings={settings} onChange={handleSettingsChange} />
      )}

      {/* Announcement banner */}
      {announcement && announcementDismissed !== announcement && (
        <div className="fixed top-[88px] left-1/2 -translate-x-1/2 z-[43] w-[calc(100%-2rem)] max-w-xl pointer-events-auto">
          <div className="bg-[#1a1a1a] border border-red-500/50 rounded-lg px-4 py-3 flex items-start gap-3 shadow-[0_4px_20px_rgba(239,68,68,0.15)]">
            <span className="text-red-400 text-base mt-px shrink-0">!</span>
            <p className="text-sm text-neutral-200 leading-relaxed flex-1">{announcement}</p>
            <button
              onClick={() => {
                setAnnouncementDismissed(announcement);
                sessionStorage.setItem("strikemap-announcement-dismissed", announcement!);
              }}
              className="text-neutral-500 hover:text-neutral-300 text-xs font-medium whitespace-nowrap transition-colors mt-0.5"
            >
              dismiss
            </button>
          </div>
        </div>
      )}

      {/* Info banner */}
      {!disclaimerAccepted && (
        <div className={`fixed ${announcement && announcementDismissed !== announcement ? "top-[140px]" : "top-[88px]"} left-1/2 -translate-x-1/2 z-[42] w-[calc(100%-2rem)] max-w-xl transition-all`}>
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-4 py-3 flex items-start gap-3 shadow-lg">
            <p className="text-xs text-neutral-400 leading-relaxed flex-1">
              All data is aggregated from publicly available OSINT sources and presented for informational purposes only. Content does not reflect the views of the site operator. Use at your own discretion.
            </p>
            <button
              onClick={() => {
                sessionStorage.setItem("strikemap-disclaimer", "1");
                setDisclaimerAccepted(true);
              }}
              className="text-xs text-neutral-500 hover:text-neutral-300 font-medium whitespace-nowrap transition-colors"
            >
              Got it
            </button>
          </div>
        </div>
      )}

      {/* Main content */}
      <main className="h-full w-full pt-[5.25rem] relative">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
              <span
                className="text-neutral-500 text-sm tracking-wider"
                style={{ fontFamily: "JetBrains Mono, monospace" }}
              >
                LOADING STRIKE DATA...
              </span>
            </div>
          </div>
        ) : (
          <>
            <div className="relative w-full h-full">
              <MapView
                incidents={mapIncidents}
                onSelectIncident={handleSelectIncident}
                selectedIncident={selectedIncident}
                onMapReady={setMapInstance}
                timelineActive={timelineActive}
                showBases={showBases}
                showProxies={showProxies}
                showFirms={firmsEnabled}
                firmsGeoJSON={firmsGeoJSON}
                rangeWeapon={rangeWeapon}
                onRangeWeaponClear={handleRangeWeaponClear}
                initialCenter={initialCenter}
                initialZoom={initialZoom}
                onMapClick={handleMapClick}
                onSelectBase={handleSelectBase}
                mapStyleUrl={mapStyleUrl}
                markerSize={settings.markerSize}
                markerOpacity={settings.markerOpacity}
                flashCountry={flashCountryName}
                sirenCountries={sirenCountryList}
                showCountries={showCountries}
              />
              {selectedIncident && mapInstance && (
                <IncidentCard
                  incident={selectedIncident}
                  map={mapInstance}
                  onClose={() => setSelectedIncident(null)}
                />
              )}
              {selectedBase && mapInstance && (
                <BaseCard
                  base={selectedBase}
                  map={mapInstance}
                  onClose={() => setSelectedBase(null)}
                />
              )}
            </div>
            <MapOverlayControls
              showBases={showBases}
              onToggleBases={handleToggleBases}
              showProxies={showProxies}
              onToggleProxies={handleToggleProxies}
              showFirms={showFirms}
              onToggleFirms={handleToggleFirms}
              showCountries={showCountries}
              onToggleCountries={handleToggleCountries}
              firmsCount={firmsCounts.total}
              mapStyle={mapStyle}
              onMapStyleChange={handleMapStyleChange}
              onOpenChat={() => { setChatTab("chat"); setChatOpen(true); }}
              hasUnreadChat={hasUnreadChat}
            />
            {mapInstance && (alerts.length > 0 || testAlerts.length > 0 || timelineMissiles.length > 0) && (
              <MissileOverlay
                alerts={[...alerts, ...testAlerts, ...timelineMissiles]}
                map={mapInstance}
                onAlertClick={handleAlertClick}
                soundEnabled={settings.soundEnabled}
              />
            )}
            {mapInstance && (a10Trigger || timelineA10) && (
              <A10Overlay
                incident={(a10Trigger || timelineA10)!}
                map={mapInstance}
                soundEnabled={settings.soundEnabled}
              />
            )}
            {timelineActive && (
              <Timeline
                allSlots={timelineSlots}
                currentIndex={timelineIndex}
                totalIncidents={filteredIncidents.length}
                visibleCount={timelineFilteredIncidents.length}
                isPlaying={timelinePlaying}
                speed={timelineSpeed}
                onIndexChange={setTimelineIndex}
                onPlayPause={handleTimelinePlayPause}
                onSpeedChange={setTimelineSpeed}
                onClose={handleTimelineToggle}
              />
            )}
          </>
        )}
      </main>

      {/* Left column — Satellite panel when in satellite mode, gauges otherwise */}
      {isMapView(viewMode) && viewMode === "satellite" && (
        <SatellitePanel
          counts={firmsCounts}
          loading={firmsGeoJSON === null && firmsEnabled}
          onClose={() => setViewMode("all")}
        />
      )}
      {/* Floating widgets — desktop only */}
      {isMapView(viewMode) && viewMode !== "satellite" && activeWidgets.map((widgetId) => {
        const baseId = getBaseWidgetId(widgetId);
        const def = WIDGET_MAP[baseId];
        if (!def) return null;
        const saved = widgetPositions[widgetId];
        let pos = saved ? { x: saved.x, y: saved.y } : def.defaultPosition;
        // anchorRight: default position.x is offset from right edge
        if (!saved && def.anchorRight && typeof window !== "undefined") {
          pos = { x: window.innerWidth - def.defaultWidth - def.defaultPosition.x, y: def.defaultPosition.y };
        }
        const w = saved?.w ?? def.defaultWidth;
        const h = saved?.h ?? def.defaultHeight;
        const zIdx = 40 + (widgetZStack.indexOf(widgetId) >= 0 ? widgetZStack.indexOf(widgetId) : 0);
        return (
          <FloatingWidget
            key={widgetId}
            id={widgetId}
            title={def.label}
            position={pos}
            width={w}
            height={h}
            onPositionChange={handleWidgetPositionChange}
            onClose={handleRemoveWidget}
            onResize={def.resizable ? handleWidgetResize : undefined}
            onFocus={handleWidgetFocus}
            onDuplicate={def.multiInstance ? () => handleDuplicateWidget(baseId) : undefined}
            zIndex={zIdx}
            resizable={def.resizable}
            minWidth={def.minWidth}
            maxWidth={def.maxWidth}
            minHeight={def.minHeight}
            maxHeight={def.maxHeight}
          >
            {renderWidgetContent(widgetId)}
          </FloatingWidget>
        );
      })}

      {/* Government speech livestream */}
      {isMapView(viewMode) && speechConfig?.enabled && speechConfig.id && (
        <SpeechPanel videoId={speechConfig.id} title={speechConfig.title} />
      )}

      {/* Mobile panels — controlled by bottom tab bar */}
      {mobileTab === "feed" && <MobileFeedPanel onClose={() => setMobileTab("map")} />}
      {mobileTab === "stats" && (
        <MobileStatsPanel
          incidents={incidents}
          notams={notams}
          lastIranStrikeAt={lastIranStrikeAt}
          lastUSStrikeAt={lastUSStrikeAt}
          lastIsraelStrikeAt={lastIsraelStrikeAt}
          onClose={() => setMobileTab("map")}
        />
      )}
      {mobileTab === "alerts" && (
        <div className="fixed inset-0 top-14 bottom-14 z-40 md:hidden bg-[#0a0a0a] overflow-y-auto">
          <div className="p-4 space-y-3">
            <div className="flex items-center justify-between mb-1">
              <h2
                className="text-[10px] font-bold uppercase tracking-wider text-neutral-500"
                style={{ fontFamily: "JetBrains Mono, monospace" }}
              >
                Active Alerts
              </h2>
              <button
                onClick={() => setMobileTab("map")}
                className="text-neutral-500 hover:text-neutral-300 p-1.5 -mr-1.5 transition-colors"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            {/* Country filter dropdown */}
            <div className="relative">
              <select
                value={(() => {
                  const ac = settings.alertCountries;
                  if (!ac || ac === "all") return "all";
                  return (ac as string[]).join(",");
                })()}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === "all") {
                    handleSettingsChange({ ...settings, alertCountries: "all" });
                  } else {
                    handleSettingsChange({ ...settings, alertCountries: [val] });
                  }
                }}
                className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-3 py-2.5 text-sm text-neutral-300 font-semibold uppercase tracking-wider appearance-none cursor-pointer focus:outline-none focus:border-red-500/50 pr-8"
                style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "16px" }}
              >
                <option value="all">All Countries</option>
                {ALERT_FILTER_COUNTRIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <svg className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500 pointer-events-none" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
              </svg>
            </div>
            {filteredAlerts.length === 0 && filteredSirenAlerts.length === 0 ? (
              <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-6 text-center">
                <p className="text-neutral-500 text-sm">No active alerts</p>
              </div>
            ) : (
              <>
                {filteredAlerts.filter((a) => a.status === "active").map((alert) => (
                  <button
                    key={alert.id}
                    onClick={() => {
                      setMobileTab("map");
                      handleAlertClick(alert);
                    }}
                    className="w-full bg-[#1a1a1a] border border-red-500/30 rounded-lg p-4 text-left active:bg-[#222]"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                      <span className="text-sm font-bold text-red-400 uppercase">
                        {alert.regions?.length > 0 ? alert.regions.join(", ") : alert.cities.slice(0, 3).join(", ")}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 font-bold uppercase ml-auto">
                        {alert.threatType || "missile"}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-neutral-500">
                      <span>TTI: {alert.timeToImpact}s</span>
                      <span>{alert.timestamp}</span>
                    </div>
                  </button>
                ))}
                {filteredSirenAlerts.map((alert) => (
                  <div
                    key={alert.id}
                    className="bg-[#1a1a1a] border border-orange-500/30 rounded-lg p-4"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
                      <span className="text-sm font-bold text-orange-400 uppercase">
                        {alert.country} — Sirens
                      </span>
                    </div>
                    <span className="text-[10px] text-neutral-600 mt-1 block">
                      via {alert.sourceChannel} &bull; {new Date(alert.activatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      )}
      {mobileTab === "menu" && (
        <div className="fixed inset-0 top-14 bottom-14 z-40 md:hidden bg-[#0a0a0a] overflow-y-auto">
          <div className="p-4 space-y-2">
            <div className="flex items-center justify-between mb-3">
              <h2
                className="text-[10px] font-bold uppercase tracking-wider text-neutral-500"
                style={{ fontFamily: "JetBrains Mono, monospace" }}
              >
                Navigation
              </h2>
              <button
                onClick={() => setMobileTab("map")}
                className="text-neutral-500 hover:text-neutral-300 p-1.5 -mr-1.5 transition-colors"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            {[
              { href: "/", label: "Strike Map" },
              { href: "/leadership", label: "Leadership" },
              { href: "/stats", label: "Statistics" },
              { href: "/airspace", label: "Airspace" },
              { href: "/heatmap", label: "Heatmap" },
              { href: "/weapons", label: "Weapons" },
              { href: "/killchain", label: "Kill Chain" },
            ].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="block w-full text-left px-4 py-3 rounded-lg bg-[#1a1a1a] border border-[#2a2a2a] text-sm font-medium text-white active:bg-[#222] transition-colors"
                style={{ fontFamily: "JetBrains Mono, monospace" }}
              >
                {item.label}
              </Link>
            ))}
            <div className="h-px bg-[#2a2a2a] my-2" />
            <a
              href="https://t.me/strikemap"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-3 rounded-lg bg-[#1a1a1a] border border-[#2a2a2a] text-sm font-medium text-white active:bg-[#222] transition-colors"
              style={{ fontFamily: "JetBrains Mono, monospace" }}
            >
              <svg className="w-5 h-5 text-[#29B6F6]" viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
              Join Telegram
            </a>
          </div>
        </div>
      )}


      {/* Alert detail panel */}
      {selectedAlert && (
        <div className="fixed bottom-0 left-0 right-0 z-50 panel-enter pointer-events-none">
          <div className="relative bg-[#1a1a1a] border-t border-red-500/50 rounded-t-2xl max-h-[50vh] overflow-y-auto pointer-events-auto shadow-[0_-8px_30px_rgba(239,68,68,0.2)]">
            <div className="sticky top-0 bg-[#1a1a1a] pt-3 pb-2 px-6 flex items-center justify-between border-b border-[#2a2a2a]/50 rounded-t-2xl z-10">
              <div className="w-10 h-1 bg-red-500/50 rounded-full mx-auto absolute left-1/2 -translate-x-1/2 top-2" />
              <div className="flex items-center gap-2 mt-2">
                <span className="text-red-400 text-xs font-semibold uppercase tracking-wider animate-pulse">
                  INCOMING HOSTILE MISSILES
                </span>
              </div>
              <button
                onClick={() => setSelectedAlert(null)}
                className="text-neutral-500 hover:text-neutral-300 mt-2 text-lg"
              >
                ✕
              </button>
            </div>

            <div className="px-6 py-4 space-y-3">
              <h2 className="text-lg font-semibold text-red-300">
                {selectedAlert.regions.length > 0
                  ? selectedAlert.regions.join(", ")
                  : selectedAlert.cities.slice(0, 5).join(", ")}
              </h2>
              <div className="flex items-center gap-3 text-sm text-neutral-400">
                <span>Time: {selectedAlert.timestamp}</span>
                <span className="text-neutral-600">|</span>
                <span>Shelter in: {selectedAlert.timeToImpact}s</span>
              </div>
              {selectedAlert.cities.length > 0 && (
                <div>
                  <p className="text-xs text-neutral-500 uppercase tracking-wider mb-1">
                    Affected areas
                  </p>
                  <p className="text-sm text-neutral-300">
                    {selectedAlert.cities.slice(0, 15).join(", ")}
                    {selectedAlert.cities.length > 15 && ` +${selectedAlert.cities.length - 15} more`}
                  </p>
                </div>
              )}
              <p className="text-xs text-neutral-500 italic">
                Source: Tzeva Adom / Home Front Command
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Live chat */}
      <ChatPanel open={chatOpen} onClose={() => setChatOpen(false)} defaultTab={chatTab} />

      {/* Live video panel */}
      <LiveVideoPanel open={liveVideoOpen} onToggle={() => setLiveVideoOpen((p) => !p)} hideTrigger={chatOpen} />

      {/* Mobile chat FAB — next to Live button */}
      {!chatOpen && !liveVideoOpen && (
        <button
          onClick={() => { setChatTab("chat"); setChatOpen(true); }}
          className="fixed z-[9999] md:hidden flex items-center gap-1.5 px-4 py-2.5 rounded-full border bg-[#1a1a1a] border-blue-500/40 text-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.2)] hover:shadow-[0_0_25px_rgba(59,130,246,0.35)] hover:bg-blue-500/10 backdrop-blur-sm transition-all"
          style={{ bottom: "5rem", left: "calc(50% + 52px)", fontFamily: "JetBrains Mono, monospace" }}
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></svg>
          <span className="text-xs font-bold uppercase tracking-wider">Chat</span>
          {hasUnreadChat && (
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse" />
          )}
        </button>
      )}

      {/* Mobile bottom tab bar */}
      <MobileTabBar
        activeTab={mobileTab}
        onTabChange={setMobileTab}
        alertCount={activeAlertCount + filteredSirenAlerts.length}
      />

      {/* Animation test panel (Ctrl+Shift+D) — dev only */}
      {process.env.NODE_ENV === "development" && debugPanel && (
        <AnimationTestPanel
          onTriggerA10={(inc) => {
            setA10Trigger(inc);
            setTimeout(() => setA10Trigger(null), 5000);
          }}
          onFlashCountry={(country) => {
            setFlashCountryName(country);
            setTimeout(() => setFlashCountryName(null), 4000);
          }}
          onInjectAlert={(alert) => {
            setTestAlerts((prev) => [...prev, alert]);
          }}
          onClearAlerts={() => setTestAlerts([])}
          onToggleSiren={(country) => {
            setTestSirenCountries((prev) =>
              prev.includes(country) ? prev.filter((c) => c !== country) : [...prev, country]
            );
          }}
          activeSirenCountries={sirenCountryList}
        />
      )}
    </div>
  );
}
