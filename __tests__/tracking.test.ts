/**
 * Tests for aircraft and vessel tracking modules.
 */
import { describe, it, expect } from "vitest";
import { isMilitary, MILITARY_CALLSIGN_PREFIXES, MILITARY_ICAO_RANGES } from "@/lib/militaryFilters";
import { aircraftToGeoJSON } from "@/lib/aircraft";
import { classifyVesselType, vesselsToGeoJSON } from "@/lib/vessels";
import type { TrackedAircraft, TrackedVessel, VesselType } from "@/lib/types";

// ── Military filter tests ──────────────────────────────────────────────

describe("isMilitary", () => {
  it("returns true for blank/empty callsign", () => {
    expect(isMilitary("abc123", null)).toBe(true);
    expect(isMilitary("abc123", "")).toBe(true);
    expect(isMilitary("abc123", "   ")).toBe(true);
  });

  it("returns true for known military callsign prefixes", () => {
    expect(isMilitary("abc123", "RCH123")).toBe(true);
    expect(isMilitary("abc123", "FORTE10")).toBe(true);
    expect(isMilitary("abc123", "DRAK21")).toBe(true);
    expect(isMilitary("abc123", "IAF001")).toBe(true);
    expect(isMilitary("abc123", "IRGC05")).toBe(true);
    expect(isMilitary("abc123", "IRI123")).toBe(true);
    expect(isMilitary("abc123", "NATO123")).toBe(true);
    expect(isMilitary("abc123", "CNV123")).toBe(true);
  });

  it("is case-insensitive for callsign matching", () => {
    expect(isMilitary("abc123", "rch123")).toBe(true);
    expect(isMilitary("abc123", "forte10")).toBe(true);
  });

  it("returns true for US military ICAO hex range", () => {
    // 0xAE0000 to 0xAEFFFF is US military
    expect(isMilitary("ae1234", "DLH123")).toBe(true);
    expect(isMilitary("ae0000", "UAL456")).toBe(true);
  });

  it("returns true for Iran military ICAO hex range", () => {
    // 0x730000 to 0x737FFF is Iran military
    expect(isMilitary("730100", "SomeCallsign")).toBe(true);
  });

  it("returns true for Israel military ICAO hex range", () => {
    // 0x738000 to 0x73BFFF is Israel military
    expect(isMilitary("738100", "SomeCallsign")).toBe(true);
  });

  it("returns false for civilian aircraft with known callsigns", () => {
    expect(isMilitary("a12345", "DLH123")).toBe(false);
    expect(isMilitary("a12345", "UAL456")).toBe(false);
    expect(isMilitary("a12345", "BAW789")).toBe(false);
    expect(isMilitary("a12345", "ELY123")).toBe(false);
  });

  it("returns false for civilian hex in non-military range", () => {
    expect(isMilitary("a12345", "SWA567")).toBe(false);
  });

  it("has correct number of prefixes and ranges", () => {
    expect(MILITARY_CALLSIGN_PREFIXES.length).toBeGreaterThan(20);
    expect(MILITARY_ICAO_RANGES.length).toBeGreaterThan(5);
  });
});

// ── Vessel type classification tests ──────────────────────────────────

describe("classifyVesselType", () => {
  const cases: [number, VesselType][] = [
    [35, "military"],
    [30, "fishing"],
    [31, "tug"],
    [32, "tug"],
    [60, "passenger"],
    [69, "passenger"],
    [70, "cargo"],
    [79, "cargo"],
    [80, "tanker"],
    [89, "tanker"],
    [50, "military"], // SAR
    [55, "military"], // law enforcement
    [0, "other"],
    [99, "other"],
    [40, "other"],
  ];

  it.each(cases)("classifies AIS type %d as %s", (aisType, expected) => {
    expect(classifyVesselType(aisType)).toBe(expected);
  });
});

// ── GeoJSON conversion tests ─────────────────────────────────────────

