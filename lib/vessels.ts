/**
 * Maritime vessel tracking via aisstream.io WebSocket.
 * Cron-based snapshot approach: connect, collect ~15s of position reports,
 * merge with previous snapshot, store in Redis.
 */

import WebSocket from "ws";
import { getRedis } from "./redis";
import { TrackedVessel, VesselType } from "./types";
import {
  REDIS_VESSELS_KEY,
  VESSELS_CACHE_TTL_S,
  VESSEL_WS_COLLECT_MS,
  VESSEL_STALE_THRESHOLD_MS,
  TRACKING_BBOX,
} from "./constants";

/** Classify AIS ship type code into our VesselType enum */
export function classifyVesselType(aisShipType: number): VesselType {
  if (aisShipType === 35) return "military";
  if (aisShipType >= 60 && aisShipType <= 69) return "passenger";
  if (aisShipType >= 70 && aisShipType <= 79) return "cargo";
  if (aisShipType >= 80 && aisShipType <= 89) return "tanker";
  if (aisShipType === 30) return "fishing";
  if (aisShipType === 31 || aisShipType === 32) return "tug";
  // Military-adjacent types
  if (aisShipType >= 50 && aisShipType <= 59) return "military"; // SAR, law enforcement, etc.
  return "other";
}

/** Connect to aisstream.io WebSocket, collect vessel positions for a time window */
export async function collectVesselSnapshot(): Promise<TrackedVessel[]> {
  const apiKey = process.env.AISSTREAM_API_KEY;
  if (!apiKey) {
    console.warn("[Vessels] AISSTREAM_API_KEY not set, skipping");
    return [];
  }

  const vessels = new Map<string, TrackedVessel>();
  const shipTypeCache = new Map<string, { type: number; name: string }>();
  const now = new Date().toISOString();

  return new Promise<TrackedVessel[]>((resolve) => {
    let resolved = false;
    let ws: WebSocket | null = null;
    let collectTimeout: ReturnType<typeof setTimeout> | null = null;

    const finish = () => {
      if (resolved) return;
      resolved = true;
      if (collectTimeout) clearTimeout(collectTimeout);
      try { ws?.close(); } catch { /* ignore */ }
      resolve(Array.from(vessels.values()));
    };

    // Safety timeout — always resolve even if WS never connects
    const safetyTimeout = setTimeout(() => {
      console.warn("[Vessels] Safety timeout reached");
      finish();
    }, VESSEL_WS_COLLECT_MS + 10_000);

    try {
      ws = new WebSocket("wss://stream.aisstream.io/v0/stream");

      ws.on("open", () => {
        console.log("[Vessels] WebSocket connected, subscribing to ME bbox");
        ws!.send(
          JSON.stringify({
            APIKey: apiKey,
            BoundingBoxes: [
              [
                [TRACKING_BBOX.latMax, TRACKING_BBOX.lngMin], // top-left [lat, lng]
                [TRACKING_BBOX.latMin, TRACKING_BBOX.lngMax], // bottom-right [lat, lng]
              ],
            ],
            FilterMessageTypes: ["PositionReport", "ShipStaticData"],
          })
        );

        // Collect for the configured duration, then close
        collectTimeout = setTimeout(() => {
          console.log(`[Vessels] Collection window ended, got ${vessels.size} unique vessels`);
          clearTimeout(safetyTimeout);
          finish();
        }, VESSEL_WS_COLLECT_MS);
      });

      ws.on("message", (raw: WebSocket.Data) => {
        try {
          const msg = JSON.parse(raw.toString());
          const msgType = msg.MessageType;

          // ShipStaticData contains ship type — enrich existing vessel or store for later
          if (msgType === "ShipStaticData") {
            const meta = msg.MetaData || {};
            const mmsi = String(meta.MMSI || "");
            if (!mmsi) return;
            const shipTypeRaw = meta.ShipType ?? 0;
            if (shipTypeRaw === 0) return;
            // If we already have this vessel from a PositionReport, enrich it
            const existing = vessels.get(mmsi);
            if (existing && existing.shipTypeRaw === 0) {
              existing.shipTypeRaw = shipTypeRaw;
              existing.shipType = classifyVesselType(shipTypeRaw);
              existing.name = (meta.ShipName || "").trim() || existing.name;
            }
            // Store type info for vessels we haven't seen yet
            if (!shipTypeCache.has(mmsi)) {
              shipTypeCache.set(mmsi, { type: shipTypeRaw, name: (meta.ShipName || "").trim() });
            }
            return;
          }

          if (msgType === "PositionReport") {
            const meta = msg.MetaData || {};
            const pos = msg.Message?.PositionReport;
            if (!pos) return;

            const mmsi = String(meta.MMSI || "");
            if (!mmsi) return;

            const lat = pos.Latitude;
            const lng = pos.Longitude;
            if (lat == null || lng == null) return;

            // Filter bad/default AIS coordinates
            if (lat === 0 && lng === 0) return;           // Default AIS "no position"
            if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return; // Invalid
            if (lat === 91 || lng === 181) return;         // AIS "not available" sentinel

            // Filter to bounding box (aisstream should do this, but double-check)
            if (lat < TRACKING_BBOX.latMin || lat > TRACKING_BBOX.latMax ||
                lng < TRACKING_BBOX.lngMin || lng > TRACKING_BBOX.lngMax) return;

            // Ship type: prefer MetaData, fallback to cached ShipStaticData
            let shipTypeRaw = meta.ShipType ?? 0;
            let shipName = (meta.ShipName || "").trim() || "UNKNOWN";
            if (shipTypeRaw === 0) {
              const cached = shipTypeCache.get(mmsi);
              if (cached) {
                shipTypeRaw = cached.type;
                if (shipName === "UNKNOWN" && cached.name) shipName = cached.name;
              }
            }

            vessels.set(mmsi, {
              mmsi,
              name: shipName,
              lat,
              lng,
              cog: pos.Cog ?? 0,
              sog: pos.Sog ?? 0,
              heading: pos.TrueHeading ?? pos.Cog ?? 0,
              shipType: classifyVesselType(shipTypeRaw),
              shipTypeRaw,
              lastSeen: now,
            });
          }
        } catch {
          // Skip malformed messages
        }
      });

      ws.on("error", (err: Error) => {
        console.error("[Vessels] WebSocket error:", err.message);
        clearTimeout(safetyTimeout);
        finish();
      });

      ws.on("close", () => {
        clearTimeout(safetyTimeout);
        finish();
      });
    } catch (err) {
      console.error("[Vessels] Failed to create WebSocket:", err);
      clearTimeout(safetyTimeout);
      finish();
    }
  });
}

