/**
 * Telegram Bot API client for broadcasting to a channel.
 * Sends two distinct message types:
 *   1. STRIKE alerts — enriched incidents with map coords, location pin, media
 *   2. FEED posts   — raw channel posts forwarded with media
 *
 * Required env vars:
 *   TELEGRAM_BOT_TOKEN  — from @BotFather
 *   TELEGRAM_CHANNEL_ID — e.g. "@iranaim" or "-1001234567890"
 */

import { Incident } from "./types";
import { ChannelPost } from "./telegram";
import { generateStrikeMapImage } from "./mapImage";

const API = "https://api.telegram.org/bot";

function getToken(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not set");
  return token;
}

function getChannelId(): string {
  const id = process.env.TELEGRAM_CHANNEL_ID;
  if (!id) throw new Error("TELEGRAM_CHANNEL_ID is not set");
  return id;
}

/** Escape special chars for Telegram MarkdownV2 */
function esc(text: string): string {
  return text.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, "\\$1");
}

// ─── Low-level API helpers ──────────────────────────────────────

async function apiCall(method: string, body: Record<string, unknown>): Promise<boolean> {
  const token = getToken();
  const res = await fetch(`${API}${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    console.error(`[bot] ${method} failed (${res.status}):`, text);
    return false;
  }
  return true;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function apiCallJson(method: string, body: Record<string, unknown>): Promise<any> {
  const token = getToken();
  const res = await fetch(`${API}${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data?.result || null;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * Download a file from a URL and re-upload it to the channel via multipart.
 * This avoids CDN URL expiration issues.
 */
async function downloadAndSendPhoto(url: string, caption?: string): Promise<boolean> {
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!resp.ok) return false;
    const blob = await resp.blob();
    const form = new FormData();
    form.append("chat_id", getChannelId());
    form.append("photo", blob, "photo.jpg");
    if (caption) {
      form.append("caption", caption);
      form.append("parse_mode", "MarkdownV2");
    }
    const token = getToken();
    const res = await fetch(`${API}${token}/sendPhoto`, { method: "POST", body: form });
    if (!res.ok) {
      console.error(`[bot] downloadAndSendPhoto failed (${res.status}):`, await res.text());
      return false;
    }
    return true;
  } catch (err) {
    console.error("[bot] downloadAndSendPhoto error:", err);
    return false;
  }
}

async function downloadAndSendVideo(url: string, caption?: string): Promise<boolean> {
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!resp.ok) return false;
    const blob = await resp.blob();
    // Skip videos > 20MB (Telegram Bot API limit)
    if (blob.size > 20 * 1024 * 1024) {
      console.warn(`[bot] Video too large (${(blob.size / 1024 / 1024).toFixed(1)}MB), skipping`);
      return false;
    }
    const form = new FormData();
    form.append("chat_id", getChannelId());
    form.append("video", blob, "video.mp4");
    if (caption) {
      form.append("caption", caption);
      form.append("parse_mode", "MarkdownV2");
    }
    const token = getToken();
    const res = await fetch(`${API}${token}/sendVideo`, { method: "POST", body: form });
    if (!res.ok) {
      console.error(`[bot] downloadAndSendVideo failed (${res.status}):`, await res.text());
      return false;
    }
    return true;
  } catch (err) {
    console.error("[bot] downloadAndSendVideo error:", err);
    return false;
  }
}

/** Download media from URLs and re-upload them as a single grouped message */
async function downloadAndSendMediaGroup(
  media: { type: "photo" | "video"; url: string }[],
  caption?: string,
): Promise<boolean> {
  if (media.length === 0) return true;
  // For single items, use direct upload
  if (media.length === 1) {
    return media[0].type === "video"
      ? downloadAndSendVideo(media[0].url, caption)
      : downloadAndSendPhoto(media[0].url, caption);
  }

  // Download all files in parallel, cap at 10 (Telegram limit)
  const items = media.slice(0, 10);
  const downloads = await Promise.all(
    items.map(async (m, i) => {
      try {
        const timeout = m.type === "video" ? 30000 : 10000;
        const resp = await fetch(m.url, { signal: AbortSignal.timeout(timeout) });
        if (!resp.ok) return null;
        const blob = await resp.blob();
        // Skip oversized videos
        if (m.type === "video" && blob.size > 20 * 1024 * 1024) return null;
        const ext = m.type === "video" ? "mp4" : "jpg";
        return { index: i, type: m.type, blob, name: `file${i}.${ext}` };
      } catch {
        return null;
      }
    })
  );

  const valid = downloads.filter(Boolean) as { index: number; type: string; blob: Blob; name: string }[];
  if (valid.length === 0) return false;

  // If only one survived, send as single
  if (valid.length === 1) {
    const v = valid[0];
    return v.type === "video"
      ? downloadAndSendVideo(media[v.index].url, caption)
      : downloadAndSendPhoto(media[v.index].url, caption);
  }

  // Build multipart form with all files as attachments
  try {
    const form = new FormData();
    form.append("chat_id", getChannelId());

    const mediaArr = valid.map((v, idx) => {
      const attachKey = `file${idx}`;
      form.append(attachKey, v.blob, v.name);
      return {
        type: v.type,
        media: `attach://${attachKey}`,
        ...(idx === 0 && caption ? { caption, parse_mode: "MarkdownV2" } : {}),
      };
    });

    form.append("media", JSON.stringify(mediaArr));

    const token = getToken();
    const res = await fetch(`${API}${token}/sendMediaGroup`, { method: "POST", body: form });
    if (!res.ok) {
      console.error(`[bot] downloadAndSendMediaGroup failed (${res.status}):`, await res.text());
      return false;
    }
    return true;
  } catch (err) {
    console.error("[bot] downloadAndSendMediaGroup error:", err);
    return false;
  }
}

