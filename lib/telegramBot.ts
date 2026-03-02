/**
 * Telegram Bot API client for broadcasting incidents to a channel.
 * Uses plain fetch — no extra dependencies needed.
 *
 * Required env vars:
 *   TELEGRAM_BOT_TOKEN  — from @BotFather
 *   TELEGRAM_CHANNEL_ID — e.g. "@iranaim" or "-1001234567890"
 */

import { Incident } from "./types";
import { ChannelPost } from "./telegram";

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

/** Build a formatted Telegram message from an incident */
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

  lines.push(`\u{1F6A8} *NEW STRIKE DETECTED*`);
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
  if (inc.description) {
    lines.push("");
    lines.push(esc(inc.description.slice(0, 300)));
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

/** Send a MarkdownV2 message to the configured channel */
export async function sendMessage(text: string): Promise<boolean> {
  const token = getToken();
  const chatId = getChannelId();

  const res = await fetch(`${API}${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "MarkdownV2",
      disable_web_page_preview: false,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error(`[bot] sendMessage failed (${res.status}):`, body);
    return false;
  }

  return true;
}

/** Send a location pin followed by a text message */
export async function sendIncident(inc: Incident, siteUrl: string): Promise<boolean> {
  const token = getToken();
  const chatId = getChannelId();

  // Send location pin if we have coordinates
  if (inc.lat && inc.lng && (inc.lat !== 0 || inc.lng !== 0)) {
    await fetch(`${API}${token}/sendLocation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        latitude: inc.lat,
        longitude: inc.lng,
        disable_notification: true,
      }),
    }).catch(() => { /* non-critical */ });
  }

  const text = formatIncident(inc, siteUrl);
  return sendMessage(text);
}

/** Format a raw feed post for Telegram */
export function formatFeedPost(post: ChannelPost, siteUrl: string): string {
  const lines: string[] = [];

  lines.push(`\u{1F4E2} *${esc(post.channelUsername)}*`);
  lines.push("");

  // Post text (truncated)
  const text = post.text.slice(0, 500);
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

/** Send a feed post to the channel */
export async function sendFeedPost(post: ChannelPost, siteUrl: string): Promise<boolean> {
  const text = formatFeedPost(post, siteUrl);
  return sendMessage(text);
}

/** Broadcast multiple incidents (newest first, capped) */
export async function broadcastIncidents(
  incidents: Incident[],
  siteUrl: string,
  limit = 5
): Promise<number> {
  const sorted = [...incidents].sort(
    (a, b) => (b.timestamp || "").localeCompare(a.timestamp || "")
  );
  const batch = sorted.slice(0, limit);
  let sent = 0;

  for (const inc of batch) {
    const ok = await sendIncident(inc, siteUrl);
    if (ok) sent++;
    // Telegram rate limit: ~30 msg/sec to a channel, but be safe
    await new Promise((r) => setTimeout(r, 1000));
  }

  return sent;
}