/** Refresh vessel cache: collect snapshot, merge with previous, store in Redis */
export async function refreshVesselCache(): Promise<number> {
  const redis = getRedis();
  if (!redis) {
    console.warn("[Vessels] No Redis configured");
    return 0;
  }

  const now = Date.now();

  // Get previous snapshot
  let previous: TrackedVessel[] = [];
  try {
    const cached = await redis.get(REDIS_VESSELS_KEY);
    if (cached) {
      previous = typeof cached === "string" ? JSON.parse(cached) : (cached as TrackedVessel[]);
    }
  } catch {
    // Start fresh on error
  }

  // Collect new positions
  const fresh = await collectVesselSnapshot();
  console.log(`[Vessels] Collected ${fresh.length} positions from WebSocket`);

  // Merge: new vessels overwrite old by MMSI
  const merged = new Map<string, TrackedVessel>();
  for (const v of previous) {
    // Only keep if not stale
    const age = now - new Date(v.lastSeen).getTime();
    if (age < VESSEL_STALE_THRESHOLD_MS) {
      merged.set(v.mmsi, v);
    }
  }
  for (const v of fresh) {
    merged.set(v.mmsi, v); // fresh always wins
  }

  const result = Array.from(merged.values());
  try {
    await redis.set(REDIS_VESSELS_KEY, JSON.stringify(result), {
      ex: VESSELS_CACHE_TTL_S,
    });
  } catch (err) {
    console.warn("[Vessels] Redis write failed (read-only token?):", (err as Error).message);
  }

  console.log(`[Vessels] Stored ${result.length} vessels (${fresh.length} fresh, ${result.length - fresh.length} retained)`);
  return result.length;
}

/** Get cached vessels from Redis (does NOT trigger live collection) */
export async function getVessels(): Promise<TrackedVessel[]> {
  const redis = getRedis();
  if (!redis) return [];
  const cached = await redis.get(REDIS_VESSELS_KEY);
  if (!cached) return [];
  return typeof cached === "string" ? JSON.parse(cached) : (cached as TrackedVessel[]);
}

