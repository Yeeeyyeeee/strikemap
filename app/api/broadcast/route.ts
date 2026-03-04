import { NextResponse } from "next/server";
import { scrapeChannel, isIranRelated, getConfiguredChannels, postToIncident } from "@/lib/telegram";
import { enrichWithKeywords } from "@/lib/keywordEnricher";
import { applyEnrichment } from "@/lib/enrichmentUtils";
import { sendFeedPost, sendIncident } from "@/lib/telegramBot";
import { getRedis } from "@/lib/redis";
import { REDIS_BROADCAST_KEY, BROADCAST_MAX_PER_RUN, BROADCAST_SET_MAX_SIZE } from "@/lib/constants";
import { isStrikeBroadcastDuplicate, recordStrikeBroadcast } from "@/lib/broadcastDedup";
import { sendDiscordStrike, sendDiscordFeed } from "@/lib/discord";

export const maxDuration = 30;

export async function GET(req: Request) {
  // Auth check
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      console.log("[broadcast] Auth failed — missing or wrong CRON_SECRET");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  if (!process.env.TELEGRAM_BOT_TOKEN) {
    console.error("[broadcast] TELEGRAM_BOT_TOKEN is not set");
    return NextResponse.json({ error: "TELEGRAM_BOT_TOKEN not configured" }, { status: 500 });
  }
  if (!process.env.TELEGRAM_CHANNEL_ID) {
    console.error("[broadcast] TELEGRAM_CHANNEL_ID is not set");
    return NextResponse.json({ error: "TELEGRAM_CHANNEL_ID not configured" }, { status: 500 });
  }

  const channels = getConfiguredChannels();
  console.log(`[broadcast] Channels: ${channels.join(", ") || "(none)"}`);

  if (channels.length === 0) {
    return NextResponse.json({ error: "No channels configured" }, { status: 500 });
  }

  // Scrape latest posts from all channels
  const results = await Promise.all(
    channels.map((ch) => scrapeChannel(ch).catch((err) => {
      console.error(`[broadcast] Scrape ${ch} failed:`, err);
      return [];
    }))
  );

  const posts = results
    .flat()
    .filter((p) => p.text)
    .sort((a, b) => (b.timestamp > a.timestamp ? 1 : -1))
    .slice(0, 50);

  console.log(`[broadcast] Scraped ${posts.length} posts total`);

  if (posts.length === 0) {
    return NextResponse.json({ sent: 0, total: 0, strikes: 0, feed: 0, message: "No posts found" });
  }

  // Load set of already-sent post IDs from Redis
  const redis = getRedis();
  let sentIds = new Set<string>();
  if (redis) {
    const stored = await redis.smembers(REDIS_BROADCAST_KEY) as string[];
    if (stored) sentIds = new Set(stored);
    console.log(`[broadcast] ${sentIds.size} already-sent IDs in Redis`);
  } else {
    console.warn("[broadcast] No Redis — cannot track sent IDs, may re-send");
  }

  // Filter to only unsent posts
  const newPosts = posts.filter((p) => !sentIds.has(p.id));
  console.log(`[broadcast] ${newPosts.length} new posts (${posts.length - newPosts.length} already sent)`);

  if (newPosts.length === 0) {
    return NextResponse.json({ sent: 0, total: 0, strikes: 0, feed: 0, message: "No new posts" });
  }

  // Enrich Iran-related posts to detect strikes (posts that get map coords)
  for (const post of newPosts) {
    if (isIranRelated(post.text)) {
      const kwResult = enrichWithKeywords(post.text);
      if (kwResult) {
        post.lat = kwResult.lat;
        post.lng = kwResult.lng;
        post.location = kwResult.location;
      }
    }
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://strikemap.live";
  const batch = newPosts.slice(0, BROADCAST_MAX_PER_RUN);
  let sent = 0;
  let strikes = 0;
  let feed = 0;
  const newSentIds: string[] = [];

  for (const post of batch) {
    let ok = false;
    const isStrike = post.lat && post.lng && (post.lat !== 0 || post.lng !== 0);

    if (isStrike) {
      // Build a full enriched incident for the strike message
      const inc = postToIncident(post);
      const kwResult = enrichWithKeywords(post.text);
      if (kwResult) applyEnrichment(inc, kwResult);

      // Spatial dedup: skip if a nearby strike was already broadcast recently
      const isDup = await isStrikeBroadcastDuplicate(post.lat!, post.lng!);
      if (isDup) {
        console.log(`[broadcast] STRIKE DEDUP: ${post.id} → ${inc.location} (nearby strike already broadcast)`);
        newSentIds.push(post.id); // Mark as sent so we don't retry
        continue;
      }

      console.log(`[broadcast] Sending STRIKE: ${post.id} → ${inc.location}`);
      ok = await sendIncident(inc, post, siteUrl);
      if (ok) {
        strikes++;
        await recordStrikeBroadcast(post.lat!, post.lng!);
        sendDiscordStrike(inc).catch(() => {});
      }
    } else {
      console.log(`[broadcast] Sending FEED: ${post.id} (${post.channelUsername})`);
      ok = await sendFeedPost(post, siteUrl);
      if (ok) {
        feed++;
        sendDiscordFeed({
          text: post.text,
          channelUsername: post.channelUsername,
          timestamp: post.timestamp,
          imageUrls: post.imageUrls,
          location: post.location,
        }).catch(() => {});
      }
    }

    if (ok) {
      sent++;
      newSentIds.push(post.id);
    } else {
      console.error(`[broadcast] Failed to send ${post.id}`);
    }
    // Rate limit: 1s between messages
    await new Promise((r) => setTimeout(r, 1000));
  }

  // Persist sent IDs to Redis
  if (redis && newSentIds.length > 0) {
    await redis.sadd(REDIS_BROADCAST_KEY, ...(newSentIds as [string, ...string[]]));
    const size = await redis.scard(REDIS_BROADCAST_KEY);
    if (size > BROADCAST_SET_MAX_SIZE) {
      // Trim oldest half instead of nuking the entire set
      const allMembers = await redis.smembers(REDIS_BROADCAST_KEY) as string[];
      const toRemove = allMembers.slice(0, Math.floor(allMembers.length / 2));
      if (toRemove.length > 0) {
        await redis.srem(REDIS_BROADCAST_KEY, ...(toRemove as [string, ...string[]]));
      }
    }
  }

  console.log(`[broadcast] Done: ${sent} sent (${strikes} strikes, ${feed} feed) out of ${newPosts.length} new`);
  return NextResponse.json({ sent, total: newPosts.length, strikes, feed });
}
