"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import dynamic from "next/dynamic";
import Header from "@/components/Header";
import IncidentCard from "@/components/IncidentCard";
import Legend from "@/components/Legend";
import AccuracyGauge from "@/components/AccuracyGauge";
import FeedSidebar from "@/components/FeedSidebar";
import { Incident, MissileAlert, NOTAM, ViewMode } from "@/lib/types";
import { fetchAlerts } from "@/lib/fetchAlerts";
import { playAlertSound, playImpactSound } from "@/lib/sounds";
import MissileOverlay from "@/components/MissileOverlay";
import StrikeFlash from "@/components/StrikeFlash";
import MapOverlayControls from "@/components/MapOverlayControls";
import InterceptGauge from "@/components/InterceptGauge";
import CasualtyTracker from "@/components/CasualtyTracker";
import ConflictClock from "@/components/ConflictClock";
import EscalationMeter from "@/components/EscalationMeter";
import LiveFeedMobile, { LiveFeedDesktop } from "@/components/LiveFeedPlayer";
import { MAP_STYLES, getStoredStyle, setStoredStyle } from "@/lib/mapStyles";
import { UserSettings, loadSettings, saveSettings } from "@/lib/settings";
import SettingsPanel from "@/components/SettingsPanel";
import ChatPanel from "@/components/ChatPanel";
import AirspaceStatus from "@/components/AirspaceStatus";
import Timeline from "@/components/Timeline";
import { useTimeline } from "@/hooks/useTimeline";
import { useShare } from "@/components/ShareButton";
import { useNotifications } from "@/hooks/useNotifications";
import { decodeState } from "@/lib/urlState";
import mapboxgl from "mapbox-gl";

const MapView = dynamic(() => import("@/components/Map"), { ssr: false });

const isMapView = (mode: ViewMode) =>
  !["leadership", "stats", "weapons", "killchain", "intercept", "airspace"].includes(mode);

// ViewMode is now only used for strike filtering on the map page
// Dashboard views (leadership, stats, etc.) live on their own routes

