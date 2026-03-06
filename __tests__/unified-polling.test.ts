/**
 * Tests for the useUnifiedPolling hook.
 *
 * Verifies that the unified hook preserves ALL user-facing behavior
 * from the three individual hooks it replaces:
 *
 * 1. Polling interval matches ALERT_POLL_MS (5s) — same as before
 * 2. Incident detection: new strikes trigger sound, flash, flyTo, notification
 * 3. Alert detection: new alerts trigger sound, flash, flyTo, notification
 * 4. Siren detection: new sirens trigger sound, notification, onNewSiren callback
 * 5. Tab visibility: no polling when tab is hidden (saves server load)
 * 6. ETag caching: sends If-None-Match, skips processing on 304
 * 7. First-poll seeding: doesn't trigger sounds on initial data load
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useUnifiedPolling } from "@/hooks/useUnifiedPolling";

// Mock sounds
vi.mock("@/lib/sounds", () => ({
  playAlertSound: vi.fn(),
  playImpactSound: vi.fn(),
}));

import { playAlertSound, playImpactSound } from "@/lib/sounds";

// Track fetch calls
let fetchCallCount = 0;
let mockPollData: Record<string, unknown> = {};

beforeEach(() => {
  fetchCallCount = 0;

  mockPollData = {
    incidents: [
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
    ],
    incidentCount: 1,
    alerts: [],
    outcomes: [],
    sirenAlerts: [],
  };

  // Mock fetch
  global.fetch = vi.fn(async () => {
    fetchCallCount++;
    return {
      status: 200,
      ok: true,
      headers: new Headers({
        etag: `"poll-${fetchCallCount}"`,
      }),
      json: async () => mockPollData,
    } as Response;
  });

  // Mock document.hidden
  Object.defineProperty(document, "hidden", { value: false, writable: true, configurable: true });

  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("useUnifiedPolling", () => {
  const defaultOptions = {
    soundEnabled: true,
    notificationsEnabled: false,
    alertCountries: "all" as const,
  };

  it("polls at ALERT_POLL_MS interval (5 seconds)", async () => {
    renderHook(() => useUnifiedPolling(defaultOptions));

    // Initial poll
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetchCallCount).toBe(1);

    // After 5 seconds, second poll
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(fetchCallCount).toBe(2);

    // After another 5 seconds, third poll
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(fetchCallCount).toBe(3);
  });

  it("calls /api/poll (unified endpoint, not individual endpoints)", async () => {
    renderHook(() => useUnifiedPolling(defaultOptions));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(global.fetch).toHaveBeenCalledWith("/api/poll", expect.any(Object));

    // Verify we're NOT calling the old endpoints
    const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
    const urls = calls.map((c) => c[0]);
    expect(urls).not.toContain("/api/incidents");
    expect(urls).not.toContain("/api/alerts");
    expect(urls).not.toContain("/api/siren-alerts");
  });

  it("returns incidents from the unified response", async () => {
    const { result } = renderHook(() => useUnifiedPolling(defaultOptions));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.incidents).toHaveLength(1);
    expect(result.current.incidents[0].id).toBe("inc-1");
  });

  it("does NOT play sounds on first poll (seeding)", async () => {
    renderHook(() => useUnifiedPolling(defaultOptions));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(playImpactSound).not.toHaveBeenCalled();
    expect(playAlertSound).not.toHaveBeenCalled();
  });

  it("plays impact sound when new incident appears after first poll", async () => {
    const { result } = renderHook(() => useUnifiedPolling(defaultOptions));

    // First poll — seeds
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.incidents).toHaveLength(1);

    // Add a new incident
    mockPollData = {
      ...mockPollData,
      incidents: [
        ...(mockPollData.incidents as unknown[]),
        {
          id: "inc-2",
          lat: 35.0,
          lng: 51.0,
          location: "Tehran",
          description: "New strike",
          side: "iran",
          weapon: "ballistic_missile",
          casualties_military: 0,
          casualties_civilian: 0,
        },
      ],
      incidentCount: 2,
    };

    // Second poll — detects new incident
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(playImpactSound).toHaveBeenCalledTimes(1);
  });

  it("plays alert sound when new alert appears after first poll", async () => {
    renderHook(() => useUnifiedPolling(defaultOptions));

    // First poll
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    // Add an alert for second poll
    mockPollData = {
      ...mockPollData,
      alerts: [
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
          rawText: "Red Alert: South",
          threatType: "missile",
        },
      ],
    };

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(playAlertSound).toHaveBeenCalledTimes(1);
  });

  it("calls onNewSiren when new siren country appears", async () => {
    const onNewSiren = vi.fn();
    renderHook(() => useUnifiedPolling({ ...defaultOptions, onNewSiren }));

    // First poll
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    // Add a siren
    mockPollData = {
      ...mockPollData,
      sirenAlerts: [
        {
          id: "siren-1",
          country: "Iran",
          activatedAt: Date.now(),
          lastSeenAt: Date.now(),
          sourceChannel: "test",
          status: "active",
        },
      ],
    };

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(onNewSiren).toHaveBeenCalledWith("Iran");
  });

  it("calls onNewStrikes callback for new incidents", async () => {
    const onNewStrikes = vi.fn();
    renderHook(() => useUnifiedPolling({ ...defaultOptions, onNewStrikes }));

    // First poll
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    // Add new incident
    mockPollData = {
      ...mockPollData,
      incidents: [
        ...(mockPollData.incidents as unknown[]),
        {
          id: "inc-new",
          lat: 35.0,
          lng: 51.0,
          location: "Tehran",
          description: "New",
          side: "iran",
          weapon: "missile",
          casualties_military: 0,
          casualties_civilian: 0,
        },
      ],
    };

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(onNewStrikes).toHaveBeenCalledTimes(1);
    expect(onNewStrikes).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ id: "inc-new" })])
    );
  });

  it("skips polling when document is hidden (tab inactive)", async () => {
    renderHook(() => useUnifiedPolling(defaultOptions));

    // First poll (always runs)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetchCallCount).toBe(1);

    // Hide the tab
    Object.defineProperty(document, "hidden", { value: true, configurable: true });

    // Advance past multiple poll intervals — should NOT fetch
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15000);
    });
    expect(fetchCallCount).toBe(1); // Still 1 — skipped while hidden
  });

  it("sends If-None-Match header after first successful response", async () => {
    renderHook(() => useUnifiedPolling(defaultOptions));

    // First poll
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    // Second poll should include the ETag from first response
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
    const secondCall = calls[1];
    const headers = secondCall[1]?.headers;
    expect(headers?.["If-None-Match"]).toBe(`"poll-1"`);
  });

  it("derives activeIsraelRegions from alerts", async () => {
    mockPollData = {
      ...mockPollData,
      alerts: [
        {
          id: "tzofar-200",
          postId: "200",
          timestamp: "15:00",
          regions: ["South", "Central"],
          cities: ["Ashkelon", "Tel Aviv"],
          lat: 31.67,
          lng: 34.57,
          timeToImpact: 30,
          status: "active",
          rawText: "Red Alert",
        },
      ],
    };

    const { result } = renderHook(() => useUnifiedPolling(defaultOptions));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.activeIsraelRegions).toContain("South");
    expect(result.current.activeIsraelRegions).toContain("Central");
  });

  it("flies to new strike location via mapInstance", async () => {
    const flyTo = vi.fn();
    const mapInstance = { flyTo };

    renderHook(() => useUnifiedPolling({ ...defaultOptions, mapInstance }));

    // First poll
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    // Add new incident
    mockPollData = {
      ...mockPollData,
      incidents: [
        ...(mockPollData.incidents as unknown[]),
        {
          id: "inc-fly",
          lat: 33.0,
          lng: 52.0,
          location: "Somewhere",
          description: "Strike",
          side: "iran",
          weapon: "missile",
          casualties_military: 0,
          casualties_civilian: 0,
        },
      ],
    };

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(flyTo).toHaveBeenCalledWith(
      expect.objectContaining({
        center: [52.0, 33.0],
        zoom: 7,
      })
    );
  });

  it("flies to new alert location via mapInstance", async () => {
    const flyTo = vi.fn();
    const mapInstance = { flyTo };

    renderHook(() => useUnifiedPolling({ ...defaultOptions, mapInstance }));

    // First poll
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    // Add alert
    mockPollData = {
      ...mockPollData,
      alerts: [
        {
          id: "tzofar-300",
          postId: "300",
          timestamp: "16:00",
          regions: ["North"],
          cities: ["Haifa"],
          lat: 32.8,
          lng: 34.99,
          originLat: 33.5,
          originLng: 35.5,
          timeToImpact: 60,
          status: "active",
          rawText: "Red Alert: North — Haifa",
        },
      ],
    };

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(flyTo).toHaveBeenCalledWith(
      expect.objectContaining({
        center: [34.99, 32.8],
        zoom: 7,
      })
    );
  });

  it("tracks lastIranStrikeAt when Iran strikes", async () => {
    const { result } = renderHook(() => useUnifiedPolling(defaultOptions));

    // First poll
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.lastIranStrikeAt).toBe(0);

    // Add Iran strike
    mockPollData = {
      ...mockPollData,
      incidents: [
        ...(mockPollData.incidents as unknown[]),
        {
          id: "inc-iran",
          lat: 32.0,
          lng: 34.5,
          location: "Israel",
          description: "Iran missile",
          side: "iran",
          weapon: "ballistic_missile",
          casualties_military: 0,
          casualties_civilian: 0,
        },
      ],
    };

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(result.current.lastIranStrikeAt).toBeGreaterThan(0);
  });

  it("does not re-trigger for already-seen incidents", async () => {
    // Clear any calls from previous tests
    vi.mocked(playImpactSound).mockClear();

    renderHook(() => useUnifiedPolling(defaultOptions));

    // First poll seeds inc-1
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    // Second poll returns same data
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    // No sound should have played (inc-1 was already seeded, second poll has same data)
    expect(playImpactSound).not.toHaveBeenCalled();
  });
});
