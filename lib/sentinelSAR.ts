/**
 * SAR (Synthetic Aperture Radar) change detection using Sentinel-1 GRD data.
 * Detects structural damage through clouds via backscatter change analysis.
 *
 * Uses a log-ratio change detection method in TypeScript.
 * Optional Python/SNAP coherence analysis available via scripts/satellite/sar_coherence.py.
 */

import sharp from "sharp";
import { fetchS1SAR } from "./sentinelProcess";

export interface SARChangeResult {
  changeMap: Buffer; // PNG buffer: colorized change intensity map
  changePercent: number; // percentage of pixels with significant change
  method: "log-ratio" | "coherence";
}

/**
 * SAR change detection between two dates using log-ratio method.
 *
 * Downloads Sentinel-1 GRD data (VV+VH) for before and after dates,
 * computes |log10(after/before)| per pixel, and thresholds for significant
 * structural change. Works through clouds unlike optical imagery.
 *
 * The before/after date ranges are wider (30 days) to account for
 * Sentinel-1's 6-12 day revisit time.
 */
export async function detectSARChange(
  token: string,
  lat: number,
  lng: number,
  beforeDate: string,
  afterDate: string
): Promise<SARChangeResult | null> {
  // Widen date ranges for Sentinel-1 (6-12 day revisit)
  const beforeFrom = shiftDate(beforeDate, -30);
  const afterTo = shiftDate(afterDate, 30);

  // Download SAR images for both windows
  const [beforeBuf, afterBuf] = await Promise.all([
    fetchS1SAR(token, lat, lng, beforeFrom, beforeDate),
    fetchS1SAR(token, lat, lng, afterDate, afterTo),
  ]);

  if (!beforeBuf || !afterBuf) {
    console.warn("[sentinelSAR] Could not fetch SAR data for one or both dates");
    return null;
  }

  try {
    // Convert both to greyscale raw pixels (use VV band = red channel from composite)
    const [beforeRaw, afterRaw] = await Promise.all([
      sharp(beforeBuf).greyscale().raw().toBuffer({ resolveWithObject: true }),
      sharp(afterBuf).greyscale().raw().toBuffer({ resolveWithObject: true }),
    ]);

    const width = beforeRaw.info.width;
    const height = beforeRaw.info.height;
    const totalPixels = width * height;

    // Compute log-ratio change detection
    // RGBA output: change intensity as color, alpha for transparency
    const changePixels = Buffer.alloc(totalPixels * 4);
    let changedCount = 0;

    for (let i = 0; i < totalPixels; i++) {
      const bVal = Math.max(beforeRaw.data[i], 1); // avoid log(0)
      const aVal = Math.max(afterRaw.data[i], 1);

      // Log-ratio: positive = increase in backscatter, negative = decrease
      // Structural damage typically shows as decrease (buildings flattened)
      const ratio = Math.abs(Math.log10(aVal / bVal));

      // Colorize by change intensity
      let r = 0,
        g = 0,
        b = 0,
        a = 0;

      if (ratio > 0.15) {
        changedCount++;

        if (ratio > 0.7) {
          // Severe change: red
          r = 239;
          g = 68;
          b = 68;
          a = 220;
        } else if (ratio > 0.4) {
          // Moderate change: orange
          r = 249;
          g = 115;
          b = 22;
          a = 180;
        } else {
          // Mild change: yellow
          r = 234;
          g = 179;
          b = 8;
          a = 140;
        }
      }
      // else: transparent (no significant change)

      const offset = i * 4;
      changePixels[offset] = r;
      changePixels[offset + 1] = g;
      changePixels[offset + 2] = b;
      changePixels[offset + 3] = a;
    }

    const changeMap = await sharp(changePixels, {
      raw: { width, height, channels: 4 },
    })
      .png()
      .toBuffer();

    const changePercent = (changedCount / totalPixels) * 100;

    return {
      changeMap,
      changePercent: Math.round(changePercent * 10) / 10,
      method: "log-ratio",
    };
  } catch (err) {
    console.error("[sentinelSAR] Change detection error:", err);
    return null;
  }
}

// ─── Helpers ────────────────────────────────────────────────────

function shiftDate(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}
