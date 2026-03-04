import { NextResponse } from "next/server";
import { scrapeChannel, isIranRelated, getConfiguredChannels, ChannelPost } from "@/lib/telegram";
import { enrichWithKeywords } from "@/lib/keywordEnricher";
import { processSirenPosts } from "@/lib/sirenDetector";
import { getRedis } from "@/lib/redis";
import { REDIS_FEED_POSTS_KEY, FEED_MAX_STORED_POSTS } from "@/lib/constants";
import { deduplicatePosts } from "@/lib/textDedup";

export const maxDuration = 30;

export async function GET() {
  const channels = getConfiguredChannels();

  if (channels.length === 0) {
    return NextResponse.json({ posts: [], error: "No channels configured" });
  }

  try {
    // Scrape latest posts from channels
    const results = await Promise.all(channels.map((ch) => scrapeChannel(ch).catch(() => [])));

    const freshPosts = results.flat().filter((p) => p.text && p.text.trim().length > 0);

    // Load stored history from Redis and merge
    const redis = getRedis();
    let storedPosts: ChannelPost[] = [];
    if (redis) {
      try {
        const raw = await redis.get<ChannelPost[]>(REDIS_FEED_POSTS_KEY);
        if (Array.isArray(raw)) storedPosts = raw;
      } catch {}
    }

    // Merge: fresh posts take priority (newer data), then fill with stored
    const seenIds = new Set<string>();
    const merged: ChannelPost[] = [];
    for (const p of freshPosts) {
      if (!seenIds.has(p.id)) {
        seenIds.add(p.id);
        merged.push(p);
      }
    }
    for (const p of storedPosts) {
      if (!seenIds.has(p.id)) {
        seenIds.add(p.id);
        merged.push(p);
      }
    }

    // Sort by timestamp descending
    merged.sort((a, b) => (b.timestamp > a.timestamp ? 1 : -1));

    // Deduplicate: if a media-only post (very short text) shares images/video
    // with another post that has real text, drop the media-only one
    const mediaToPostWithText = new Map<string, string>();
    for (const p of merged) {
      if (p.text.trim().length > 20) {
        for (const url of p.imageUrls || []) mediaToPostWithText.set(url, p.id);
        if (p.videoUrl) mediaToPostWithText.set(p.videoUrl, p.id);
      }
    }
    const posts = merged
      .filter((p) => {
        if (p.text.trim().length > 20) return true;
        const urls = [...(p.imageUrls || []), ...(p.videoUrl ? [p.videoUrl] : [])];
        if (urls.length > 0 && urls.some((u) => mediaToPostWithText.has(u))) return false;
        return true;
      })
      .slice(0, FEED_MAX_STORED_POSTS);

    // Deduplicate near-identical posts (same news from multiple channels)
    const dedupedPosts = deduplicatePosts(posts);

    // Process ALL posts for siren detection (before dedup, so we don't miss alerts)
    await processSirenPosts(posts);

    // Enrich deduped posts with coordinates so feed clicks can navigate the map
    for (const post of dedupedPosts) {
      if (isIranRelated(post.text)) {
        const kwResult = enrichWithKeywords(post.text);
        if (kwResult) {
          post.lat = kwResult.lat;
          post.lng = kwResult.lng;
          post.location = kwResult.location;
        }
      }
    }

    // Persist full post list to Redis (non-blocking) — keep all for history
    if (redis) {
      redis.set(REDIS_FEED_POSTS_KEY, posts).catch(() => {});
    }

    return NextResponse.json(
      { posts: dedupedPosts, count: dedupedPosts.length },
      {
        headers: {
          "Cache-Control": "public, s-maxage=30, stale-while-revalidate=15",
        },
      }
    );
  } catch {
    return NextResponse.json({ posts: [], error: "Scrape failed" });
  }
}