/** Send a MarkdownV2 text message */
export async function sendMessage(text: string): Promise<boolean> {
  return apiCall("sendMessage", {
    chat_id: getChannelId(),
    text,
    parse_mode: "MarkdownV2",
    disable_web_page_preview: true,
  });
}

/**
 * Forward the original message from a public source channel.
 * This preserves all media (photos, videos, documents) perfectly.
 * Returns true if forwarded successfully.
 */
async function forwardOriginal(channelUsername: string, messageId: string): Promise<boolean> {
  const numericId = messageId.split("/").pop() || "";
  if (!numericId || isNaN(Number(numericId))) return false;
  return apiCall("forwardMessage", {
    chat_id: getChannelId(),
    from_chat_id: `@${channelUsername}`,
    message_id: Number(numericId),
  });
}

/** Send a photo from a Buffer (e.g. watermarked map image) */
async function sendPhotoBuffer(buffer: Buffer, caption?: string): Promise<boolean> {
  try {
    const form = new FormData();
    form.append("chat_id", getChannelId());
    form.append("photo", new Blob([new Uint8Array(buffer)], { type: "image/jpeg" }), "map.jpg");
    form.append("disable_notification", "true");
    if (caption) {
      form.append("caption", caption);
      form.append("parse_mode", "MarkdownV2");
    }
    const token = getToken();
    const res = await fetch(`${API}${token}/sendPhoto`, { method: "POST", body: form });
    if (!res.ok) {
      console.error(`[bot] sendPhotoBuffer failed (${res.status}):`, await res.text());
      return false;
    }
    return true;
  } catch (err) {
    console.error("[bot] sendPhotoBuffer error:", err);
    return false;
  }
}

/** Send a location pin (silent) */
async function sendLocation(lat: number, lng: number): Promise<boolean> {
  return apiCall("sendLocation", {
    chat_id: getChannelId(),
    latitude: lat,
    longitude: lng,
    disable_notification: true,
  });
}

/** Send a single photo with optional MarkdownV2 caption */
async function sendPhoto(photoUrl: string, caption?: string): Promise<boolean> {
  return apiCall("sendPhoto", {
    chat_id: getChannelId(),
    photo: photoUrl,
    ...(caption ? { caption, parse_mode: "MarkdownV2" } : {}),
  });
}

/** Send a single video with optional MarkdownV2 caption */
async function sendVideo(videoUrl: string, caption?: string): Promise<boolean> {
  return apiCall("sendVideo", {
    chat_id: getChannelId(),
    video: videoUrl,
    ...(caption ? { caption, parse_mode: "MarkdownV2" } : {}),
  });
}

/**
 * Send a media group (2-10 items). Caption goes on the first item.
 * Returns false if the API call fails.
 */
async function sendMediaGroup(
  media: { type: "photo" | "video"; url: string }[],
  caption?: string,
): Promise<boolean> {
  if (media.length === 0) return true;
  if (media.length === 1) {
    // Telegram requires >=2 items for sendMediaGroup, fall back to single
    return media[0].type === "video"
      ? sendVideo(media[0].url, caption)
      : sendPhoto(media[0].url, caption);
  }

  const items = media.slice(0, 10).map((m, i) => ({
    type: m.type,
    media: m.url,
    ...(i === 0 && caption ? { caption, parse_mode: "MarkdownV2" } : {}),
  }));

  return apiCall("sendMediaGroup", {
    chat_id: getChannelId(),
    media: items,
  });
}

