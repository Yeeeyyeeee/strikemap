/**
 * Telegram Bot Webhook — receives real-time updates from source channels.
 * When a source channel posts a new message, this endpoint:
 * 1. Checks if the channel is in TELEGRAM_CHANNELS
 * 2. Forwards the message (with media) to the broadcast channel
 * 3. Sends analysis text
 *
 * Setup: POST /api/telegram/webhook?setup=1&secret=CRON_SECRET
 * This registers the webhook URL with Telegram.
 */

import { NextRequest, NextResponse } from "next/server";
import { sendMessage, sendIncident, formatIncident } from "@/lib/telegramBot";
import { getConfiguredChannels, isIranRelated } from "@/lib/telegram";
import { enrichWithKeywords } from "@/lib/keywordEnricher";
import { applyEnrichment } from "@/lib/enrichmentUtils";
import { processSirenPosts, addManualSiren, clearSirenByCountry } from "@/lib/sirenDetector";
import { getRedis } from "@/lib/redis";
import { REDIS_BROADCAST_KEY } from "@/lib/constants";
import { Incident } from "@/lib/types";
import { isStrikeBroadcastDuplicate, recordStrikeBroadcast } from "@/lib/broadcastDedup";
import { sendDiscordStrike, sendDiscordSiren, sendDiscordFeed } from "@/lib/discord";

/** Parse SIREN_REPORTERS env var: "userId1:Country1,userId2:Country2" */
function getSirenReporters(): Map<number, string> {
  const raw = process.env.SIREN_REPORTERS || "";
  const map = new Map<number, string>();
  for (const entry of raw.split(",")) {
    const [id, country] = entry.trim().split(":");
    if (id && country) map.set(Number(id), country.trim());
  }
  return map;
}

export const maxDuration = 25;

const API = "https://api.telegram.org/bot";

