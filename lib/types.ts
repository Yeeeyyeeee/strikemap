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
