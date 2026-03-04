#!/usr/bin/env node
// data-helper.mjs — Fetches incidents + downloads media from Telegram CDN

import { existsSync, mkdirSync, writeFileSync, readFileSync } from "fs";
import { dirname, join, basename } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FRAMES_DIR = join(__dirname, "frames");
const MEDIA_DIR = join(FRAMES_DIR, "media");
const BASE_URL = process.env.BASE_URL || "http://localhost:3000";

mkdirSync(MEDIA_DIR, { recursive: true });

// ── Fetch incidents from API ────────────────────────────────
async function fetchIncidents() {
  console.log(`Fetching incidents from ${BASE_URL}/api/incidents ...`);
  const res = await fetch(`${BASE_URL}/api/incidents`);
  if (!res.ok) {
    throw new Error(`API returned ${res.status}: ${res.statusText}`);
  }
  const data = await res.json();
  console.log(`  Got ${data.count} incidents`);
  return data.incidents;
}

// ── Check if URL is a direct video URL ──────────────────────
function isDirectVideoUrl(url) {
  if (!url) return false;
  return (
    url.includes("telesco.pe") ||
    url.includes("telegram") ||
    url.includes("cdn") ||
    /\.(mp4|webm|mov)(\?|$)/i.test(url)
  );
}

// ── Get all media from an incident ──────────────────────────
function getIncidentMedia(incident) {
  const media = [];

  // Prefer media array
  if (incident.media && incident.media.length > 0) {
    for (const item of incident.media) {
      media.push(item);
    }
  }

  // Fallback to video_url
  if (media.length === 0 && incident.video_url && isDirectVideoUrl(incident.video_url)) {
    media.push({ type: "video", url: incident.video_url });
  }

  return media;
}

// ── Download a file ─────────────────────────────────────────
async function downloadFile(url, destPath) {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      },
      redirect: "follow",
    });
    if (!res.ok) {
      console.log(`    HTTP ${res.status} for ${url}`);
      return false;
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    writeFileSync(destPath, buffer);
    const sizeMB = (buffer.length / (1024 * 1024)).toFixed(2);
    console.log(`    Downloaded: ${basename(destPath)} (${sizeMB} MB)`);
    return true;
  } catch (err) {
    console.log(`    Error downloading: ${err.message}`);
    return false;
  }
}

// ── Normalize a video to 1080x1920 vertical ─────────────────
function normalizeVideo(inputPath, outputPath, maxDuration = 5) {
  try {
    execSync(
      `ffmpeg -y -i "${inputPath}" \
        -vf "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=0x0a0a0a" \
        -t ${maxDuration} -c:v libx264 -preset fast -crf 23 -pix_fmt yuv420p -an \
        "${outputPath}"`,
      { stdio: "pipe" }
    );
    return true;
  } catch (err) {
    console.log(`    Normalization failed: ${err.message}`);
    return false;
  }
}

