/**
 * Generate a static Mapbox map image with a strike marker
 * and a small StrikeMap banner watermark in the bottom-right corner.
 * Returns a JPEG buffer ready to upload to Telegram.
 */
import sharp from "sharp";
import path from "path";

const MAPBOX_STYLE = "mapbox/dark-v11";
const WIDTH = 600;
const HEIGHT = 400;
// @2x output dimensions
const W2 = WIDTH * 2;
const H2 = HEIGHT * 2;

const WATERMARK_WIDTH = 240; // px wide in the @2x image

export async function generateStrikeMapImage(lat: number, lng: number): Promise<Buffer | null> {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (!token) {
    console.error("[mapImage] NEXT_PUBLIC_MAPBOX_TOKEN not set");
    return null;
  }

  try {
    // Mapbox Static Images API with a red pin marker
    const marker = `pin-l-rocket+ef4444(${lng},${lat})`;
    const url = `https://api.mapbox.com/styles/v1/${MAPBOX_STYLE}/static/${marker}/${lng},${lat},8,0/${WIDTH}x${HEIGHT}@2x?access_token=${token}&logo=false&attribution=false`;

    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) {
      console.error(`[mapImage] Mapbox static API error: ${res.status}`);
      return null;
    }

    const mapBuffer = Buffer.from(await res.arrayBuffer());

    // Resize the twitter banner as a small watermark
    const bannerPath = path.join(process.cwd(), "public", "twitter-banner.png");
    const watermark = await sharp(bannerPath).resize(WATERMARK_WIDTH, null).toBuffer();
    const wmMeta = await sharp(watermark).metadata();
    const wmHeight = wmMeta.height || 80;

    // Composite: watermark bottom-right with padding
    const result = await sharp(mapBuffer)
      .composite([
        {
          input: watermark,
          top: H2 - wmHeight - 10,
          left: W2 - WATERMARK_WIDTH - 10,
        },
      ])
      .jpeg({ quality: 85 })
      .toBuffer();

    return result;
  } catch (err) {
    console.error("[mapImage] Failed to generate strike map image:", err);
    return null;
  }
}
