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
import {
  sendMessage,
  sendFeedPost,
  sendIncident,
  formatIncident,
  apiCallJson,
} from "@/lib/telegramBot";
import { getConfiguredChannels, isIranRelated } from "@/lib/telegram";
import { enrichWithKeywords } from "@/lib/keywordEnricher";
import { applyEnrichment } from "@/lib/enrichmentUtils";
import { processSirenPosts } from "@/lib/sirenDetector";
import { getRedis } from "@/lib/redis";
import { REDIS_BROADCAST_KEY } from "@/lib/constants";
import { Incident } from "@/lib/types";

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
        allowed_updates: ["channel_post"],
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

  // Dedup: check if already sent
  const redis = getRedis();
  if (redis) {
    const alreadySent = await redis.sismember(REDIS_BROADCAST_KEY, postId);
    if (alreadySent) {
      console.log(`[webhook] Already sent: ${postId}`);
      return NextResponse.json({ ok: true });
    }
  }

  // Process for siren detection
  const timestamp = channelPost.date
    ? new Date(channelPost.date * 1000).toISOString()
    : new Date().toISOString();

  await processSirenPosts([{
    id: postId,
    channelUsername: username,
    text,
    timestamp,
  }]);

  // Check if this is a strike (has coordinates after enrichment)
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://strikemap.live";
  let sent = false;

  if (text && isIranRelated(text)) {
    const kwResult = enrichWithKeywords(text);
    if (kwResult?.lat && kwResult?.lng) {
      // It's a strike — build incident and send
      const inc: Incident = {
        id: `tg-${username}-${messageId}`,
        date: new Date().toISOString().split("T")[0],
        timestamp,
        location: kwResult.location || "",
        lat: kwResult.lat,
        lng: kwResult.lng,
        description: `[${username}] ${text.slice(0, 200)}`,
        details: text,
        weapon: kwResult.weapon || "",
        target_type: kwResult.target_type || "",
        video_url: "",
        source_url: `https://t.me/${username}/${messageId}`,
        source: "telegram",
        side: "iran",
        target_military: false,
        telegram_post_id: postId,
      };

      if (kwResult) applyEnrichment(inc, kwResult);

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
    } else {
      console.log(`[webhook] Forward failed for ${postId}, sending text only`);
      // Can't build a full ChannelPost without scraping, send text summary
      const escapedText = text.slice(0, 600).replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, "\\$1");
      const escapedUser = username.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, "\\$1");
      const escapedUrl = siteUrl.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, "\\$1");
      await sendMessage(
        `\u{1F4E2} *${escapedUser}*\n\n${escapedText}\n\n[\u{1F5FA}\u{FE0F} View Live Map](${escapedUrl})`
      );
      sent = true;
    }
  }

  // Mark as sent in Redis
  if (sent && redis) {
    await redis.sadd(REDIS_BROADCAST_KEY, postId as string);
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
