/**
 * Tests for the unified /api/poll endpoint.
 *
 * Verifies:
 * 1. Response shape matches what the old 3 endpoints returned combined
 * 2. ETag / 304 behavior works (bandwidth savings)
 * 3. Cache-Control headers are set correctly (CDN caching = cost savings)
 * 4. All datasets (incidents, alerts, outcomes, sirens) are present
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mock all dependencies BEFORE importing the route ---

const mockIncidents = [
  {
    id: "inc-1",
    lat: 32.0,
    lng: 51.0,
    location: "Isfahan",
    description: "Strike on military facility",
    side: "us_israel",
    weapon: "JDAM",
    casualties_military: 0,
    casualties_civilian: 0,
  },
  {
    id: "inc-2",
    lat: 35.0,
    lng: 51.0,
    location: "Tehran",
    description: "Missile strike",
    side: "iran",
    weapon: "ballistic_missile",
    casualties_military: 2,
    casualties_civilian: 0,
  },
];

const mockAlerts = [
  {
    id: "tzofar-100",
    postId: "100",
    timestamp: "14:30",
    regions: ["South"],
    cities: ["Ashkelon"],
    lat: 31.67,
    lng: 34.57,
    originLat: 31.5,
    originLng: 34.4,
    timeToImpact: 15,
    status: "active",
    rawText: "Red Alert: South — Ashkelon",
    threatType: "missile",
    threatClass: "SRBM",
    originName: "Gaza",
  },
];

const mockOutcomes = [
  {
    id: "outcome-1",
    alertIds: ["tzofar-100"],
    intercepted: true,
    interceptedBy: "Iron Dome",
    missilesFired: 3,
    missilesIntercepted: 3,
    summary: "Intercepted by Iron Dome (3/3)",
    sourcePostId: "idf-post-1",
    detectedAt: Date.now(),
    alertClearedAt: Date.now() - 60000,
  },
];

const mockSirenAlerts = [
  {
    id: "siren-1",
    country: "Iran",
    activatedAt: Date.now(),
    lastSeenAt: Date.now(),
    sourceChannel: "test",
    status: "active",
  },
];

vi.mock("@/lib/incidentStore", () => ({
  getAllIncidents: vi.fn(() => Promise.resolve(mockIncidents)),
  seedIfEmpty: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/lib/refresh", () => ({
  refreshLiveData: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/lib/tzevaadom", () => ({
  fetchTzevAdomAlerts: vi.fn(() => Promise.resolve(mockAlerts)),
}));

vi.mock("@/lib/interceptionOutcome", () => ({
  getInterceptionOutcomes: vi.fn(() => Promise.resolve(mockOutcomes)),
}));

vi.mock("@/lib/sirenDetector", () => ({
  getActiveSirenAlerts: vi.fn(() => Promise.resolve(mockSirenAlerts)),
}));

vi.mock("@/lib/sampleData", () => ({
  SAMPLE_INCIDENTS: [],
}));

// Import AFTER mocks
import { GET } from "@/app/api/poll/route";
import { NextRequest } from "next/server";

function makeRequest(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("http://localhost:3000/api/poll", { headers });
}

describe("/api/poll endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns all datasets in a single response", async () => {
    const res = await GET(makeRequest());
    const data = await res.json();

    // Incidents
    expect(data.incidents).toHaveLength(2);
    expect(data.incidents[0].id).toBe("inc-1");
    expect(data.incidentCount).toBe(2);

    // Alerts
    expect(data.alerts).toHaveLength(1);
    expect(data.alerts[0].id).toBe("tzofar-100");

    // Outcomes
    expect(data.outcomes).toHaveLength(1);
    expect(data.outcomes[0].interceptedBy).toBe("Iron Dome");

    // Sirens
    expect(data.sirenAlerts).toHaveLength(1);
    expect(data.sirenAlerts[0].country).toBe("Iran");
  });

  it("sets Cache-Control with s-maxage for CDN caching", async () => {
    const res = await GET(makeRequest());
    const cacheControl = res.headers.get("Cache-Control");

    expect(cacheControl).toContain("s-maxage=4");
    expect(cacheControl).toContain("stale-while-revalidate=2");
    expect(cacheControl).toContain("public");
  });

  it("returns an ETag header", async () => {
    const res = await GET(makeRequest());
    const etag = res.headers.get("ETag");

    expect(etag).toBeTruthy();
    expect(etag).toMatch(/^"poll-[a-f0-9]+"/);
  });

  it("returns 304 when If-None-Match matches ETag", async () => {
    // First request to get the ETag
    const firstRes = await GET(makeRequest());
    const etag = firstRes.headers.get("ETag")!;

    // Second request with matching ETag
    const secondRes = await GET(makeRequest({ "If-None-Match": etag }));

    expect(secondRes.status).toBe(304);
  });

  it("returns 200 with body when If-None-Match does NOT match", async () => {
    const res = await GET(makeRequest({ "If-None-Match": '"poll-stale"' }));

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.incidents).toBeDefined();
  });

  it("response shape matches the combined old endpoints", async () => {
    const res = await GET(makeRequest());
    const data = await res.json();

    // /api/incidents returned { incidents, count }
    expect(data).toHaveProperty("incidents");
    expect(data).toHaveProperty("incidentCount");

    // /api/alerts returned { alerts, outcomes }
    expect(data).toHaveProperty("alerts");
    expect(data).toHaveProperty("outcomes");

    // /api/siren-alerts returned { sirenAlerts }
    expect(data).toHaveProperty("sirenAlerts");
  });

  it("ETag is stable for same data (deterministic)", async () => {
    const res1 = await GET(makeRequest());
    const res2 = await GET(makeRequest());

    expect(res1.headers.get("ETag")).toBe(res2.headers.get("ETag"));
  });
});