// MMSI MID (Maritime Identification Digits) → country
// First 3 digits of MMSI = MID code
const MID_COUNTRY_MAP: Record<string, string> = {
  "211": "Germany", "212": "Cyprus", "215": "Malta", "218": "Germany",
  "219": "Denmark", "220": "Denmark", "224": "Spain", "225": "Spain",
  "226": "France", "227": "France", "228": "France", "229": "Malta",
  "230": "Finland", "231": "Faroe Islands", "232": "United Kingdom",
  "233": "United Kingdom", "234": "United Kingdom", "235": "United Kingdom",
  "236": "Gibraltar", "237": "Greece", "238": "Croatia", "239": "Greece",
  "240": "Greece", "241": "Greece", "242": "Morocco", "243": "Hungary",
  "244": "Netherlands", "245": "Netherlands", "246": "Netherlands",
  "247": "Italy", "248": "Malta", "249": "Malta", "250": "Ireland",
  "256": "Malta", "257": "Norway", "258": "Norway", "259": "Norway",
  "261": "Poland", "263": "Portugal", "265": "Sweden", "266": "Sweden",
  "271": "Turkey", "272": "Ukraine", "273": "Russia", "274": "Russia",
  "301": "Anguilla", "303": "Alaska", "304": "Antigua",
  "305": "Antigua", "306": "Cura\u00e7ao", "307": "Aruba",
  "308": "Bahamas", "309": "Bahamas", "310": "Bermuda",
  "316": "Canada", "319": "Cayman Islands",
  "338": "United States", "339": "United States",
  "341": "Mexico", "351": "Jamaica", "352": "Barbados",
  "353": "Cuba", "354": "Argentina", "355": "Brazil",
  "356": "Ecuador", "361": "Saint Vincent",
  "370": "Panama", "371": "Panama", "372": "Panama", "373": "Panama",
  "374": "Panama", "375": "Saint Vincent", "376": "Saint Vincent",
  "377": "Saint Vincent",
  "401": "Afghanistan", "403": "Saudi Arabia", "405": "Bangladesh",
  "408": "Bahrain", "410": "Bhutan", "412": "China",
  "413": "China", "414": "China", "416": "Taiwan",
  "417": "Sri Lanka", "419": "India", "422": "Iran",
  "423": "Azerbaijan", "425": "Iraq", "428": "Israel",
  "431": "Japan", "432": "Japan", "440": "South Korea",
  "441": "South Korea", "443": "Palestine",
  "445": "North Korea", "447": "Kuwait", "450": "Lebanon",
  "451": "Kyrgyzstan", "455": "Maldives",
  "457": "Mongolia", "461": "Oman", "463": "Pakistan",
  "466": "Qatar", "468": "Syria", "470": "UAE",
  "471": "UAE", "472": "Tajikistan", "473": "Yemen",
  "477": "Hong Kong",
  "501": "Antarctica", "503": "Australia", "506": "Myanmar",
  "508": "Brunei", "510": "Micronesia", "511": "Palau",
  "512": "New Zealand", "514": "Cambodia", "515": "Cambodia",
  "516": "Christmas Island",
  "518": "Cook Islands", "520": "Fiji", "523": "Cocos Islands",
  "525": "Indonesia", "529": "Kiribati", "531": "Laos",
  "533": "Malaysia", "536": "Marshall Islands",
  "538": "Marshall Islands",
  "540": "New Caledonia", "542": "Niue", "544": "Nauru",
  "546": "Norfolk Island",
  "548": "Philippines", "553": "Papua New Guinea",
  "555": "Pitcairn", "557": "Solomon Islands",
  "559": "Samoa", "561": "Singapore", "563": "Singapore",
  "564": "Singapore", "565": "Singapore",
  "566": "Singapore", "567": "Thailand",
  "570": "Tonga", "572": "Tuvalu", "574": "Vietnam",
  "576": "Vanuatu", "577": "Vanuatu", "578": "Wallis",
  "601": "South Africa", "603": "Angola", "605": "Algeria",
  "607": "Saint Paul", "609": "Ascension",
  "610": "Burundi", "611": "Benin", "612": "Cape Verde",
  "613": "Cameroon", "615": "Congo", "616": "Comoros",
  "617": "Cabo Verde", "618": "Crozet",
  "619": "C\u00f4te d'Ivoire", "620": "Comoros",
  "621": "Djibouti", "622": "Egypt", "624": "Ethiopia",
  "625": "Eritrea", "626": "Gabon", "627": "Ghana",
  "629": "Gambia", "630": "Guinea-Bissau",
  "631": "Equatorial Guinea", "632": "Guinea",
  "633": "Burkina Faso", "634": "Kenya",
  "635": "Kerguelen", "636": "Liberia",
  "637": "Liberia", "638": "South Sudan",
  "642": "Libya", "644": "Lesotho",
  "645": "Mauritius", "647": "Madagascar",
  "649": "Mali", "650": "Mozambique",
  "654": "Mauritania", "655": "Malawi",
  "656": "Niger", "657": "Nigeria",
  "659": "Namibia", "660": "Reunion",
  "661": "Rwanda", "662": "Sudan",
  "663": "Senegal", "664": "Seychelles",
  "665": "Saint Helena", "666": "Somalia",
  "667": "Sierra Leone", "668": "S\u00e3o Tom\u00e9",
  "669": "Eswatini", "670": "Chad",
  "671": "Togo", "672": "Tunisia",
  "674": "Tanzania", "675": "Uganda",
  "676": "DR Congo", "677": "Tanzania",
  "678": "Zambia", "679": "Zimbabwe",
};

function mmsiToCountry(mmsi: string): string {
  if (mmsi.length < 3) return "Unknown";
  const mid = mmsi.substring(0, 3);
  return MID_COUNTRY_MAP[mid] || "Unknown";
}

/** Convert vessel array to GeoJSON for Mapbox */
export function vesselsToGeoJSON(
  vessels: TrackedVessel[]
): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: "FeatureCollection",
    features: vessels.map((v) => ({
      type: "Feature" as const,
      properties: {
        mmsi: v.mmsi,
        name: v.name,
        sog: v.sog,
        cog: v.cog,
        heading: v.heading,
        shipType: v.shipType,
        shipTypeRaw: v.shipTypeRaw,
        country: mmsiToCountry(v.mmsi),
      },
      geometry: {
        type: "Point" as const,
        coordinates: [v.lng, v.lat],
      },
    })),
  };
}
