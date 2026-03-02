"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import dynamic from "next/dynamic";
import Header from "@/components/Header";
import IncidentCard from "@/components/IncidentCard";
import Legend from "@/components/Legend";
import AccuracyGauge from "@/components/AccuracyGauge";
import FeedSidebar from "@/components/FeedSidebar";
import { Incident, MissileAlert, ViewMode } from "@/lib/types";
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
import SpeechPanel from "@/components/SpeechPanel";
import Timeline from "@/components/Timeline";
import { useTimeline } from "@/hooks/useTimeline";
import { useShare } from "@/components/ShareButton";
import { useNotifications } from "@/hooks/useNotifications";
import { useIncidentPolling } from "@/hooks/useIncidentPolling";
import { useAlertPolling } from "@/hooks/useAlertPolling";
import { useNotamPolling } from "@/hooks/useNotamPolling";
import { useSirenPolling } from "@/hooks/useSirenPolling";
import SirenBanner from "@/components/SirenBanner";
import { decodeState } from "@/lib/urlState";
import mapboxgl from "mapbox-gl";

const MapView = dynamic(() => import("@/components/Map"), { ssr: false });

const isMapView = (mode: ViewMode) =>
  !["leadership", "stats", "weapons", "killchain", "intercept", "airspace"].includes(mode);

export default function Home() {
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("all");
  const [mapInstance, setMapInstance] = useState<mapboxgl.Map | null>(null);
  const [selectedAlert, setSelectedAlert] = useState<MissileAlert | null>(null);
  const [showBases, setShowBases] = useState(false);
  const [showProxies, setShowProxies] = useState(false);
  const [rangeWeapon, setRangeWeapon] = useState<{ lat: number; lng: number; radiusKm: number } | null>(null);
  const [mapStyle, setMapStyle] = useState("dark");
  const [settings, setSettings] = useState<UserSettings>(loadSettings);
  const [disclaimerAccepted, setDisclaimerAccepted] = useState(false);
  const [speechConfig, setSpeechConfig] = useState<{ id: string; title: string; enabled: boolean } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Timeline state
  const [timelineActive, setTimelineActive] = useState(false);
  const [timelineIndex, setTimelineIndex] = useState(0);
  const [timelinePlaying, setTimelinePlaying] = useState(false);
  const [timelineSpeed, setTimelineSpeed] = useState(1);

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
      // Auto-select the first new strike so the incident card appears
      if (newIncs.length > 0) setSelectedIncident(newIncs[0]);
    },
  });

  const {
    alerts,
    flashActive: alertFlashActive,
    flashKey: alertFlashKey,
  } = useAlertPolling({
    soundEnabled: settingsRef.current.soundEnabled,
    notificationsEnabled: settingsRef.current.notificationsEnabled,
    sendNotification: sendNotificationRef.current,
    mapInstance,
  });

  const notams = useNotamPolling();

  const { sirenAlerts } = useSirenPolling({
    soundEnabled: settingsRef.current.soundEnabled,
    notificationsEnabled: settingsRef.current.notificationsEnabled,
    sendNotification: sendNotificationRef.current,
  });

  const flashActive = incidentFlashActive || alertFlashActive;
  const flashKeyTotal = incidentFlashKey + alertFlashKey;

  // Resolve pending selected incident from URL state
  useEffect(() => {
    if (pendingSelectedId.current && incidents.length > 0) {
      const found = incidents.find((i: Incident) => i.id === pendingSelectedId.current);
      if (found) setSelectedIncident(found);
      pendingSelectedId.current = null;
    }
  }, [incidents]);

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

  // Timeline: sorted unique dates from ALL incidents
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

  // Only pass incidents with valid coordinates to the map (skip ~58% that have none)
  const mapIncidents = useMemo(
    () => timelineFilteredIncidents.filter((i) => i.lat !== 0 && i.lng !== 0),
    [timelineFilteredIncidents]
  );

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

  const { handleShare, copied: shareCopied } = useShare({
    mapInstance,
    viewMode,
    selectedIncidentId: selectedIncident?.id,
  });

  return (
    <div className="h-screen w-screen overflow-hidden">
      <StrikeFlash key={flashKeyTotal} active={flashActive} />
      <SirenBanner alerts={sirenAlerts} />
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
                incidents={mapIncidents}
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
        <div className="fixed top-16 bottom-4 left-4 z-40 hidden md:flex flex-col gap-3 overflow-y-auto overflow-x-hidden scrollbar-hide w-60 isolate">
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
            </>
          )}
        </div>
      )}

      {/* Conflict clock standalone — when gauges are off */}
      {isMapView(viewMode) && !settings.showGauges && (
        <div className="fixed left-4 bottom-4 z-40 hidden md:flex flex-col gap-3">
          <ConflictClock incidents={incidents} lastIranStrikeAt={lastIranStrikeAt} lastUSStrikeAt={lastUSStrikeAt} lastIsraelStrikeAt={lastIsraelStrikeAt} />
        </div>
      )}

      {/* Government speech livestream */}
      {isMapView(viewMode) && speechConfig?.enabled && speechConfig.id && (
        <SpeechPanel videoId={speechConfig.id} title={speechConfig.title} />
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
