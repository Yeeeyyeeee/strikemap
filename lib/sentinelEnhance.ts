/**
 * Satellite image enhancement pipeline.
 * Light sharpen + saturation boost only. No CLAHE (causes wash-out with satellite tiles).
 * Conservative tuning for natural-looking damage assessment imagery.
 */

import sharp from "sharp";

export interface EnhanceOptions {
  sharpenSigma: number;
  sharpenFlat: number;
  sharpenJagged: number;
  saturation: number;
  brightness: number;
}

const DEFAULTS: EnhanceOptions = {
  sharpenSigma: 0.8,
  sharpenFlat: 1.0,
  sharpenJagged: 0.3,
  saturation: 1.2,
  brightness: 1.0,
};

/**
 * Light enhancement for satellite imagery.
 * Order: sharpen → brightness/saturation.
 * Returns PNG buffer (lossless intermediate; JPEG conversion at API boundary).
 */
export async function enhanceSatelliteImage(
  input: Buffer,
  opts?: Partial<EnhanceOptions>,
): Promise<Buffer> {
  const o = { ...DEFAULTS, ...opts };

  return sharp(input)
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
  threshold = 8,
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
