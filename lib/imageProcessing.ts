/**
 * Pure-TypeScript image processing utilities.
 * Histogram matching for normalizing before/after satellite imagery.
 */

import sharp from "sharp";

// ─── Histogram Utilities ────────────────────────────────────────

/** Compute per-channel histogram (256 bins) from raw pixel buffer. */
function computeHistograms(pixels: Buffer, channels: number): number[][] {
  const hists: number[][] = [];
  for (let c = 0; c < channels; c++) hists.push(new Array(256).fill(0));

  for (let i = 0; i < pixels.length; i += channels) {
    for (let c = 0; c < channels; c++) {
      hists[c][pixels[i + c]]++;
    }
  }
  return hists;
}

/** Compute cumulative distribution function from histogram. */
function computeCDF(histogram: number[]): Float64Array {
  const cdf = new Float64Array(256);
  cdf[0] = histogram[0];
  for (let i = 1; i < 256; i++) {
    cdf[i] = cdf[i - 1] + histogram[i];
  }
  // Normalize to [0, 1]
  const total = cdf[255];
  if (total > 0) {
    for (let i = 0; i < 256; i++) cdf[i] /= total;
  }
  return cdf;
}

/** Build lookup table mapping source CDF to reference CDF. */
function buildLookupTable(srcCDF: Float64Array, refCDF: Float64Array): Uint8Array {
  const lut = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    let j = 0;
    while (j < 255 && refCDF[j] < srcCDF[i]) j++;
    lut[i] = j;
  }
  return lut;
}

// ─── Public API ─────────────────────────────────────────────────

/**
 * Histogram matching: adjust target image to match the tonal distribution
 * of a reference image. Normalizes brightness/color between before and after
 * satellite images so differences reflect actual ground changes, not
 * atmospheric or sensor variation.
 *
 * Both inputs should be PNG or JPEG buffers. Returns PNG buffer.
 */
export async function histogramMatch(target: Buffer, reference: Buffer): Promise<Buffer> {
  // Decode both images to raw RGB pixels
  const [tgtRaw, refRaw] = await Promise.all([
    sharp(target).removeAlpha().raw().toBuffer({ resolveWithObject: true }),
    sharp(reference).removeAlpha().raw().toBuffer({ resolveWithObject: true }),
  ]);

  const channels = tgtRaw.info.channels; // should be 3 (RGB)
  const tgtPixels = Buffer.from(tgtRaw.data); // mutable copy

  // Compute histograms
  const tgtHists = computeHistograms(tgtPixels, channels);
  const refHists = computeHistograms(refRaw.data, channels);

  // Build and apply lookup tables per channel
  for (let c = 0; c < channels; c++) {
    const srcCDF = computeCDF(tgtHists[c]);
    const refCDF = computeCDF(refHists[c]);
    const lut = buildLookupTable(srcCDF, refCDF);

    // Apply lookup
    for (let i = c; i < tgtPixels.length; i += channels) {
      tgtPixels[i] = lut[tgtPixels[i]];
    }
  }

  // Re-encode as PNG (lossless intermediate)
  return sharp(tgtPixels, {
    raw: {
      width: tgtRaw.info.width,
      height: tgtRaw.info.height,
      channels: channels as 3,
    },
  })
    .png()
    .toBuffer();
}