// ─── Formatting ─────────────────────────────────────────────────

/** Build a STRIKE message from an enriched incident */
export function formatIncident(inc: Incident, siteUrl: string): string {
  const side =
    inc.side === "iran"
      ? "\u{1F1EE}\u{1F1F7} Iran / Proxy"
      : inc.side === "israel"
        ? "\u{1F1EE}\u{1F1F1} Israel"
        : inc.side === "us"
          ? "\u{1F1FA}\u{1F1F8} United States"
          : "\u{1F1FA}\u{1F1F8}\u{1F1EE}\u{1F1F1} US\\-Israel";

  const lines: string[] = [];

  lines.push(`\u{203C}\u{FE0F}\u{26A0}\u{FE0F} *STRIKE ALERT* \u{26A0}\u{FE0F}\u{203C}\u{FE0F}`);
  lines.push("");
  lines.push(`\u{1F4CD} *Location:* ${esc(inc.location || "Unknown")}`);
  lines.push(`\u{2694}\u{FE0F} *By:* ${side}`);

  if (inc.weapon) {
    lines.push(`\u{1F3AF} *Weapon:* ${esc(inc.weapon)}`);
  }
  if (inc.target_type) {
    lines.push(`\u{1F3ED} *Target:* ${esc(inc.target_type)}`);
  }
  if (inc.intercepted_by) {
    const outcome =
      inc.intercept_success === true
        ? "\u{2705} Intercepted"
        : inc.intercept_success === false
          ? "\u{274C} Failed"
          : "\u{2753} Unknown";
    lines.push(`\u{1F6E1}\u{FE0F} *Defense:* ${esc(inc.intercepted_by)} \\- ${outcome}`);
  }
  if (inc.missiles_fired) {
    lines.push(
      `\u{1F4CA} *Missiles:* ${inc.missiles_fired} fired${inc.missiles_intercepted != null ? `, ${inc.missiles_intercepted} intercepted` : ""}`
    );
  }
  if (inc.damage_severity) {
    const sevIcon =
      inc.damage_severity === "catastrophic" ? "\u{1F4A5}"
        : inc.damage_severity === "severe" ? "\u{1F525}"
          : inc.damage_severity === "moderate" ? "\u{26A0}\u{FE0F}"
            : "\u{2022}";
    lines.push(`${sevIcon} *Damage:* ${esc(inc.damage_severity)}`);
  }
  if ((inc.casualties_military || 0) > 0 || (inc.casualties_civilian || 0) > 0) {
    const parts: string[] = [];
    if (inc.casualties_military) parts.push(`${inc.casualties_military} military`);
    if (inc.casualties_civilian) parts.push(`${inc.casualties_civilian} civilian`);
    lines.push(`\u{1F480} *Casualties:* ${esc(parts.join(", "))}`);
  }

  if (inc.description) {
    lines.push("");
    lines.push(esc(inc.description.slice(0, 400)));
  }
  if (inc.timestamp) {
    const d = new Date(inc.timestamp);
    lines.push("");
    lines.push(`\u{1F552} ${esc(d.toUTCString())}`);
  }

  lines.push("");
  lines.push(`[\u{1F5FA}\u{FE0F} View Live Map](${esc(siteUrl)})`);

  return lines.join("\n");
}

/** Build a FEED message from a raw channel post */
export function formatFeedPost(post: ChannelPost, siteUrl: string): string {
  const lines: string[] = [];

  lines.push(`\u{1F4F0}\u{203C}\u{FE0F} *LIVE NEWS* \u{203C}\u{FE0F}\u{1F4F0}`);
  lines.push("");

  const text = post.text.slice(0, 600);
  lines.push(esc(text));

  if (post.location) {
    lines.push("");
    lines.push(`\u{1F4CD} ${esc(post.location)}`);
  }

  if (post.timestamp) {
    const d = new Date(post.timestamp);
    lines.push("");
    lines.push(`\u{1F552} ${esc(d.toUTCString())}`);
  }

  lines.push("");
  lines.push(`[\u{1F5FA}\u{FE0F} View Live Map](${esc(siteUrl)})`);

  return lines.join("\n");
}

// ─── High-level send functions ──────────────────────────────────

/**
 * Collect media items from a ChannelPost: images + video.
 */
function collectMedia(post: ChannelPost): { type: "photo" | "video"; url: string }[] {
  const items: { type: "photo" | "video"; url: string }[] = [];
  for (const url of post.imageUrls) {
    items.push({ type: "photo", url });
  }
  if (post.videoUrl) {
    items.push({ type: "video", url: post.videoUrl });
  }
  return items;
}

/**
 * Collect media items from an Incident's media array.
 */
