/**
 * Tests for Mapbox cost optimization:
 * - Map is initialized ONCE and never re-created on data refresh or setting changes
 * - Data updates use source.setData() instead of map re-initialization
 * - Country boundaries use a single shared vector tile source
 * - FIRMS overlay uses setData + visibility toggle instead of source recreation
 * - HeatmapMap uses stable refs to prevent map re-creation
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";

// ---- Mapbox GL mock ----
let mapConstructorCallCount = 0;
const mockSetData = vi.fn();
const mockAddSource = vi.fn();
const mockGetSource = vi.fn().mockReturnValue(undefined);
const mockAddLayer = vi.fn();
const mockGetLayer = vi.fn().mockReturnValue(undefined);
const mockRemoveLayer = vi.fn();
const mockRemoveSource = vi.fn();
const mockSetLayoutProperty = vi.fn();
const mockSetPaintProperty = vi.fn();
const mockOn = vi.fn();
const mockOff = vi.fn();
const mockOnce = vi.fn();
const mockRemove = vi.fn();
const mockAddControl = vi.fn();
const mockLoaded = vi.fn().mockReturnValue(true);
const mockIsStyleLoaded = vi.fn().mockReturnValue(true);
const mockGetCanvas = vi.fn().mockReturnValue({ style: {} });
const mockQueryRenderedFeatures = vi.fn().mockReturnValue([]);
const mockSetStyle = vi.fn();
const mockGetZoom = vi.fn().mockReturnValue(4);
const mockFlyTo = vi.fn();
const mockEaseTo = vi.fn();
const mockProject = vi.fn().mockReturnValue({ x: 0, y: 0 });

vi.mock("mapbox-gl", () => {
  // Must use function (not arrow) so `new` works
  function MockMap() {
    mapConstructorCallCount++;
    return {
      addSource: mockAddSource,
      getSource: mockGetSource,
      addLayer: mockAddLayer,
      getLayer: mockGetLayer,
      removeLayer: mockRemoveLayer,
      removeSource: mockRemoveSource,
      setLayoutProperty: mockSetLayoutProperty,
      setPaintProperty: mockSetPaintProperty,
      on: mockOn,
      off: mockOff,
      once: mockOnce,
      remove: mockRemove,
      addControl: mockAddControl,
      loaded: mockLoaded,
      isStyleLoaded: mockIsStyleLoaded,
      getCanvas: mockGetCanvas,
      queryRenderedFeatures: mockQueryRenderedFeatures,
      setStyle: mockSetStyle,
      getZoom: mockGetZoom,
      flyTo: mockFlyTo,
      easeTo: mockEaseTo,
      project: mockProject,
    };
  }

  function MockMarker() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const marker: any = { remove: vi.fn(), getElement: vi.fn().mockReturnValue(document.createElement("div")) };
    marker.setLngLat = vi.fn().mockReturnValue(marker);
    marker.addTo = vi.fn().mockReturnValue(marker);
    marker.setRotation = vi.fn().mockReturnValue(marker);
    return marker;
  }

  function MockPopup() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const popup: any = { remove: vi.fn() };
    popup.setLngLat = vi.fn().mockReturnValue(popup);
    popup.setHTML = vi.fn().mockReturnValue(popup);
    popup.addTo = vi.fn().mockReturnValue(popup);
    return popup;
  }

  function MockNavigationControl() {}

  return {
    default: {
      Map: MockMap,
      Marker: MockMarker,
      Popup: MockPopup,
      NavigationControl: MockNavigationControl,
      accessToken: "",
    },
  };
});

// Set token before imports
process.env.NEXT_PUBLIC_MAPBOX_TOKEN = "pk.test_token_12345";

// Import after mock setup
import MapView from "../Map";
import HeatmapMap from "../HeatmapMap";

beforeEach(() => {
  vi.clearAllMocks();
  mapConstructorCallCount = 0;
  mockGetSource.mockReturnValue(undefined);
  mockGetLayer.mockReturnValue(undefined);
});

describe("Map initialization - cost optimization", () => {
  it("creates exactly ONE mapboxgl.Map instance on mount", () => {
    render(
      <MapView
        incidents={[]}
        onSelectIncident={() => {}}
        selectedIncident={null}
      />
    );

    expect(mapConstructorCallCount).toBe(1);
  });

  it("does NOT re-create the map when markerSize changes", () => {
    const { rerender } = render(
      <MapView
        incidents={[]}
        onSelectIncident={() => {}}
        selectedIncident={null}
        markerSize={1}
      />
    );

    expect(mapConstructorCallCount).toBe(1);

    rerender(
      <MapView
        incidents={[]}
        onSelectIncident={() => {}}
        selectedIncident={null}
        markerSize={2}
      />
    );

    expect(mapConstructorCallCount).toBe(1);
  });

  it("does NOT re-create the map when markerOpacity changes", () => {
    const { rerender } = render(
      <MapView
        incidents={[]}
        onSelectIncident={() => {}}
        selectedIncident={null}
        markerOpacity={1}
      />
    );

    expect(mapConstructorCallCount).toBe(1);

    rerender(
      <MapView
        incidents={[]}
        onSelectIncident={() => {}}
        selectedIncident={null}
        markerOpacity={0.5}
      />
    );

    expect(mapConstructorCallCount).toBe(1);
  });

  it("does NOT re-create the map when onMapReady callback changes", () => {
    const cb1 = vi.fn();
    const cb2 = vi.fn();

    const { rerender } = render(
      <MapView
        incidents={[]}
        onSelectIncident={() => {}}
        selectedIncident={null}
        onMapReady={cb1}
      />
    );

    expect(mapConstructorCallCount).toBe(1);

    rerender(
      <MapView
        incidents={[]}
        onSelectIncident={() => {}}
        selectedIncident={null}
        onMapReady={cb2}
      />
    );

    expect(mapConstructorCallCount).toBe(1);
  });

  it("does NOT re-create the map when incidents data changes", () => {
    const { rerender } = render(
      <MapView
        incidents={[]}
        onSelectIncident={() => {}}
        selectedIncident={null}
      />
    );

    expect(mapConstructorCallCount).toBe(1);

    rerender(
      <MapView
        incidents={[
          {
            id: "test-1",
            lat: 32.0,
            lng: 51.0,
            location: "Test",
            date: "2025-01-01",
            weapon: "missile",
            side: "iran",
          } as any,
        ]}
        onSelectIncident={() => {}}
        selectedIncident={null}
      />
    );

    expect(mapConstructorCallCount).toBe(1);
  });
});

describe("Country boundaries — shared vector tile source", () => {
  it("country overlay, flash, and siren all reference the shared source", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const mapSource = fs.readFileSync(
      path.resolve(__dirname, "../Map.tsx"),
      "utf-8"
    );

    // There should be NO separate source creation for country boundaries
    expect(mapSource).not.toContain('"country-overlay-src"');
    expect(mapSource).not.toContain('"flash-country-src"');
    expect(mapSource).not.toContain('"siren-country-src"');

    // All three should reference the shared constant
    const overlaySection = mapSource.slice(
      mapSource.indexOf("Country border/fill overlay")
    );
    const flashSection = mapSource.slice(
      mapSource.indexOf("One-shot flash for strike")
    );
    const sirenSection = mapSource.slice(
      mapSource.indexOf("Sustained pulsing flash for siren")
    );

    expect(overlaySection).toContain("COUNTRY_BOUNDARIES_SRC");
    expect(flashSection).toContain("COUNTRY_BOUNDARIES_SRC");
    expect(sirenSection).toContain("COUNTRY_BOUNDARIES_SRC");
  });

  it("does NOT remove the shared source when individual overlays clean up", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const mapSource = fs.readFileSync(
      path.resolve(__dirname, "../Map.tsx"),
      "utf-8"
    );

    // Country overlay cleanup should not removeSource
    const countryOverlayCleanup = mapSource.slice(
      mapSource.indexOf("Country border/fill overlay"),
      mapSource.indexOf("Country name")
    );
    expect(countryOverlayCleanup).not.toContain("removeSource");

    // Siren cleanup should not removeSource
    const sirenSection = mapSource.slice(
      mapSource.indexOf("Sustained pulsing flash for siren"),
      mapSource.indexOf("return <div ref={mapContainer}")
    );
    expect(sirenSection).not.toContain("removeSource");
  });

  it("only creates ONE country-boundaries vector source total", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const mapSource = fs.readFileSync(
      path.resolve(__dirname, "../Map.tsx"),
      "utf-8"
    );

    // Count occurrences of "mapbox://mapbox.country-boundaries-v1"
    const matches = mapSource.match(/mapbox:\/\/mapbox\.country-boundaries-v1/g);
    // Should only appear once — in addIncidentLayers
    expect(matches).toHaveLength(1);
  });
});

describe("FIRMS overlay — setData + visibility optimization", () => {
  it("uses setData when FIRMS source already exists instead of recreating", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const mapSource = fs.readFileSync(
      path.resolve(__dirname, "../Map.tsx"),
      "utf-8"
    );

    const firmsSection = mapSource.slice(
      mapSource.indexOf("FIRMS thermal hotspot overlay"),
      mapSource.indexOf("Country border/fill overlay")
    );

    // Should use setData pattern
    expect(firmsSection).toContain("existingSrc.setData(firmsGeoJSON)");

    // Should use visibility toggle
    expect(firmsSection).toContain('setLayoutProperty(firmsGlowId, "visibility"');
    expect(firmsSection).toContain('setLayoutProperty(firmsLayerId, "visibility"');

    // Cleanup should hide layers, not remove source
    expect(firmsSection).toContain("hideLayers");
    expect(firmsSection).not.toContain("removeSource");
  });
});

describe("HeatmapMap — stable refs prevent re-creation", () => {
  it("creates exactly ONE map instance on mount", () => {
    render(<HeatmapMap onAreaSelect={() => {}} />);

    expect(mapConstructorCallCount).toBe(1);
  });

  it("does NOT re-create the map when onAreaSelect callback changes", () => {
    const cb1 = vi.fn();
    const cb2 = vi.fn();

    const { rerender } = render(<HeatmapMap onAreaSelect={cb1} />);

    expect(mapConstructorCallCount).toBe(1);

    rerender(<HeatmapMap onAreaSelect={cb2} />);

    expect(mapConstructorCallCount).toBe(1);
  });

  it("uses ref pattern for onAreaSelect callback", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const heatmapSource = fs.readFileSync(
      path.resolve(__dirname, "../HeatmapMap.tsx"),
      "utf-8"
    );

    expect(heatmapSource).toContain("onAreaSelectRef");
    expect(heatmapSource).toContain("onAreaSelectRef.current");
    expect(heatmapSource).toContain("}, []);");
  });
});

describe("Map init useEffect — empty dependency array", () => {
  it("uses refs and empty deps to prevent re-creation", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const mapSource = fs.readFileSync(
      path.resolve(__dirname, "../Map.tsx"),
      "utf-8"
    );

    const initSection = mapSource.slice(
      mapSource.indexOf("// Initialize map"),
      mapSource.indexOf("// Handle map style changes")
    );

    // Should use refs, not direct values
    expect(initSection).toContain("addIncidentLayersRef.current(m)");
    expect(initSection).toContain("onMapReadyRef.current?.(m)");

    // Should have empty deps
    expect(initSection).toContain("}, []);");

    // Should NOT have addIncidentLayers or onMapReady in deps
    expect(initSection).not.toContain("addIncidentLayers]");
    expect(initSection).not.toContain("onMapReady]");
  });

  it("has stable refs declared for addIncidentLayers and onMapReady", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const mapSource = fs.readFileSync(
      path.resolve(__dirname, "../Map.tsx"),
      "utf-8"
    );

    expect(mapSource).toContain("const addIncidentLayersRef = useRef(addIncidentLayers)");
    expect(mapSource).toContain("addIncidentLayersRef.current = addIncidentLayers");
    expect(mapSource).toContain("const onMapReadyRef = useRef(onMapReady)");
    expect(mapSource).toContain("onMapReadyRef.current = onMapReady");
  });
});
