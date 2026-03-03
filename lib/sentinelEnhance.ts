/**
 * Satellite image enhancement pipeline.
 * CLAHE + gamma + unsharp mask + brightness/saturation.
 * Conservative tuning for natural-looking damage assessment imagery.
 */

import sharp from "sharp";

export interface EnhanceOptions {
  claheWidth: number;
  claheHeight: number;
  claheMaxSlope: number;
  sharpenSigma: number;
  sharpenFlat: number;
  sharpenJagged: number;
  gamma: number;
  saturation: number;
  brightness: number;
}

const DEFAULTS: EnhanceOptions = {
  claheWidth: 16,
  claheHeight: 16,
  claheMaxSlope: 3,
  sharpenSigma: 1.0,
  sharpenFlat: 1.0,
  sharpenJagged: 0.5,
  gamma: 0.92,
  saturation: 1.15,
  brightness: 1.03,
};

/**
 * Full enhancement pipeline for satellite imagery.
 * Order: CLAHE → gamma → unsharp mask → brightness/saturation.
 * Returns PNG buffer (lossless intermediate; JPEG conversion at API boundary).
 */
export async function enhanceSatelliteImage(
  input: Buffer,
  opts?: Partial<EnhanceOptions>,
): Promise<Buffer> {
  const o = { ...DEFAULTS, ...opts };

  return sharp(input)
    .clahe({ width: o.claheWidth, height: o.claheHeight, maxSlope: o.claheMaxSlope })
    .gamma(o.gamma)
    .sharpen({ sigma: o.sharpenSigma, m1: o.sharpenFlat, m2: o.sharpenJagged })
    .modulate({ brightness: o.brightness, saturation: o.saturation })
    .png()
    .toBuffer();
}

/**
 * Check if an image is effectively blank/black (WMS/Process API no-data response).
 * Returns true if mean brightness across channels < threshold.
 */
export async function isBlankImage(
  input: Buffer,
  threshold = 3,
): Promise<boolean> {
  try {
    const stats = await sharp(input).stats();
    const mean =
      stats.channels.reduce((sum, c) => sum + c.mean, 0) /
      stats.channels.length;
    return mean < threshold;
  } catch {
    return true; // treat unreadable images as blank
  }
}
