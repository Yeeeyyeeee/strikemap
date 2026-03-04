/**
 * Sentinel Hub Process API client.
 * Executes evalscripts for L2A RGB with SCL cloud masking,
 * Sentinel-1 SAR (VV+VH), and super-resolution.
 */

import sharp from "sharp";
import { execFile } from "child_process";
import { promisify } from "util";
import { join } from "path";
import { tmpdir } from "os";
import { writeFile, readFile, unlink } from "fs/promises";
import { randomBytes } from "crypto";

const execFileAsync = promisify(execFile);

const PROCESS_URL = "https://sh.dataspace.copernicus.eu/api/v1/process";

// Bounding box half-size in degrees (~900m at equator)
const BBOX_SIZE_DEG = 0.008;

// Default output dimensions
const IMG_WIDTH = 1024;
const IMG_HEIGHT = 1024;

// ─── Evalscripts ────────────────────────────────────────────────

/**
 * L2A true-color RGB from 10m bands (B04, B03, B02).
 * No SCL masking — mosaickingOrder: "leastCC" already picks the clearest image.
 * Reflectance DN scaled to 0-255 with 2.5x gain for natural brightness.
 */
const L2A_RGB_EVALSCRIPT = `//VERSION=3
function setup() {
  return {
    input: [{ bands: ["B02", "B03", "B04"], units: "DN" }],
    output: { bands: 3, sampleType: "UINT8" }
  };
}
function evaluatePixel(sample) {
  var gain = 2.5;
  return [
    Math.min(255, Math.round(sample.B04 * gain / 10000 * 255)),
    Math.min(255, Math.round(sample.B03 * gain / 10000 * 255)),
    Math.min(255, Math.round(sample.B02 * gain / 10000 * 255))
  ];
}`;

/**
 * Sentinel-1 GRD VV+VH backscatter composite.
 * RGB = VV (dB), VH (dB), VH/VV ratio.
 * Normalized from typical SAR range (-25 to 0 dB) to 0-255.
 */
const S1_SAR_EVALSCRIPT = `//VERSION=3
function setup() {
  return {
    input: [{ bands: ["VV", "VH"], units: "LINEAR_POWER" }],
    output: { bands: 3, sampleType: "UINT8" }
  };
}
function evaluatePixel(sample) {
  var vv_db = 10 * Math.log10(Math.max(sample.VV, 1e-10));
  var vh_db = 10 * Math.log10(Math.max(sample.VH, 1e-10));
  var vv_norm = Math.min(255, Math.max(0, Math.round((vv_db + 25) * (255 / 25))));
  var vh_norm = Math.min(255, Math.max(0, Math.round((vh_db + 25) * (255 / 25))));
  var ratio = Math.min(255, Math.max(0, Math.round((vh_db - vv_db + 10) * (255 / 20))));
  return [vv_norm, vh_norm, ratio];
}`;

// ─── Process API Core ───────────────────────────────────────────

/**
 * Fetch a processed image from the Sentinel Hub Process API.
 * Returns raw image buffer (PNG by default).
 */
export async function fetchProcessedImage(
  token: string,
  bbox: [number, number, number, number],
  dateFrom: string,
  dateTo: string,
  evalscript: string,
  dataType: string,
  width = IMG_WIDTH,
  height = IMG_HEIGHT,
  maxCloudCoverage?: number
): Promise<Buffer | null> {
  const dataFilter: Record<string, unknown> = {
    timeRange: {
      from: `${dateFrom}T00:00:00Z`,
      to: `${dateTo}T23:59:59Z`,
    },
    // Pick the least cloudy image when multiple exist in the time range
    mosaickingOrder: "leastCC",
  };
  if (maxCloudCoverage !== undefined) {
    dataFilter.maxCloudCoverage = maxCloudCoverage;
  }

  const body = {
    input: {
      bounds: {
        bbox,
        properties: {
          crs: "http://www.opengis.net/def/crs/EPSG/0/4326",
        },
      },
      data: [
        {
          type: dataType,
          dataFilter,
        },
      ],
    },
    output: {
      width,
      height,
      responses: [{ identifier: "default", format: { type: "image/png" } }],
    },
    evalscript,
  };

  const res = await fetch(PROCESS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "image/png",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) {
    console.error(
      `[sentinelProcess] Process API failed (${res.status}):`,
      await res.text().catch(() => "")
    );
    return null;
  }

  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// ─── WMS Fallback ───────────────────────────────────────────────

const WMS_BASE = "https://sh.dataspace.copernicus.eu/ogc/wms";

/**
 * Build a WMS 1.3.0 URL for Sentinel Hub. Used as fallback when Process API fails.
 */
function buildWmsUrl(
  instanceId: string,
  lat: number,
  lng: number,
  dateRange: string,
  maxCC: number,
  width: number,
  height: number
): string {
  const minLat = lat - BBOX_SIZE_DEG;
  const maxLat = lat + BBOX_SIZE_DEG;
  const minLng = lng - BBOX_SIZE_DEG;
  const maxLng = lng + BBOX_SIZE_DEG;
  // WMS 1.3.0 + EPSG:4326 uses lat,lng axis order (Y,X)
  const bbox = `${minLat},${minLng},${maxLat},${maxLng}`;

  const params = new URLSearchParams({
    SERVICE: "WMS",
    REQUEST: "GetMap",
    VERSION: "1.3.0",
    FORMAT: "image/png",
    TRANSPARENT: "false",
    LAYERS: "TRUE-COLOR",
    CRS: "EPSG:4326",
    BBOX: bbox,
    WIDTH: String(width),
    HEIGHT: String(height),
    TIME: dateRange,
    MAXCC: String(maxCC),
  });

  return `${WMS_BASE}/${instanceId}?${params.toString()}`;
}

/**
 * Download an image via WMS (fallback method).
 */
async function fetchWmsImage(
  token: string,
  instanceId: string,
  lat: number,
  lng: number,
  dateFrom: string,
  dateTo: string,
  maxCC: number,
  width: number,
  height: number
): Promise<Buffer | null> {
  const dateRange = `${dateFrom}/${dateTo}`;
  const url = buildWmsUrl(instanceId, lat, lng, dateRange, maxCC, width, height);

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(20000),
  });

  if (!res.ok) {
    console.error(`[sentinelProcess] WMS fallback failed (${res.status})`);
    return null;
  }

  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// ─── L2A RGB ────────────────────────────────────────────────────

