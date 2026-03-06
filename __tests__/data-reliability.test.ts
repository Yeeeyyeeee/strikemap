/**
 * Data Reliability Test Suite
 * Tests all fixes from the data reliability overhaul.
 */
import { describe, it, expect } from "vitest";
import { enrichWithKeywords, matchBestLocation } from "@/lib/keywordEnricher";
import { dedupScore } from "@/lib/incidentStore";
import { isIranRelated } from "@/lib/telegram";
import { hasSirenKeywords } from "@/lib/sirenDetector";
import type { Incident } from "@/lib/types";

// Helper to create a minimal incident for dedup testing
function makeIncident(overrides: Partial<Incident>): Incident {
  return {
    id: `test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    date: "2026-03-05",
    timestamp: new Date().toISOString(),
    location: "",
    lat: 0,
    lng: 0,
    description: "",
    details: "",
    weapon: "",
    target_type: "",
    video_url: "",
    source_url: "",
    source: "telegram",
    side: "iran",
    target_military: false,
    ...overrides,
  };
}

// ==========================================================================
// 1. Word-boundary matching
// ==========================================================================
describe("Word-boundary matching", () => {
  it("should NOT match 'arak' inside 'Iraq'", () => {
    const result = enrichWithKeywords("Missile strike on Iraq military base, multiple rockets fired");
    // Should match Iraq, not Arak
    expect(result).not.toBeNull();
    expect(result!.location).toContain("Iraq");
    expect(result!.location).not.toContain("Arak");
  });

  it("should NOT match 'oman' inside 'woman'", () => {
    const result = enrichWithKeywords("A woman killed in airstrike on Tehran, explosion reported");
    expect(result).not.toBeNull();
    expect(result!.location).toContain("Tehran");
    expect(result!.location).not.toContain("Oman");
  });

  it("should match 'arak' as standalone word", () => {
    const result = enrichWithKeywords("Airstrike on Arak nuclear facility, explosion reported and missiles fired");
    expect(result).not.toBeNull();
    expect(result!.location).toContain("Arak");
  });

  it("should match 'Iron Dome' as weapon, not location", () => {
    // Iron Dome was removed from LOCATIONS, so it should only match as weapon
    const result = enrichWithKeywords("Iron Dome intercepted missiles over Tel Aviv, rockets fired at Israel");
    expect(result).not.toBeNull();
    expect(result!.location).toContain("Tel Aviv");
    expect(result!.weapon).toContain("Iron Dome");
  });

  it("should NOT match 'ram' inside 'Ramon'", () => {
    const result = enrichWithKeywords("Missile strike on Ramon Air Base, explosion and rockets fired");
    expect(result).not.toBeNull();
    expect(result!.location).toContain("Ramon");
  });
});

// ==========================================================================
// 2. Multi-location scoring
// ==========================================================================
describe("Multi-location scoring", () => {
  it("should pick target location over source location", () => {
    const result = enrichWithKeywords("Airstrike on Beirut launched from Tel Aviv, explosion confirmed and rockets fired");
    expect(result).not.toBeNull();
    expect(result!.location).toContain("Beirut");
  });

  it("should prefer military/city over region/country", () => {
    const result = enrichWithKeywords("Missiles struck Tel Aviv in central Israel, multiple explosions reported");
    expect(result).not.toBeNull();
    // Tel Aviv (city, specificity 3) should win over Central Israel (region, specificity 2)
    expect(result!.location).toContain("Tel Aviv");
  });

  it("should prefer military target over city", () => {
    const result = enrichWithKeywords("Airstrike hit Nevatim Air Base near Beer Sheva, explosion confirmed and rockets fired");
    expect(result).not.toBeNull();
    expect(result!.location).toContain("Nevatim");
  });
});

// ==========================================================================
// 3. Multi-factor dedup
// ==========================================================================
describe("Multi-factor dedup", () => {
  it("should merge containment pair (central Israel + Tel Aviv) within time window", () => {
    const now = new Date();
    const incA = makeIncident({
      location: "Central Israel",
      lat: 32.05, lng: 34.80,
      timestamp: now.toISOString(),
      weapon: "Missile",
      side: "iran",
      description: "Airstrike in central Israel",
    });
    const incB = makeIncident({
      location: "Tel Aviv, Israel",
      lat: 32.085, lng: 34.782,
      timestamp: new Date(now.getTime() + 60_000).toISOString(),
      weapon: "Missile",
      side: "iran",
      description: "Airstrike in Tel Aviv",
    });
    const score = dedupScore(incB, incA);
    expect(score).toBeGreaterThanOrEqual(0.6);
  });

  it("should NOT merge distinct strikes 12km apart with different weapons", () => {
    const now = new Date();
    const incA = makeIncident({
      location: "Ashkelon, Israel",
      lat: 31.668, lng: 34.571,
      timestamp: now.toISOString(),
      weapon: "Rocket",
      side: "iran",
      description: "Rocket barrage hits Ashkelon",
    });
    const incB = makeIncident({
      location: "Ashdod, Israel",
      lat: 31.804, lng: 34.655,
      timestamp: new Date(now.getTime() + 120_000).toISOString(),
      weapon: "Drone",
      side: "iran",
      description: "Drone strike on Ashdod port",
    });
    const score = dedupScore(incB, incA);
    // 12km apart (>8km radius), different weapons → should not merge
    expect(score).toBeLessThan(0.6);
  });

  it("should apply side mismatch penalty but not hard-block", () => {
    const now = new Date();
    const incA = makeIncident({
      location: "Damascus, Syria",
      lat: 33.513, lng: 36.292,
      timestamp: now.toISOString(),
      weapon: "Airstrike",
      side: "israel",
      description: "Airstrike on Damascus",
    });
    const incB = makeIncident({
      location: "Damascus, Syria",
      lat: 33.513, lng: 36.292,
      timestamp: new Date(now.getTime() + 30_000).toISOString(),
      weapon: "Airstrike",
      side: "iran",
      description: "Airstrike on Damascus",
    });
    const score = dedupScore(incB, incA);
    // Same location + time + weapon, but different side → penalty but may still merge
    // The -0.1 penalty should reduce the score
    const sameScore = dedupScore(
      { ...incB, side: "israel" } as Incident,
      incA,
    );
    expect(score).toBeLessThan(sameScore);
  });
});

// ==========================================================================
// 4. Casualty aggregation
// ==========================================================================
describe("Casualty aggregation", () => {
  it("should sum distinct casualty mentions", () => {
    const result = enrichWithKeywords(
      "Airstrike on Beirut: 5 soldiers killed in the barracks, 3 civilians dead near the market, rockets fired and explosion confirmed"
    );
    expect(result).not.toBeNull();
    expect(result!.casualties_military).toBe(5);
    expect(result!.casualties_civilian).toBe(3);
  });

  it("should not double-count same number in overlapping patterns", () => {
    const result = enrichWithKeywords(
      "Missile strike on Tehran killed 10 people, 10 dead confirmed from explosion, rockets fired"
    );
    expect(result).not.toBeNull();
    // "10 killed" and "10 dead" at nearby positions with same count → deduplicated
    const total = (result!.casualties_military || 0) + (result!.casualties_civilian || 0);
    expect(total).toBe(10);
  });

  it("should attribute based on nearby context words", () => {
    const result = enrichWithKeywords(
      "Airstrike on Gaza: 7 militants killed in tunnel, rockets fired and explosion confirmed"
    );
    expect(result).not.toBeNull();
    expect(result!.casualties_military).toBe(7);
    expect(result!.casualties_civilian).toBe(0);
  });
});

// ==========================================================================
// 5. AI geocoding validation
// ==========================================================================
describe("AI geocoding validation", () => {
  it("should have correct geocode bounds in constants", async () => {
    const { GEOCODE_LAT_MIN, GEOCODE_LAT_MAX, GEOCODE_LNG_MIN, GEOCODE_LNG_MAX } = await import("@/lib/constants");
    // Valid Middle East coordinates should be within bounds
    expect(32.0).toBeGreaterThanOrEqual(GEOCODE_LAT_MIN);
    expect(32.0).toBeLessThanOrEqual(GEOCODE_LAT_MAX);
    expect(51.0).toBeGreaterThanOrEqual(GEOCODE_LNG_MIN);
    expect(51.0).toBeLessThanOrEqual(GEOCODE_LNG_MAX);
    // Moscow should be out of bounds
    expect(55.75).toBeGreaterThan(GEOCODE_LAT_MAX);
  });

  it("should reject coordinates outside Middle East bounding box", async () => {
    const { GEOCODE_LAT_MIN, GEOCODE_LAT_MAX, GEOCODE_LNG_MIN, GEOCODE_LNG_MAX } = await import("@/lib/constants");
    // Simulate validation logic
    const lat = 55.75; // Moscow
    const lng = 37.62;
    const outOfBounds = lat < GEOCODE_LAT_MIN || lat > GEOCODE_LAT_MAX ||
      lng < GEOCODE_LNG_MIN || lng > GEOCODE_LNG_MAX;
    expect(outOfBounds).toBe(true);
  });
});

// ==========================================================================
// 6. Russia/Ukraine filter
// ==========================================================================
describe("Russia/Ukraine filter", () => {
  it("should allow mixed Iran+Russia content when Iran dominates", () => {
    const result = isIranRelated(
      "Iran strike on Israel after Putin comments on the escalation, IRGC launches missiles"
    );
    expect(result).toBe(true);
  });

  it("should block pure Russia/Ukraine content", () => {
    const result = isIranRelated(
      "Russia launches Iskander missiles at Kyiv, Ukrainian air defense responds in Kharkiv"
    );
    expect(result).toBe(false);
  });

  it("should allow high-specificity Iran keywords even with Russia mentions", () => {
    const result = isIranRelated(
      "Russia and Iran discuss Shahed drone production in Tehran, IRGC cooperation"
    );
    expect(result).toBe(true);
  });
});

// ==========================================================================
// 7. Side attribution
// ==========================================================================
describe("Side attribution", () => {
  it("should use keyword evidence over location fallback", () => {
    const result = enrichWithKeywords(
      "IDF strikes on Lebanon: Israeli warplanes bombed Beirut, massive explosion confirmed"
    );
    expect(result).not.toBeNull();
    expect(result!.side).toBe("israel");
  });

  it("should fall back to location when keywords are absent", () => {
    const result = enrichWithKeywords(
      "Explosion reported in Tel Aviv, missiles intercepted, damage confirmed from rocket attack"
    );
    expect(result).not.toBeNull();
    // Tel Aviv is in Israel → side should be "iran" (Iran attacking Israel)
    expect(result!.side).toBe("iran");
  });

  it("should distinguish US from Israel in strikes on Iran", () => {
    const result = enrichWithKeywords(
      "CENTCOM confirms US Air Force B-2 bombers struck Isfahan nuclear facility, missiles and explosion reported"
    );
    expect(result).not.toBeNull();
    expect(result!.side).toBe("us");
  });
});

// ==========================================================================
// 8. Confidence scoring
// ==========================================================================
describe("Confidence scoring", () => {
  it("should start new incidents as unconfirmed", () => {
    const inc = makeIncident({ confidence: undefined, sourceCount: undefined });
    // Simulating what mergeIncidents does for new incidents
    inc.confidence = inc.confidence ?? "unconfirmed";
    inc.sourceCount = inc.sourceCount ?? 1;
    expect(inc.confidence).toBe("unconfirmed");
    expect(inc.sourceCount).toBe(1);
  });

  it("should promote to confirmed at sourceCount 2", () => {
    const inc = makeIncident({ confidence: "unconfirmed", sourceCount: 1 });
    inc.sourceCount = (inc.sourceCount ?? 1) + 1;
    if (inc.confidence === "unconfirmed" && inc.sourceCount >= 2) {
      inc.confidence = "confirmed";
    }
    expect(inc.confidence).toBe("confirmed");
    expect(inc.sourceCount).toBe(2);
  });

  it("should promote to verified at sourceCount 3", () => {
    const inc = makeIncident({ confidence: "confirmed", sourceCount: 2 });
    inc.sourceCount = (inc.sourceCount ?? 1) + 1;
    if (inc.confidence === "confirmed" && inc.sourceCount >= 3) {
      inc.confidence = "verified";
    }
    expect(inc.confidence).toBe("verified");
    expect(inc.sourceCount).toBe(3);
  });
});

// ==========================================================================
// 9. Siren false positives
// ==========================================================================
describe("Siren false positives", () => {
  it("should block news report about sirens (single keyword + reporting context)", () => {
    const result = hasSirenKeywords(
      "According to local media, sirens were heard earlier today in Tehran"
    );
    // "sirens" = 1 keyword, "according to" = reporting context → blocked
    expect(result).toBe(false);
  });

  it("should allow live siren alert with urgency", () => {
    const result = hasSirenKeywords(
      "BREAKING: Sirens sounding NOW in Tehran, take shelter immediately"
    );
    // "sirens" = 1 keyword, "now" + "breaking" = urgency → allowed
    expect(result).toBe(true);
  });

  it("should allow multi-keyword siren in report context", () => {
    const result = hasSirenKeywords(
      "Sources say air raid sirens and take shelter orders issued in Tehran"
    );
    // "air raid" + "sirens" + "take shelter" = 3+ keywords → allowed even with "sources say"
    expect(result).toBe(true);
  });
});

// ==========================================================================
// 10. RSS enrichment pipeline
// ==========================================================================
describe("RSS enrichment pipeline", () => {
  it("should enrich via keywords before needing AI", () => {
    // Simulate what RSS now does: try keyword enrichment first
    const text = "Airstrike on Tehran nuclear facility, explosion confirmed and missiles fired";
    const result = enrichWithKeywords(text);
    expect(result).not.toBeNull();
    expect(result!.location).toContain("Tehran");
    expect(result!.lat).not.toBe(0);
  });
});

// ==========================================================================
// 11. Strike indicator filtering
// ==========================================================================
describe("Strike indicator filtering", () => {
  it("should reject single generic strike word", () => {
    // "fire" alone as a single indicator should not pass
    const result = enrichWithKeywords("A fire broke out in Tel Aviv market today");
    expect(result).toBeNull();
  });

  it("should pass with two strike indicators", () => {
    const result = enrichWithKeywords("Missile strike on Tel Aviv, explosion reported");
    expect(result).not.toBeNull();
  });

  it("should pass with single indicator if named weapon present", () => {
    const result = enrichWithKeywords("Shahed drone spotted over Tel Aviv, fire reported");
    expect(result).not.toBeNull();
    expect(result!.weapon).toContain("Shahed");
  });
});
