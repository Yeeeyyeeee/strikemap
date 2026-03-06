/**
 * Combined verification engine.
 * Cross-references FIRMS thermal hotspots and USGS seismic data
 * with incidents to auto-promote confidence levels.
 *
 * Confidence promotion is monotonic — never downgrades.
 */

import { getAllIncidents, updateIncident } from "./incidentStore";
import { getFIRMSHotspots } from "./firms";
import { getSeismicEvents } from "./seismic";
import { haversineKm } from "./geo";
import { Incident, FIRMSHotspot, SeismicEvent, VerificationEvidence } from "./types";
import {
  FIRMS_CORRELATION_RADIUS_KM,
  FIRMS_CORRELATION_WINDOW_MS,
  SEISMIC_CORRELATION_RADIUS_KM,
  SEISMIC_CORRELATION_WINDOW_MS,
} from "./constants";

/** Parse FIRMS acq_date + acq_time into epoch ms */
function parseHotspotTime(acq_date: string, acq_time: string): number {
  if (!acq_date) return 0;
  const hh = acq_time.slice(0, 2) || "00";
  const mm = acq_time.slice(2, 4) || "00";
  return new Date(`${acq_date}T${hh}:${mm}:00Z`).getTime();
}

/** Find matching FIRMS hotspots for an incident */
function matchFIRMS(
  incident: Incident,
  hotspots: FIRMSHotspot[],
): FIRMSHotspot[] {
  if (incident.lat === 0 && incident.lng === 0) return [];
  const iTime = incident.timestamp ? new Date(incident.timestamp).getTime() : 0;

  return hotspots.filter((h) => {
    if (haversineKm(h.latitude, h.longitude, incident.lat, incident.lng) > FIRMS_CORRELATION_RADIUS_KM) {
      return false;
    }
    if (iTime) {
      const hTime = parseHotspotTime(h.acq_date, h.acq_time);
      if (hTime && Math.abs(hTime - iTime) > FIRMS_CORRELATION_WINDOW_MS) return false;
    }
    return true;
  });
}

/** Find matching seismic event for an incident */
function matchSeismic(
  incident: Incident,
  events: SeismicEvent[],
): SeismicEvent | null {
  if (incident.lat === 0 && incident.lng === 0) return null;
  const iTime = incident.timestamp ? new Date(incident.timestamp).getTime() : 0;
  if (!iTime) return null;

  let best: SeismicEvent | null = null;
  let bestDist = Infinity;

  for (const e of events) {
    const eTime = new Date(e.timestamp).getTime();
    if (Math.abs(eTime - iTime) > SEISMIC_CORRELATION_WINDOW_MS) continue;
    const dist = haversineKm(e.lat, e.lng, incident.lat, incident.lng);
    if (dist > SEISMIC_CORRELATION_RADIUS_KM) continue;
    if (dist < bestDist) {
      bestDist = dist;
      best = e;
    }
  }

  return best;
}

/**
 * Run verification across all incidents.
 * Returns number of incidents that had their confidence promoted.
 */
export async function runVerification(): Promise<number> {
  const [incidents, hotspots, seismicEvents] = await Promise.all([
    getAllIncidents(),
    getFIRMSHotspots(),
    getSeismicEvents(),
  ]);

  let promoted = 0;
  const now = new Date().toISOString();

  for (const inc of incidents) {
    // Skip statements
    if (inc.isStatement) continue;
    // Skip already verified
    if (inc.confidence === "verified" && inc.firmsBacked && inc.seismicBacked) continue;

    const matchedHotspots = matchFIRMS(inc, hotspots);
    const matchedSeismic = matchSeismic(inc, seismicEvents);

    const hadFirms = matchedHotspots.length > 0;
    const hadSeismic = matchedSeismic !== null;

    // No sensor match — skip
    if (!hadFirms && !hadSeismic) continue;

    // Build verification evidence
    const verification: VerificationEvidence = { ...inc.verification };

    if (hadFirms && !inc.firmsBacked) {
      verification.firms = {
        hotspotCount: matchedHotspots.length,
        maxFRP: Math.max(...matchedHotspots.map((h) => h.frp)),
        maxConfidence: Math.max(...matchedHotspots.map((h) => h.confidence)),
        matchedAt: now,
      };
      inc.firmsBacked = true;
    }

    if (hadSeismic && !inc.seismicBacked) {
      const iTime = new Date(inc.timestamp!).getTime();
      const eTime = new Date(matchedSeismic!.timestamp).getTime();
      verification.seismic = {
        eventId: matchedSeismic!.id,
        magnitude: matchedSeismic!.magnitude,
        depth: matchedSeismic!.depth,
        distanceKm: Math.round(haversineKm(matchedSeismic!.lat, matchedSeismic!.lng, inc.lat, inc.lng) * 10) / 10,
        timeDeltaMin: Math.round(Math.abs(eTime - iTime) / 60000),
        matchedAt: now,
      };
      inc.seismicBacked = true;
    }

    inc.verification = verification;

    // Confidence promotion (monotonic — never downgrades)
    const prev = inc.confidence ?? "unconfirmed";
    let next = prev;

    if (prev === "unconfirmed") {
      // Any sensor match promotes to confirmed
      if (hadFirms || hadSeismic) next = "confirmed";
    }

    if (prev === "confirmed" || next === "confirmed") {
      // Both sensors → verified
      if (inc.firmsBacked && inc.seismicBacked) {
        next = "verified";
      }
      // Strong FIRMS signal → verified
      if (inc.firmsBacked && verification.firms && verification.firms.hotspotCount >= 3 && verification.firms.maxFRP >= 30) {
        next = "verified";
      }
      // Seismic explosion type → verified
      if (inc.seismicBacked && matchedSeismic && matchedSeismic.type === "explosion") {
        next = "verified";
      }
    }

    if (next !== prev || inc.firmsBacked || inc.seismicBacked) {
      inc.confidence = next;
      await updateIncident(inc);
      if (next !== prev) promoted++;
    }
  }

  if (promoted > 0) {
    console.log(`[verification] Promoted ${promoted} incidents`);
  }

  return promoted;
}