/**
 * Fetch L2A true-color RGB for a date range.
 * Tries Process API first (SCL cloud masking, band-level control).
 * Falls back to WMS TRUE-COLOR if Process API fails.
 */
export async function fetchL2ARGB(
  token: string,
  lat: number,
  lng: number,
  dateFrom: string,
  dateTo: string,
  width = IMG_WIDTH,
  height = IMG_HEIGHT
): Promise<Buffer | null> {
  const bbox: [number, number, number, number] = [
    lng - BBOX_SIZE_DEG,
    lat - BBOX_SIZE_DEG,
    lng + BBOX_SIZE_DEG,
    lat + BBOX_SIZE_DEG,
  ];

  // Try Process API first with relaxed cloud filter (50% — leastCC mosaicking still picks clearest)
  const processResult = await fetchProcessedImage(
    token,
    bbox,
    dateFrom,
    dateTo,
    L2A_RGB_EVALSCRIPT,
    "sentinel-2-l2a",
    width,
    height,
    50
  );

  if (processResult) return processResult;

  // Retry without any cloud cover filter — better a cloudy image than none
  console.warn(
    "[sentinelProcess] Process API (50% CC) returned nothing, retrying without CC filter"
  );
  const retryResult = await fetchProcessedImage(
    token,
    bbox,
    dateFrom,
    dateTo,
    L2A_RGB_EVALSCRIPT,
    "sentinel-2-l2a",
    width,
    height
  );

  if (retryResult) return retryResult;

  // Fallback: WMS TRUE-COLOR (proven to work, uses instance configuration)
  console.warn("[sentinelProcess] Process API failed, falling back to WMS");
  const instanceId = process.env.SENTINEL_HUB_INSTANCE_ID;
  if (!instanceId) {
    console.error("[sentinelProcess] No SENTINEL_HUB_INSTANCE_ID for WMS fallback");
    return null;
  }

  return fetchWmsImage(token, instanceId, lat, lng, dateFrom, dateTo, 100, width, height);
}

// ─── Sentinel-1 SAR ────────────────────────────────────────────

/**
 * Fetch Sentinel-1 GRD SAR image (VV+VH composite) for a specific date range.
 * Sentinel-1 has 6-12 day revisit, so wider date ranges may be needed.
 */
export async function fetchS1SAR(
  token: string,
  lat: number,
  lng: number,
  dateFrom: string,
  dateTo: string,
  width = IMG_WIDTH,
  height = IMG_HEIGHT
): Promise<Buffer | null> {
  const bbox: [number, number, number, number] = [
    lng - BBOX_SIZE_DEG,
    lat - BBOX_SIZE_DEG,
    lng + BBOX_SIZE_DEG,
    lat + BBOX_SIZE_DEG,
  ];

  return fetchProcessedImage(
    token,
    bbox,
    dateFrom,
    dateTo,
    S1_SAR_EVALSCRIPT,
    "sentinel-1-grd",
    width,
    height
  );
}

// ─── Super-Resolution ───────────────────────────────────────────

/**
 * Attempt SEN2SR super-resolution (4x, 10m → 2.5m).
 * Falls back to Sharp lanczos3 upscale if Python/model unavailable.
 */
export async function superResolve(
  input: Buffer
): Promise<{ buffer: Buffer; method: "sen2sr" | "lanczos3" }> {
  // Skip Python on Vercel — only Sharp fallback available
  if (process.env.VERCEL === "1") {
    return sharpUpscale(input);
  }

  const tmpId = randomBytes(8).toString("hex");
  const inputPath = join(tmpdir(), `sr_in_${tmpId}.png`);
  const outputPath = join(tmpdir(), `sr_out_${tmpId}.png`);

  try {
    // Write input to temp file
    await writeFile(inputPath, input);

    // Try running SEN2SR Python script
    const scriptPath = join(process.cwd(), "scripts", "satellite", "superres.py");
    await execFileAsync("python3", [scriptPath, inputPath, outputPath], {
      timeout: 120000, // 2 minute timeout for ML inference
    });

    const result = await readFile(outputPath);
    return { buffer: result, method: "sen2sr" };
  } catch {
    // Python/SEN2SR not available — fall back to Sharp
    return sharpUpscale(input);
  } finally {
    // Clean up temp files
    await unlink(inputPath).catch(() => {});
    await unlink(outputPath).catch(() => {});
  }
}

/** Sharp lanczos3 4x upscale fallback. */
async function sharpUpscale(input: Buffer): Promise<{ buffer: Buffer; method: "lanczos3" }> {
  const meta = await sharp(input).metadata();
  const w = (meta.width || IMG_WIDTH) * 4;
  const h = (meta.height || IMG_HEIGHT) * 4;

  const buffer = await sharp(input)
    .resize(w, h, { kernel: sharp.kernel.lanczos3 })
    .png()
    .toBuffer();

  return { buffer, method: "lanczos3" };
}
