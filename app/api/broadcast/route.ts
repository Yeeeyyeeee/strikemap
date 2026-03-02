import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { scrapeChannel, isIranRelated, ChannelPost } from "@/lib/telegram";
import { enrichWithKeywords } from "@/lib/keywordEnricher";
import { sendFeedPost } from "@/lib/telegramBot";

export const maxDuration = 30;

const REDIS_KEY = "broadcastSentIds";

function getRedis(): Redis | null {
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    return new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
  }
  return null;
}

export async function GET(req: Request) {
  // Auth check
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHANNEL_ID) {
    return NextResponse.json({ error: "Bot not configured" }, { status: 500 });
  }

  const channels = (process.env.TELEGRAM_CHANNELS || "")
    .split(",")
    .map((c) => c.trim().replace(/^@/, ""))
    .filter(Boolean);

  if (channels.length === 0) {
    return NextResponse.json({ error: "No channels configured" }, { status: 500 });
  }

  // Scrape latest posts from all channels
  const results = await Promise.all(
    channels.map((ch) => scrapeChannel(ch).catch(() => []))
  );

  const posts = results
    .flat()
    .filter((p) => p.text)
    .sort((a, b) => (b.timestamp > a.timestamp ? 1 : -1))
    .slice(0, 50);

  if (posts.length === 0) {
    return NextResponse.json({ sent: 0, total: 0, message: "No posts found" });
  }

  // Load set of already-sent post IDs from Redis
  const redis = getRedis();
  let sentIds = new Set<string>();
  if (redis) {
    const stored = await redis.smembers(REDIS_KEY) as string[];
    if (stored) sentIds = new Set(stored);
  }

  // Filter to only unsent posts
  const newPosts = posts.filter((p) => !sentIds.has(p.id));

  if (newPosts.length === 0) {
    return NextResponse.json({ sent: 0, total: 0, message: "No new posts" });
  }

  // Enrich with location data where possible
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
  const cap = 5; // max per run to avoid spam
  const batch = newPosts.slice(0, cap);
  let sent = 0;
  const newSentIds: string[] = [];

  for (const post of batch) {
    const ok = await sendFeedPost(post, siteUrl);
    if (ok) {
      sent++;
      newSentIds.push(post.id);
    }
    await new Promise((r) => setTimeout(r, 1000));
  }

  // Persist sent IDs to Redis (keep last 500 to avoid unbounded growth)
  if (redis && newSentIds.length > 0) {
    await redis.sadd(REDIS_KEY, ...(newSentIds as [string, ...string[]]));
    // Trim: if set is too large, clear and re-add recent ones
    const size = await redis.scard(REDIS_KEY);
    if (size > 500) {
      await redis.del(REDIS_KEY);
      const recentIds = posts.slice(0, 100).map((p) => p.id) as [string, ...string[]];
      await redis.sadd(REDIS_KEY, ...recentIds);
    }
  }

  return NextResponse.json({ sent, total: newPosts.length });
}
