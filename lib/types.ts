export type StrikeSide = "iran" | "us_israel" | "us" | "israel";

export type ViewMode = "all" | "iran" | "us_israel" | "leadership" | "stats" | "weapons" | "killchain" | "intercept" | "airspace" | "heatmap" | "satellite";

export interface MediaItem {
  type: "image" | "video";
  url: string;
  thumbnail?: string;
}

export interface Incident {
  id: string;
  date: string;
  location: string;
  lat: number;
  lng: number;
  description: string;
  details: string;
  weapon: string;
  target_type: string;
  video_url: string;
  source_url: string;
  source: "sheet" | "rss" | "telegram";
  side: StrikeSide;
  target_military: boolean; // true = military target, false = civilian
  timestamp?: string; // full ISO 8601 datetime (e.g. "2026-03-01T14:30:00+00:00")
  telegram_post_id?: string; // e.g. "tabzlive/70372" — enables iframe embed
  intercepted_by?: string; // e.g. "Iron Dome", "Arrow-3", "THAAD", "David's Sling"
  intercept_success?: boolean | null; // true = intercepted, false = failed, null = unknown/unconfirmed
  missiles_fired?: number; // how many projectiles were launched
  missiles_intercepted?: number; // how many were intercepted
  damage_assessment?: string; // AI-generated damage description
  damage_severity?: "minor" | "moderate" | "severe" | "catastrophic";
  casualties_military?: number; // estimated military/combatant killed
  casualties_civilian?: number; // estimated civilian killed
  casualties_description?: string; // AI-generated casualty summary
  media?: MediaItem[]; // images and videos from Telegram
  isStatement?: boolean; // true = political statement/news, not an actual strike — still shown on map but excluded from strike counts
  confidence?: "unconfirmed" | "confirmed" | "verified";
  sourceCount?: number;
  firmsBacked?: boolean;
  seismicBacked?: boolean;
  verification?: VerificationEvidence;
}

export interface MissileAlert {
  id: string;
  postId: string;
  timestamp: string;
  regions: string[];
  cities: string[];
  lat: number;
  lng: number;
  originLat: number;
  originLng: number;
  timeToImpact: number; // seconds
  status: "active" | "cleared";
  rawText: string;
  threatType?: "missile" | "drone" | "unknown";
  threatClass?: "ballistic" | "cruise" | "drone" | "rocket";
  originName?: string;
}

export interface InterceptionOutcome {
  id: string;                    // "outcome-{epoch}"
  alertIds: string[];            // cleared alert IDs this relates to
  intercepted: boolean | null;   // true=intercepted, false=hit, null=unknown
  interceptedBy: string;         // "Arrow-3", "Iron Dome", etc.
  missilesFired?: number;
  missilesIntercepted?: number;
  summary: string;               // human-readable banner text
  sourcePostId: string;          // IDF Telegram post ID
  detectedAt: number;            // epoch ms
  alertClearedAt: number;        // epoch ms
}

// NOTAM / Airspace types
export type NOTAMType = "closure" | "restriction" | "military_activity" | "gps_interference" | "tfr";
export type NOTAMSeverity = "info" | "warning" | "critical";
export type AirspaceStatus = "open" | "restricted" | "closed";

export interface NOTAM {
  id: string;
  fir: string;
  country: string;
  type: NOTAMType;
  summary: string;
  raw_text: string;
  altitude_floor?: number;
  altitude_ceiling?: number;
  effective_from: string;
  effective_to: string;
  lat?: number;
  lng?: number;
  radius_nm?: number;
  severity: NOTAMSeverity;
}

export interface RegionAirspace {
  country: string;
  fir: string;
  status: AirspaceStatus;
  active_notams: number;
  critical_notams: number;
  last_updated: string;
  manual_override?: boolean;
  override_set_at?: string;
}

// --- Report / Briefing types ---

export interface BriefingKeyDevelopment {
  headline: string;
  detail: string;
  severity: "low" | "medium" | "high" | "critical";
}

export interface BriefingTimelineEvent {
  time: string;
  event: string;
  location: string;
}

export interface BriefingStatistics {
  total_strikes: number;
  iran_strikes: number;
  us_israel_strikes: number;
  weapons_used: Array<{ weapon: string; count: number }>;
  locations_affected: string[];
  overall_damage_level: string;
}

export interface BriefingReport {
  executive_summary: string;
  key_developments: BriefingKeyDevelopment[];
  timeline: BriefingTimelineEvent[];
  statistics: BriefingStatistics;
  threat_assessment: string;
  sources_summary: string;
  generatedAt: string;
  period: number;
  incidentCount: number;
  feedPostCount: number;
}

// --- Seismic types ---

export interface SeismicEvent {
  id: string;
  magnitude: number;
  lat: number;
  lng: number;
  depth: number; // km
  timestamp: string; // ISO 8601
  place: string;
  type: string; // "earthquake", "explosion", etc.
  correlatedIncidentId?: string;
}

// --- Verification types ---

export interface VerificationEvidence {
  firms?: {
    hotspotCount: number;
    maxFRP: number;
    maxConfidence: number;
    matchedAt: string;
  };
  seismic?: {
    eventId: string;
    magnitude: number;
    depth: number;
    distanceKm: number;
    timeDeltaMin: number;
    matchedAt: string;
  };
}

// --- Satellite / FIRMS types ---

export interface FIRMSHotspot {
  latitude: number;
  longitude: number;
  brightness: number;
  frp: number; // fire radiative power (MW)
  confidence: number; // 0-100
  acq_date: string; // "2026-03-03"
  acq_time: string; // "0130" (HHMM UTC)
  satellite: string; // "N20" etc.
  daynight: "D" | "N";
  correlatedIncidentId?: string; // set if matched to a known incident
}

// --- Aircraft tracking types ---

export interface TrackedAircraft {
  hex: string;          // ICAO24 hex address
  callsign: string;     // flight callsign (trimmed)
  lat: number;
  lng: number;
  alt: number;          // altitude in feet (alt_baro)
  heading: number;      // track in degrees (0-360)
  speed: number;        // ground speed in knots
  type: string;         // aircraft type designator (e.g. "C17", "F35")
  registration: string; // aircraft registration
  onGround: boolean;
  seen: number;         // seconds since last message
  lastSeen: string;     // ISO timestamp when snapshot was taken
}

// --- Maritime vessel tracking types ---

export type VesselType =
  | "cargo"
  | "tanker"
  | "military"
  | "passenger"
  | "fishing"
  | "tug"
  | "other";

export interface TrackedVessel {
  mmsi: string;         // Maritime Mobile Service Identity
  name: string;         // vessel name
  lat: number;
  lng: number;
  cog: number;          // course over ground (degrees)
  sog: number;          // speed over ground (knots)
  heading: number;      // true heading
  shipType: VesselType; // classified vessel type
  shipTypeRaw: number;  // raw AIS ship type code
  lastSeen: string;     // ISO timestamp
}

export interface SatelliteImagery {
  incidentId: string;
  lat: number;
  lng: number;
  beforeDateFrom: string; // start of before search window
  beforeDateTo: string;   // end of before search window
  afterDateFrom: string;  // start of after search window
  afterDateTo: string;    // end of after search window
  beforeDate: string;     // best date from catalog (or window end as fallback)
  afterDate: string;
  beforeCloudCover?: number;
  afterCloudCover?: number;
  catalogBeforeId?: string;
  catalogAfterId?: string;
  fetchedAt: string;
}