// ── Download media for incidents ────────────────────────────
async function downloadMedia(options = {}) {
  const { count = 5, incidentId = null, normalize = true } = options;

  const incidents = await fetchIncidents();
  let targetIncidents = incidents;

  // Filter to specific incident
  if (incidentId) {
    targetIncidents = incidents.filter((i) => i.id === incidentId);
    if (targetIncidents.length === 0) {
      console.error(`Incident not found: ${incidentId}`);
      return [];
    }
  }

  // Filter to incidents with video media and sort by date (newest first)
  const withVideo = targetIncidents
    .filter((i) => {
      const media = getIncidentMedia(i);
      return media.some((m) => m.type === "video");
    })
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, incidentId ? undefined : count);

  console.log(`\nDownloading media for ${withVideo.length} incident(s)...\n`);

  const downloaded = [];

  for (const incident of withVideo) {
    const media = getIncidentMedia(incident);
    const safeId = incident.id.replace(/[^a-zA-Z0-9_-]/g, "_");

    console.log(`  ${incident.location || "Unknown"} - ${incident.date || "?"}`);

    let mediaIndex = 0;
    for (const item of media) {
      if (item.type !== "video" || !item.url) continue;

      const ext = item.url.match(/\.(mp4|webm|mov)/i)?.[1] || "mp4";
      const rawFile = `${safeId}_${mediaIndex}_raw.${ext}`;
      const rawPath = join(MEDIA_DIR, rawFile);
      const normalizedFile = `${safeId}_${mediaIndex}.mp4`;
      const normalizedPath = join(MEDIA_DIR, normalizedFile);

      // Skip if already downloaded
      if (existsSync(normalizedPath)) {
        console.log(`    Skip: ${normalizedFile} already exists`);
        downloaded.push({
          path: normalizedPath,
          incident,
          mediaItem: item,
        });
        mediaIndex++;
        continue;
      }

      // Download raw file
      const ok = await downloadFile(item.url, rawPath);
      if (!ok) {
        mediaIndex++;
        continue;
      }

      // Normalize to vertical format
      if (normalize) {
        console.log(`    Normalizing to 1080x1920...`);
        if (normalizeVideo(rawPath, normalizedPath)) {
          // Remove raw file after normalization
          try {
            execSync(`rm "${rawPath}"`, { stdio: "pipe" });
          } catch {}
        } else {
          // Keep raw file as fallback
          execSync(`mv "${rawPath}" "${normalizedPath}"`, { stdio: "pipe" });
        }
      } else {
        execSync(`mv "${rawPath}" "${normalizedPath}"`, { stdio: "pipe" });
      }

      // Save companion metadata JSON
      const metaPath = join(MEDIA_DIR, `${safeId}_${mediaIndex}.json`);
      writeFileSync(
        metaPath,
        JSON.stringify(
          {
            incident_id: incident.id,
            location: incident.location,
            weapon: incident.weapon,
            side: incident.side,
            date: incident.date,
            timestamp: incident.timestamp,
            description: incident.description,
            source_url: item.url,
            telegram_post_id: incident.telegram_post_id,
          },
          null,
          2
        )
      );

      downloaded.push({
        path: normalizedPath,
        incident,
        mediaItem: item,
      });
      mediaIndex++;
    }

    // Also download images
    for (const item of media) {
      if (item.type !== "image" || !item.url) continue;

      const ext = item.url.match(/\.(jpg|jpeg|png|webp)/i)?.[1] || "jpg";
      const imgFile = `${safeId}_img_${mediaIndex}.${ext}`;
      const imgPath = join(MEDIA_DIR, imgFile);

      if (existsSync(imgPath)) {
        console.log(`    Skip: ${imgFile} already exists`);
        mediaIndex++;
        continue;
      }

      await downloadFile(item.url, imgPath);
      mediaIndex++;
    }

    // Rate limit between incidents
    await new Promise((r) => setTimeout(r, 300));
  }

  console.log(`\nDownloaded ${downloaded.length} video(s) to ${MEDIA_DIR}`);
  return downloaded;
}

// ── Export stats as JSON ────────────────────────────────────
async function exportStats() {
  const incidents = await fetchIncidents();
  const today = new Date().toISOString().split("T")[0];

  const stats = {
    generated_at: new Date().toISOString(),
    total_incidents: incidents.length,
    by_side: {},
    by_weapon: {},
    by_date: {},
    recent_24h: 0,
    recent_7d: 0,
    with_video: 0,
    total_casualties_military: 0,
    total_casualties_civilian: 0,
  };

  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;

  for (const incident of incidents) {
    // Count by side
    const side = incident.side || "unknown";
    stats.by_side[side] = (stats.by_side[side] || 0) + 1;

    // Count by weapon
    if (incident.weapon) {
      stats.by_weapon[incident.weapon] = (stats.by_weapon[incident.weapon] || 0) + 1;
    }

    // Count by date
    if (incident.date) {
      stats.by_date[incident.date] = (stats.by_date[incident.date] || 0) + 1;
    }

    // Recent counts
    const incidentDate = new Date(incident.date || incident.timestamp).getTime();
    if (now - incidentDate < day) stats.recent_24h++;
    if (now - incidentDate < 7 * day) stats.recent_7d++;

    // Video count
    const media = getIncidentMedia(incident);
    if (media.some((m) => m.type === "video")) stats.with_video++;

    // Casualties
    if (incident.casualties_military)
      stats.total_casualties_military += incident.casualties_military;
    if (incident.casualties_civilian)
      stats.total_casualties_civilian += incident.casualties_civilian;
  }

  const statsPath = join(FRAMES_DIR, "stats.json");
  writeFileSync(statsPath, JSON.stringify(stats, null, 2));
  console.log(`Stats exported to ${statsPath}`);
  console.log(
    `  Total: ${stats.total_incidents} | 24h: ${stats.recent_24h} | 7d: ${stats.recent_7d} | With video: ${stats.with_video}`
  );
  return stats;
}

// ── CLI ─────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || "media";

  // Parse options
  const options = {};
  for (let i = 1; i < args.length; i++) {
    switch (args[i]) {
      case "--count":
        options.count = parseInt(args[++i], 10);
        break;
      case "--incident-id":
        options.incidentId = args[++i];
        break;
      case "--no-normalize":
        options.normalize = false;
        break;
    }
  }

  switch (command) {
    case "media":
      await downloadMedia(options);
      break;

    case "stats":
      await exportStats();
      break;

    case "both":
      await downloadMedia(options);
      await exportStats();
      break;

    default:
      console.log(`Usage:
  node data-helper.mjs media [--count N] [--incident-id ID] [--no-normalize]
  node data-helper.mjs stats
  node data-helper.mjs both [--count N]

Commands:
  media   Download strike videos from Telegram CDN
  stats   Export incident statistics as JSON
  both    Download media and export stats`);
      break;
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