export default function Home() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("all");
  const [loading, setLoading] = useState(true);
  const [alerts, setAlerts] = useState<MissileAlert[]>([]);
  const [mapInstance, setMapInstance] = useState<mapboxgl.Map | null>(null);
  const [selectedAlert, setSelectedAlert] = useState<MissileAlert | null>(null);
  const [flashActive, setFlashActive] = useState(false);
  const flashKey = useRef(0);
  const [showBases, setShowBases] = useState(false);
  const [showProxies, setShowProxies] = useState(false);
  const [rangeWeapon, setRangeWeapon] = useState<{ lat: number; lng: number; radiusKm: number } | null>(null);
  const [mapStyle, setMapStyle] = useState("dark");
  const [settings, setSettings] = useState<UserSettings>(loadSettings);
  const [disclaimerAccepted, setDisclaimerAccepted] = useState(false);
  const [notams, setNotams] = useState<NOTAM[]>([]);

  // Check if disclaimer was already accepted this session
  useEffect(() => {
    if (typeof window !== "undefined" && sessionStorage.getItem("strikemap-disclaimer") === "1") {
      setDisclaimerAccepted(true);
    }
  }, []);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Timeline state
  const [timelineActive, setTimelineActive] = useState(false);
  const [timelineIndex, setTimelineIndex] = useState(0);
  const [timelinePlaying, setTimelinePlaying] = useState(false);
  const [timelineSpeed, setTimelineSpeed] = useState(1);

  // Notifications
  const { permission: notifPermission, requestPermission, sendNotification, supported: notifSupported } = useNotifications();
  const sendNotificationRef = useRef(sendNotification);
  sendNotificationRef.current = sendNotification;
  const mapRef = useRef(mapInstance);
  mapRef.current = mapInstance;

  // URL state restoration
  const pendingSelectedId = useRef<string | null>(null);
  const [initialCenter, setInitialCenter] = useState<[number, number] | undefined>();
  const [initialZoom, setInitialZoom] = useState<number | undefined>();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const state = decodeState(window.location.search);
    if (state.viewMode) setViewMode(state.viewMode);
    if (state.center) setInitialCenter(state.center);
    if (state.zoom != null) setInitialZoom(state.zoom);
    if (state.selectedId) pendingSelectedId.current = state.selectedId;
    // Restore saved map style
    const savedStyle = getStoredStyle();
    if (savedStyle !== "dark") setMapStyle(savedStyle);
  }, []);

  // Track seen IDs for sound triggers
  const seenAlertIds = useRef<Set<string>>(new Set());
  const seenIncidentIds = useRef<Set<string>>(new Set());
  const isFirstLoad = useRef(true);

  // Track real timestamps when new strikes are detected (not the date string)
  const [lastIranStrikeAt, setLastIranStrikeAt] = useState<number>(0);
  const [lastUSStrikeAt, setLastUSStrikeAt] = useState<number>(0);
  const [lastIsraelStrikeAt, setLastIsraelStrikeAt] = useState<number>(0);

  // Fetch all incidents from the persistent server-side store
  const loadData = useCallback(async () => {
    try {
      const res = await fetch("/api/incidents");
      const data = await res.json();
      const allData: Incident[] = data.incidents || [];

      if (isFirstLoad.current) {
        // Seed seen IDs on first load — no sounds
        for (const inc of allData) {
          if (inc.lat !== 0 && inc.lng !== 0) seenIncidentIds.current.add(inc.id);
        }
        isFirstLoad.current = false;
      } else {
        // Collect new strikes before marking as seen
        const newIncs = allData.filter(
          (inc: Incident) => inc.lat !== 0 && inc.lng !== 0 && !seenIncidentIds.current.has(inc.id)
        );
        for (const inc of newIncs) {
          seenIncidentIds.current.add(inc.id);
        }
        if (newIncs.length > 0) {
          // Record real timestamps for conflict clock
          const now = Date.now();
          if (newIncs.some((i) => i.side === "iran")) setLastIranStrikeAt(now);
          if (newIncs.some((i) => i.side === "us" || (i.side === "us_israel" && i.location?.includes("Iran")))) setLastUSStrikeAt(now);
          if (newIncs.some((i) => i.side === "israel" || (i.side === "us_israel" && !i.location?.includes("Iran")))) setLastIsraelStrikeAt(now);

          if (settingsRef.current.soundEnabled) playImpactSound();
          flashKey.current += 1;
          setFlashActive(true);
          setTimeout(() => setFlashActive(false), 600);

          // Fly to the new strike
          const first = newIncs[0];
          mapRef.current?.flyTo({
            center: [first.lng, first.lat],
            zoom: 7,
            duration: 1500,
          });

          // Push notification for new strikes
          if (settingsRef.current.notificationsEnabled) {
            sendNotificationRef.current("New Strike Detected", {
              body: `${first.weapon || "Strike"} at ${first.location} — ${first.description.slice(0, 100)}`,
              tag: `strike-${first.id}`,
            });
          }
        }
      }

      setIncidents(allData);

      // Resolve pending selected incident from URL state
      if (pendingSelectedId.current && allData.length > 0) {
        const found = allData.find((i: Incident) => i.id === pendingSelectedId.current);
        if (found) setSelectedIncident(found);
        pendingSelectedId.current = null;
      }
    } catch {
      // Keep whatever we already have
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();

    // Auto-refresh every 20 seconds for near-real-time updates
    const interval = setInterval(loadData, 20_000);
    return () => clearInterval(interval);
  }, [loadData]);

  // Polling for missile alerts (10 seconds)
  useEffect(() => {
    let firstPoll = true;
    const pollAlerts = async () => {
      const newAlerts = await fetchAlerts();

      // Play alert sound for genuinely new alerts (not on first poll)
      if (!firstPoll) {
        for (const alert of newAlerts) {
          if (!seenAlertIds.current.has(alert.id)) {
            if (settingsRef.current.soundEnabled) playAlertSound();
            flashKey.current += 1;
            setFlashActive(true);
            setTimeout(() => setFlashActive(false), 600);

            // Fly to the alert target
            if (alert.lat && alert.lng) {
              mapRef.current?.flyTo({
                center: [alert.lng, alert.lat],
                zoom: 7,
                duration: 1500,
              });
            }

            // Push notification for missile alerts
            if (settingsRef.current.notificationsEnabled) {
              sendNotificationRef.current("INCOMING HOSTILE MISSILES", {
                body: `Alert: ${alert.regions.join(", ") || alert.cities.slice(0, 3).join(", ")} — Shelter in ${alert.timeToImpact}s`,
                tag: `alert-${alert.id}`,
              });
            }
            break; // one sound per poll is enough
          }
        }
      }

      // Update seen set
      seenAlertIds.current = new Set(newAlerts.map((a) => a.id));
      firstPoll = false;

      setAlerts(newAlerts);
    };
    pollAlerts();
    const interval = setInterval(pollAlerts, 10_000);
    return () => clearInterval(interval);
  }, []);

  // Poll NOTAM / airspace data (every 5 minutes)
  useEffect(() => {
    const pollNotams = async () => {
      try {
        const res = await fetch("/api/notams");
        if (res.ok) {
          const json = await res.json();
          setNotams(json.notams || []);
        }
      } catch { /* keep existing data */ }
    };
    pollNotams();
    const interval = setInterval(pollNotams, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // Filter by view mode (stats/weapons/leadership show all data)
  const filteredIncidents = useMemo(() => {
    let result = viewMode === "all" || !isMapView(viewMode)
      ? incidents
      : viewMode === "us_israel"
        ? incidents.filter((i) => i.side === "us_israel" || i.side === "us" || i.side === "israel")
        : incidents.filter((i) => i.side === viewMode);
    // Apply date filter from settings
    if (settings.dateFrom) {
      result = result.filter((i) => i.date >= settings.dateFrom!);
    }
    return result;
  }, [viewMode, incidents, settings.dateFrom]);

  // Timeline: sorted unique dates from ALL incidents (stable range across side filters)
  const allDates = useMemo(() => {
    const dateSet = new Set(incidents.map((i) => i.date));
    return Array.from(dateSet).sort();
  }, [incidents]);

  // Apply timeline filter on top of side filter
  const timelineFilteredIncidents = useMemo(() => {
    if (!timelineActive || allDates.length === 0) return filteredIncidents;
    const cutoffDate = allDates[timelineIndex];
    return filteredIncidents.filter((i) => i.date <= cutoffDate);
  }, [timelineActive, timelineIndex, allDates, filteredIncidents]);

  // Auto-play hook
  useTimeline({
    totalSteps: allDates.length,
    currentIndex: timelineIndex,
    onIndexChange: setTimelineIndex,
    isPlaying: timelinePlaying,
    speed: timelineSpeed,
  });

  // Auto-pause at end
  useEffect(() => {
    if (timelineIndex >= allDates.length - 1 && timelinePlaying) {
      setTimelinePlaying(false);
    }
  }, [timelineIndex, allDates.length, timelinePlaying]);

  const weapons = Array.from(
    new Set(timelineFilteredIncidents.map((i) => i.weapon).filter(Boolean))
  );

  const activeAlertCount = alerts.filter((a) => a.status === "active").length;

  const handleSelectIncident = useCallback((incident: Incident) => {
    setSelectedAlert(null);
    setSelectedIncident(incident);
  }, []);

  const handleAlertClick = useCallback((alert: MissileAlert) => {
    setSelectedIncident(null);
    setSelectedAlert(alert);
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
    setTimelinePlaying((prev) => {
      if (!prev && timelineIndex >= allDates.length - 1) {
        setTimelineIndex(0);
      }
      return !prev;
    });
  }, [timelineIndex, allDates.length]);

  const handleMapClick = useCallback(() => {
    setSelectedIncident(null);
    setSelectedAlert(null);
  }, []);
  const handleRangeWeaponClear = useCallback(() => setRangeWeapon(null), []);
  const handleToggleBases = useCallback(() => setShowBases((p) => !p), []);
  const handleToggleProxies = useCallback(() => setShowProxies((p) => !p), []);
  const handleMapStyleChange = useCallback((id: string) => {
    setStoredStyle(id);
    setMapStyle(id);
  }, []);

  const settingsRef = useRef(settings);
  settingsRef.current = settings;

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

  const mapStyleUrl = MAP_STYLES.find((s) => s.id === mapStyle)?.url;

  // Shareable snapshots
  const { handleShare, copied: shareCopied } = useShare({
    mapInstance,
    viewMode,
    selectedIncidentId: selectedIncident?.id,
  });

  return (
    <div className="h-screen w-screen overflow-hidden">
      <StrikeFlash key={flashKey.current} active={flashActive} />
      <Header
        incidents={incidents}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        activeAlertCount={activeAlertCount}
        timelineActive={timelineActive}
        onTimelineToggle={handleTimelineToggle}
        onShare={handleShare}
        shareCopied={shareCopied}
        settingsOpen={settingsOpen}
        onToggleSettings={handleToggleSettings}
        soundEnabled={settings.soundEnabled}
        onToggleSound={handleToggleSound}
        notificationsEnabled={settings.notificationsEnabled}
        onToggleNotifications={handleToggleNotifications}
      />

      {settingsOpen && (
        <SettingsPanel settings={settings} onChange={handleSettingsChange} />
      )}

      {/* Info banner */}
      {!disclaimerAccepted && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-xl">
          <div className="bg-[#1a1a1a]/95 backdrop-blur-md border border-[#2a2a2a] rounded-lg px-4 py-3 flex items-start gap-3 shadow-lg">
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
      <main className="h-full w-full pt-14 relative z-0">
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
                incidents={timelineFilteredIncidents}
                onSelectIncident={handleSelectIncident}
                selectedIncident={selectedIncident}
                onMapReady={setMapInstance}
                timelineActive={timelineActive}
                showBases={showBases}
                showProxies={showProxies}
                rangeWeapon={rangeWeapon}
                onRangeWeaponClear={handleRangeWeaponClear}
                initialCenter={initialCenter}
                initialZoom={initialZoom}
                onMapClick={handleMapClick}
                mapStyleUrl={mapStyleUrl}
                markerSize={settings.markerSize}
                markerOpacity={settings.markerOpacity}
              />
              {selectedIncident && mapInstance && (
                <IncidentCard
                  incident={selectedIncident}
                  map={mapInstance}
                  onClose={() => setSelectedIncident(null)}
                />
              )}
            </div>
            <MapOverlayControls
              showBases={showBases}
              onToggleBases={handleToggleBases}
              showProxies={showProxies}
              onToggleProxies={handleToggleProxies}
              mapStyle={mapStyle}
              onMapStyleChange={handleMapStyleChange}
            />
            {mapInstance && alerts.length > 0 && (
              <MissileOverlay
                alerts={alerts}
                map={mapInstance}
                onAlertClick={handleAlertClick}
                soundEnabled={settings.soundEnabled}
              />
            )}
            {timelineActive && (
              <Timeline
                allDates={allDates}
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

      {/* Left column — Live Feed + gauges on map views */}
      {isMapView(viewMode) && (
        <div className="fixed top-16 bottom-4 left-4 z-40 hidden md:flex flex-col gap-3 overflow-y-auto scrollbar-hide w-52 isolate">
          <LiveFeedDesktop />
          {settings.showGauges && (
            <>
              <EscalationMeter incidents={incidents} notams={notams} />
              <AirspaceStatus />
              {(viewMode === "all" || viewMode === "iran") && (
                <AccuracyGauge incidents={incidents} side="iran" />
              )}
              {(viewMode === "all" || viewMode === "us_israel") && (
                <AccuracyGauge incidents={incidents} side="us_israel" />
              )}
              <InterceptGauge incidents={incidents} />
              <CasualtyTracker incidents={incidents} />
              <ConflictClock incidents={incidents} lastIranStrikeAt={lastIranStrikeAt} lastUSStrikeAt={lastUSStrikeAt} lastIsraelStrikeAt={lastIsraelStrikeAt} />
              {settings.showLegend && (
                <Legend weapons={weapons} timelineActive={timelineActive} />
              )}
            </>
          )}
        </div>
      )}

      {/* Legend standalone — when gauges are off but legend is on */}
      {isMapView(viewMode) && !settings.showGauges && settings.showLegend && (
        <div className={`fixed left-4 z-40 hidden md:flex flex-col gap-3 transition-[bottom] duration-300 ${timelineActive ? "bottom-40" : "bottom-4"}`}>
          <ConflictClock incidents={incidents} lastIranStrikeAt={lastIranStrikeAt} lastUSStrikeAt={lastUSStrikeAt} lastIsraelStrikeAt={lastIsraelStrikeAt} />
          <Legend weapons={weapons} timelineActive={timelineActive} />
        </div>
      )}

      {/* Mobile Live Feed button — visible on map views */}
      {isMapView(viewMode) && <LiveFeedMobile />}

      {/* Feed sidebar — only on map views */}
      {isMapView(viewMode) && settings.showFeed && (
        <FeedSidebar
          incidents={incidents}
          onSelectIncident={handleSelectIncident}
        />
      )}

      {/* Detail card is rendered inside the map container above */}

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
      <ChatPanel />
    </div>
  );
}