describe("aircraftToGeoJSON", () => {
  const mockAircraft: TrackedAircraft[] = [
    {
      hex: "ae1234",
      callsign: "RCH123",
      lat: 32.5,
      lng: 53.5,
      alt: 35000,
      heading: 180,
      speed: 450,
      type: "C17",
      registration: "05-5140",
      onGround: false,
      seen: 2,
      lastSeen: "2026-03-05T12:00:00Z",
    },
  ];

  it("converts aircraft array to valid GeoJSON FeatureCollection", () => {
    const geojson = aircraftToGeoJSON(mockAircraft);
    expect(geojson.type).toBe("FeatureCollection");
    expect(geojson.features).toHaveLength(1);
  });

  it("sets correct coordinates (lng, lat)", () => {
    const geojson = aircraftToGeoJSON(mockAircraft);
    const coords = geojson.features[0].geometry.coordinates;
    expect(coords[0]).toBe(53.5); // lng
    expect(coords[1]).toBe(32.5); // lat
  });

  it("includes all expected properties", () => {
    const geojson = aircraftToGeoJSON(mockAircraft);
    const props = geojson.features[0].properties!;
    expect(props.hex).toBe("ae1234");
    expect(props.callsign).toBe("RCH123");
    expect(props.alt).toBe(35000);
    expect(props.heading).toBe(180);
    expect(props.speed).toBe(450);
    expect(props.type).toBe("C17");
    expect(props.registration).toBe("05-5140");
  });

  it("handles empty array", () => {
    const geojson = aircraftToGeoJSON([]);
    expect(geojson.type).toBe("FeatureCollection");
    expect(geojson.features).toHaveLength(0);
  });
});

describe("vesselsToGeoJSON", () => {
  const mockVessels: TrackedVessel[] = [
    {
      mmsi: "211378120",
      name: "TEST VESSEL",
      lat: 25.3,
      lng: 55.2,
      cog: 123.5,
      sog: 12.5,
      heading: 125,
      shipType: "tanker",
      shipTypeRaw: 80,
      lastSeen: "2026-03-05T12:00:00Z",
    },
    {
      mmsi: "999999999",
      name: "MILITARY SHIP",
      lat: 26.0,
      lng: 56.0,
      cog: 0,
      sog: 0,
      heading: 0,
      shipType: "military",
      shipTypeRaw: 35,
      lastSeen: "2026-03-05T12:00:00Z",
    },
  ];

  it("converts vessel array to valid GeoJSON FeatureCollection", () => {
    const geojson = vesselsToGeoJSON(mockVessels);
    expect(geojson.type).toBe("FeatureCollection");
    expect(geojson.features).toHaveLength(2);
  });

  it("sets correct coordinates (lng, lat)", () => {
    const geojson = vesselsToGeoJSON(mockVessels);
    const coords = geojson.features[0].geometry.coordinates;
    expect(coords[0]).toBe(55.2); // lng
    expect(coords[1]).toBe(25.3); // lat
  });

  it("includes shipType for map color coding", () => {
    const geojson = vesselsToGeoJSON(mockVessels);
    expect(geojson.features[0].properties!.shipType).toBe("tanker");
    expect(geojson.features[1].properties!.shipType).toBe("military");
  });

  it("includes MMSI and name for popups", () => {
    const geojson = vesselsToGeoJSON(mockVessels);
    expect(geojson.features[0].properties!.mmsi).toBe("211378120");
    expect(geojson.features[0].properties!.name).toBe("TEST VESSEL");
  });

  it("includes navigation data for popups", () => {
    const geojson = vesselsToGeoJSON(mockVessels);
    const props = geojson.features[0].properties!;
    expect(props.sog).toBe(12.5);
    expect(props.cog).toBe(123.5);
    expect(props.heading).toBe(125);
  });

  it("handles empty array", () => {
    const geojson = vesselsToGeoJSON([]);
    expect(geojson.type).toBe("FeatureCollection");
    expect(geojson.features).toHaveLength(0);
  });
});
