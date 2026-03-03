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
import MobileTabBar, { type MobileTab } from "@/components/MobileTabBar";
import MobileStatsPanel from "@/components/MobileStatsPanel";
import MobileFeedPanel from "@/components/MobileFeedPanel";
import Link from "next/link";
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
  const [showFirms, setShowFirms] = useState(false);
  const [rangeWeapon, setRangeWeapon] = useState<{ lat: number; lng: number; radiusKm: number } | null>(null);
  const [mapStyle, setMapStyle] = useState("dark");
  const [settings, setSettings] = useState<UserSettings>(loadSettings);
  const [disclaimerAccepted, setDisclaimerAccepted] = useState(false);
  const [speechConfig, setSpeechConfig] = useState<{ id: string; title: string; enabled: boolean } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [announcement, setAnnouncement] = useState<string | null>(null);
  const [announcementDismissed, setAnnouncementDismissed] = useState<string | null>(() => {
    if (typeof window !== "undefined") return sessionStorage.getItem("strikemap-announcement-dismissed");
    return null;
  });
  const [mobileTab, setMobileTab] = useState<MobileTab>("map");
  const [chatOpen, setChatOpen] = useState(false);
  const [chatTab, setChatTab] = useState<ChatTab>("chat");
  const [hasUnreadChat, setHasUnreadChat] = useState(false);
  const chatMsgCountRef = useRef(0);
  const [activeUsers, setActiveUsers] = useState(0);

  // Timeline state
  const [timelineActive, setTimelineActive] = useState(false);
  const [timelineIndex, setTimelineIndex] = useState(0);
  const [timelinePlaying, setTimelinePlaying] = useState(false);
  const [timelineSpeed, setTimelineSpeed] = useState(1);

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

  const firmsEnabled = showFirms || viewMode === "satellite";
  const { geojson: firmsGeoJSON, counts: firmsCounts } = useFIRMSPolling(firmsEnabled);

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
  const handleToggleFirms = useCallback(() => setShowFirms((p) => !p), []);
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
        chatOpen={chatOpen}
        onToggleChat={() => { if (chatOpen && chatTab === "chat") { setChatOpen(false); } else { setChatTab("chat"); setChatOpen(true); } }}
        onToggleSuggestions={() => { if (chatOpen && chatTab === "suggestions") { setChatOpen(false); } else { setChatTab("suggestions"); setChatOpen(true); } }}
        hasUnreadChat={hasUnreadChat}
        activeUsers={activeUsers}
      />

      {settingsOpen && (
        <SettingsPanel settings={settings} onChange={handleSettingsChange} />
      )}

      {/* Announcement banner */}
      {announcement && announcementDismissed !== announcement && (
        <div className="fixed top-[3.75rem] left-1/2 -translate-x-1/2 z-[60] w-[calc(100%-2rem)] max-w-xl pointer-events-auto">
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
        <div className={`fixed ${announcement && announcementDismissed !== announcement ? "top-[7rem]" : "top-16"} left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-xl transition-all`}>
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
                showFirms={firmsEnabled}
                firmsGeoJSON={firmsGeoJSON}
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
              showFirms={showFirms}
              onToggleFirms={handleToggleFirms}
              firmsCount={firmsCounts.total}
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

      {/* Left column — Satellite panel when in satellite mode, gauges otherwise */}
      {isMapView(viewMode) && viewMode === "satellite" && (
        <SatellitePanel
          counts={firmsCounts}
          loading={firmsGeoJSON === null && firmsEnabled}
          onClose={() => setViewMode("all")}
        />
      )}
      {isMapView(viewMode) && viewMode !== "satellite" && (
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
            {alerts.length === 0 && sirenAlerts.length === 0 ? (
              <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-6 text-center">
                <p className="text-neutral-500 text-sm">No active alerts</p>
              </div>
            ) : (
              <>
                {alerts.filter((a) => a.status === "active").map((alert) => (
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
                {sirenAlerts.map((alert) => (
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
              { href: "/intercept", label: "Intercept" },
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

      {/* Feed sidebar — desktop only */}
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
      <ChatPanel open={chatOpen} onClose={() => setChatOpen(false)} defaultTab={chatTab} />

      {/* Mobile bottom tab bar */}
      <MobileTabBar
        activeTab={mobileTab}
        onTabChange={setMobileTab}
        alertCount={activeAlertCount + sirenAlerts.length}
      />
    </div>
  );
}
