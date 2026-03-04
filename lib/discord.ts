/**
 * Discord webhook integration — posts to 3 channels:
 *   Strikes, Sirens/Alerts, Feed/News
 *
 * Zero npm dependencies. Uses native fetch().
 * All functions are fire-and-forget safe — they never throw.
 */

import { Incident } from "./types";
import { SirenAlert } from "./sirenDetector";

const SITE_URL = "https://strikemap.live";

// ── Core helper ──────────────────────────────────────────────

async function postToDiscord(webhookUrl: string, payload: object): Promise<boolean> {
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.error(
        `[discord] Webhook failed (${res.status}): ${await res.text().catch(() => "")}`
      );
      return false;
    }
    return true;
  } catch (err) {
    console.error("[discord] Webhook error:", err);
    return false;
  }
}

// ── Strike alerts ────────────────────────────────────────────

export async function sendDiscordStrike(inc: Incident): Promise<boolean> {
  const url = process.env.DISCORD_WEBHOOK_STRIKES;
  if (!url) return false;

  const color = inc.side === "iran" ? 0xef4444 : 0x3b82f6;
  const sideLabel = inc.side === "iran" ? "Iran" : "US / Israel";

  const fields: Array<{ name: string; value: string; inline?: boolean }> = [
    { name: "Side", value: sideLabel, inline: true },
  ];

  if (inc.weapon) fields.push({ name: "Weapon", value: inc.weapon, inline: true });
  if (inc.target_type) fields.push({ name: "Target", value: inc.target_type, inline: true });
  if (inc.damage_severity)
    fields.push({ name: "Damage", value: inc.damage_severity, inline: true });

  const casualties: string[] = [];
  if (inc.casualties_military) casualties.push(`${inc.casualties_military} military`);
  if (inc.casualties_civilian) casualties.push(`${inc.casualties_civilian} civilian`);
  if (casualties.length > 0) {
    fields.push({ name: "Casualties", value: casualties.join(", "), inline: true });
  }

  return postToDiscord(url, {
    embeds: [
      {
        color,
        title: `\u{1F6A8} STRIKE ALERT \u2014 ${inc.location || "Unknown Location"}`,
        url: SITE_URL,
        description: inc.description?.slice(0, 2048) || undefined,
        fields,
        footer: { text: `strikemap.live \u2022 ${inc.date}` },
        timestamp: inc.timestamp || new Date().toISOString(),
      },
    ],
  });
}

// ── Siren alerts ─────────────────────────────────────────────

export async function sendDiscordSiren(alert: SirenAlert): Promise<boolean> {
  const url = process.env.DISCORD_WEBHOOK_SIRENS;
  if (!url) return false;

  return postToDiscord(url, {
    embeds: [
      {
        color: 0xf97316,
        title: `\u26A0\uFE0F SIREN ALERT \u2014 ${alert.country}`,
        url: SITE_URL,
        description: alert.sourceText?.slice(0, 2048) || undefined,
        fields: [
          {
            name: "Activated",
            value: `<t:${Math.floor(alert.activatedAt / 1000)}:R>`,
            inline: true,
          },
        ],
        footer: { text: "strikemap.live" },
        timestamp: new Date(alert.activatedAt).toISOString(),
      },
    ],
  });
}

// ── Feed posts ───────────────────────────────────────────────

interface DiscordFeedPost {
  text: string;
  channelUsername: string;
  timestamp: string;
  imageUrls?: string[];
  location?: string;
}

export async function sendDiscordFeed(post: DiscordFeedPost): Promise<boolean> {
  const url = process.env.DISCORD_WEBHOOK_FEED;
  if (!url) return false;

  const embed: Record<string, unknown> = {
    color: 0x666666,
    title: post.location || "Latest Update",
    url: SITE_URL,
    description: post.text?.slice(0, 2048) || undefined,
    footer: { text: "strikemap.live" },
    timestamp: post.timestamp || new Date().toISOString(),
  };

  if (post.imageUrls?.length) {
    embed.image = { url: post.imageUrls[0] };
  }

  return postToDiscord(url, { embeds: [embed] });
}