function collectIncidentMedia(inc: Incident): { type: "photo" | "video"; url: string }[] {
  const items: { type: "photo" | "video"; url: string }[] = [];
  if (inc.media) {
    for (const m of inc.media) {
      items.push({ type: m.type === "video" ? "video" : "photo", url: m.url });
    }
  }
  // Fallback: if incident has video_url but no media array entry for it
  if (inc.video_url && !items.some((i) => i.url === inc.video_url)) {
    items.push({ type: "video", url: inc.video_url });
  }
  return items;
}

/**
 * Check if an incident is a confirmed hit (damage reported, casualties, etc.)
 * Only confirmed hits get a location pin — avoids leaking coords for unverified reports.
 */
function isConfirmedHit(inc: Incident): boolean {
  if (inc.damage_severity) return true;
  if ((inc.casualties_military || 0) > 0 || (inc.casualties_civilian || 0) > 0) return true;
  if (inc.damage_assessment) return true;
  // Check text for confirmation keywords
  const text = `${inc.description} ${inc.details || ""}`.toLowerCase();
  const hitKeywords = [
    "hit", "struck", "destroyed", "impact", "damage", "explosion",
    "casualties", "killed", "wounded", "injured", "collapsed",
    "direct hit", "confirmed strike", "successful strike",
  ];
  return hitKeywords.some((kw) => text.includes(kw));
}

/**
 * Send a STRIKE notification — forward original post (media), then analysis text.
 * Location pin only for confirmed hits.
 */
export async function sendIncident(
  inc: Incident,
  post: ChannelPost | null,
  siteUrl: string,
): Promise<boolean> {
  // 1. Map image with watermark — only for confirmed hits
  if (isConfirmedHit(inc) && inc.lat && inc.lng && (inc.lat !== 0 || inc.lng !== 0)) {
    const mapImg = await generateStrikeMapImage(inc.lat, inc.lng).catch(() => null);
    if (mapImg) {
      await sendPhotoBuffer(mapImg).catch(() => {});
    } else {
      // Fallback to location pin if image generation fails
      await sendLocation(inc.lat, inc.lng).catch(() => {});
    }
    await sleep(300);
  }

  // 2. Forward the original Telegram post (preserves all media perfectly)
  let forwarded = false;
  if (post) {
    const msgId = post.id.split("/").pop() || "";
    if (msgId) {
      forwarded = await forwardOriginal(post.channelUsername, msgId);
      if (forwarded) await sleep(300);
    }
  }

  const caption = formatIncident(inc, siteUrl);

  // 3. If forwarding failed, download media and re-upload
  if (!forwarded) {
    let media = post ? collectMedia(post) : collectIncidentMedia(inc);
    if (media.length === 0 && post) media = collectIncidentMedia(inc);

    if (media.length > 0) {
      // Try download + re-upload (handles expired CDN URLs better)
      const ok = await downloadAndSendMediaGroup(media, caption);
      if (ok) return true;
      // If that also failed, try direct URL method as last resort
      const ok2 = await sendMediaGroup(media, caption);
      if (ok2) return true;
    }
  }

  // 4. Send analysis text (always — either after forward or as standalone)
  return sendMessage(caption);
}

/**
 * Send a FEED post — forward original (media), then summary text.
 */
export async function sendFeedPost(post: ChannelPost, siteUrl: string): Promise<boolean> {
  // 1. Forward the original message with all media intact
  const msgId = post.id.split("/").pop() || "";
  let forwarded = false;
  if (msgId) {
    forwarded = await forwardOriginal(post.channelUsername, msgId);
    if (forwarded) await sleep(300);
  }

  const caption = formatFeedPost(post, siteUrl);

  // 2. If forward failed, download and re-upload media
  if (!forwarded) {
    const media = collectMedia(post);
    if (media.length > 0) {
      const ok = await downloadAndSendMediaGroup(media, caption);
      if (ok) return true;
      // Last resort: direct URL
      const ok2 = await sendMediaGroup(media, caption);
      if (ok2) return true;
    }
  }

  // 3. Send summary text (always)
  return sendMessage(caption);
}

/**
 * Broadcast multiple incidents (newest first, capped).
 */
export async function broadcastIncidents(
  incidents: Incident[],
  siteUrl: string,
  limit = 5,
): Promise<number> {
  const sorted = [...incidents].sort(
    (a, b) => (b.timestamp || "").localeCompare(a.timestamp || ""),
  );
  const batch = sorted.slice(0, limit);
  let sent = 0;

  for (const inc of batch) {
    const ok = await sendIncident(inc, null, siteUrl);
    if (ok) sent++;
    await sleep(1000);
  }

  return sent;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