/** POST — receive webhook updates from Telegram */
export async function POST(req: NextRequest) {
  // Setup mode: register webhook with Telegram
  const setup = req.nextUrl.searchParams.get("setup");
  if (setup === "1") {
    const secret = req.nextUrl.searchParams.get("secret");
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && secret !== cronSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      return NextResponse.json({ error: "TELEGRAM_BOT_TOKEN not set" }, { status: 500 });
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.VERCEL_URL;
    if (!siteUrl) {
      return NextResponse.json({ error: "No site URL configured" }, { status: 500 });
    }

    const webhookUrl = `${siteUrl.startsWith("http") ? siteUrl : `https://${siteUrl}`}/api/telegram/webhook`;
    const res = await fetch(`${API}${token}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: webhookUrl,
        allowed_updates: ["channel_post", "message"],
      }),
    });
    const data = await res.json();
    console.log("[webhook] Setup result:", data);
    return NextResponse.json({ ok: true, webhookUrl, telegram: data });
  }

  // Normal mode: process incoming update
  let update;
  try {
    update = await req.json();
  } catch {
    return NextResponse.json({ ok: true });
  }

  // Handle siren reporter group messages
  const groupMessage = update?.message;
  if (groupMessage) {
    const sirenGroupId = process.env.SIREN_GROUP_CHAT_ID;
    if (sirenGroupId && String(groupMessage.chat?.id) === sirenGroupId) {
      const userId = groupMessage.from?.id;
      const text = (groupMessage.text || "").trim().toLowerCase();
      const reporters = getSirenReporters();
      const country = userId ? reporters.get(userId) : undefined;

      if (country && (text === "sirens" || text === "end")) {
        const token = process.env.TELEGRAM_BOT_TOKEN!;
        let replyText: string;

        if (text === "sirens") {
          await addManualSiren(country);
          replyText = `\u26a0\ufe0f Sirens ACTIVATED for ${country}`;
          console.log(`[webhook] Siren reporter activated sirens for ${country} (user ${userId})`);
        } else {
          await clearSirenByCountry(country);
          replyText = `\u2705 Sirens CLEARED for ${country}`;
          console.log(`[webhook] Siren reporter cleared sirens for ${country} (user ${userId})`);
        }

        // Reply in the group chat
        await fetch(`${API}${token}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: sirenGroupId,
            text: replyText,
            reply_to_message_id: groupMessage.message_id,
          }),
        });

        return NextResponse.json({ ok: true, siren: true });
      }
    }
    // Not a siren reporter message — ignore non-channel-post updates
    return NextResponse.json({ ok: true });
  }

  // We only care about channel_post updates
  const channelPost = update?.channel_post;
  if (!channelPost) {
    return NextResponse.json({ ok: true });
  }

  const chat = channelPost.chat;
  if (!chat?.username) {
    return NextResponse.json({ ok: true });
  }

  // Check if this is from a configured source channel
  const channels = getConfiguredChannels();
  const username = chat.username.toLowerCase();
  if (!channels.some((c) => c.toLowerCase() === username)) {
    return NextResponse.json({ ok: true });
  }

  const messageId = channelPost.message_id;
  const postId = `${username}/${messageId}`;
  const text = channelPost.text || channelPost.caption || "";

  console.log(`[webhook] New post from @${username}: ${postId} — ${text.slice(0, 80)}`);

  // Atomic claim: add to sent set and check if it was already there
  const redis = getRedis();
  if (redis) {
    const added = await redis.sadd(REDIS_BROADCAST_KEY, postId as string);
    if (!added) {
      console.log(`[webhook] Already sent: ${postId}`);
      return NextResponse.json({ ok: true });
    }
  }

  // Process for siren detection
  const timestamp = channelPost.date
    ? new Date(channelPost.date * 1000).toISOString()
    : new Date().toISOString();

  const newSirenAlerts = await processSirenPosts([
    {
      id: postId,
      channelUsername: username,
      text,
      timestamp,
    },
  ]);

  // Send new siren alerts to Discord
  for (const alert of newSirenAlerts) {
    sendDiscordSiren(alert).catch(() => {});
  }

  // Check if this is a strike (has coordinates after enrichment)
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://strikemap.live";
  let sent = false;

  if (text && isIranRelated(text)) {
    const kwResult = enrichWithKeywords(text);
    if (kwResult?.lat && kwResult?.lng) {
      // Spatial dedup: skip if a nearby strike was already broadcast recently
      const isDup = await isStrikeBroadcastDuplicate(kwResult.lat, kwResult.lng);
      if (isDup) {
        console.log(
          `[webhook] STRIKE DEDUP: ${postId} → ${kwResult.location} (nearby strike already broadcast)`
        );
        // Mark as sent so we don't retry via broadcast route
        if (redis) await redis.sadd(REDIS_BROADCAST_KEY, postId as string);
        return NextResponse.json({ ok: true, dedup: true });
      }

      // It's a strike — build incident and send
      const inc: Incident = {
        id: `tg-${username}-${messageId}`,
        date: new Date().toISOString().split("T")[0],
        timestamp,
        location: kwResult.location || "",
        lat: kwResult.lat,
        lng: kwResult.lng,
        description: text.slice(0, 200),
        details: text,
        weapon: kwResult.weapon || "",
        target_type: kwResult.target_type || "",
        video_url: "",
        source_url: `https://t.me/${username}/${messageId}`,
        source: "telegram",
        side: kwResult.side,
        target_military: kwResult.target_military,
        telegram_post_id: postId,
      };

      applyEnrichment(inc, kwResult);

      // Forward the original message (preserves all media)
      const token = process.env.TELEGRAM_BOT_TOKEN!;
      const channelId = process.env.TELEGRAM_CHANNEL_ID!;
      const fwdRes = await fetch(`${API}${token}/forwardMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: channelId,
          from_chat_id: chat.id,
          message_id: messageId,
        }),
      });
      if (fwdRes.ok) {
        // Then send the analysis text
        const caption = formatIncident(inc, siteUrl);
        await sendMessage(caption);
        sent = true;
      } else {
        // Fallback to full sendIncident flow
        sent = await sendIncident(inc, null, siteUrl);
      }

      console.log(`[webhook] STRIKE sent: ${postId} → ${inc.location}`);
      await recordStrikeBroadcast(inc.lat, inc.lng);
      sendDiscordStrike(inc).catch(() => {});
    }
  }

  if (!sent && text) {
    // Regular feed post — forward with media, then send summary
    const token = process.env.TELEGRAM_BOT_TOKEN!;
    const channelId = process.env.TELEGRAM_CHANNEL_ID!;
    const fwdRes = await fetch(`${API}${token}/forwardMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: channelId,
        from_chat_id: chat.id,
        message_id: messageId,
      }),
    });

    if (fwdRes.ok) {
      sent = true;
      console.log(`[webhook] FEED forwarded: ${postId}`);
      sendDiscordFeed({
        text,
        channelUsername: username,
        timestamp,
      }).catch(() => {});
    } else {
      console.log(`[webhook] Forward failed for ${postId}, sending text only`);
      // Can't build a full ChannelPost without scraping, send text summary
      const escapedText = text.slice(0, 600).replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, "\\$1");
      const escapedUrl = siteUrl.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, "\\$1");
      await sendMessage(`${escapedText}\n\n[\u{1F5FA}\u{FE0F} View Live Map](${escapedUrl})`);
      sent = true;
    }
  }

  return NextResponse.json({ ok: true, sent });
}

/** GET — webhook info / setup instructions */
export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && secret !== cronSecret) {
    return NextResponse.json({ error: "Provide ?secret=CRON_SECRET" }, { status: 401 });
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "TELEGRAM_BOT_TOKEN not set" }, { status: 500 });
  }

  // Get current webhook info
  const res = await fetch(`${API}${token}/getWebhookInfo`);
  const data = await res.json();

  return NextResponse.json({
    webhookInfo: data.result,
    setupUrl: "POST /api/telegram/webhook?setup=1&secret=YOUR_CRON_SECRET",
    channels: getConfiguredChannels(),
  });
}
