import { NextRequest, NextResponse } from "next/server";
import { getIncidentCount, reEnrichCasualties } from "@/lib/incidentStore";
import { scrapeChannel, isIranRelated, getConfiguredChannels } from "@/lib/telegram";
import { getRedis } from "@/lib/redis";
import { requireCronAuth } from "@/lib/apiAuth";

export async function GET(req: NextRequest) {
  const authError = requireCronAuth(req);
  if (authError) return authError;
  // Trigger casualty re-enrichment if ?enrich=casualties
  if (req.nextUrl.searchParams.get("enrich") === "casualties") {
    const count = await reEnrichCasualties();
    return NextResponse.json({ enriched: count, timestamp: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
  }

  const diagnostics: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    storeSize: await getIncidentCount(),
    env: {
      TELEGRAM_CHANNELS: process.env.TELEGRAM_CHANNELS ? `set (${process.env.TELEGRAM_CHANNELS.split(",").length} channels)` : "MISSING",
      GEMINI_API_KEY: process.env.GEMINI_API_KEY ? "set" : "MISSING",
      UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL ? "set" : "MISSING",
      NEXT_PUBLIC_MAPBOX_TOKEN: process.env.NEXT_PUBLIC_MAPBOX_TOKEN ? "set" : "MISSING",
    },
  };

  // Direct Redis check — bypass memCache to see what's actually in Redis
  const r = getRedis();
  if (r) {
    try {
      const hashLen = await r.hlen("incidents_v3");
      const keyType = await r.type("incidents_v3");
      const oldKeyType = await r.type("incidents_v2");

      // Direct write/read test
      let writeTest = "not run";
      try {
        await r.hset("incidents_v3_test", { test_key: JSON.stringify({ id: "test", ts: Date.now() }) });
        const readBack = await r.hget("incidents_v3_test", "test_key");
        const testLen = await r.hlen("incidents_v3_test");
        await r.del("incidents_v3_test");
        writeTest = `OK (wrote 1, read back: ${typeof readBack}, hlen: ${testLen})`;
      } catch (err) {
        writeTest = `FAILED: ${String(err)}`;
      }

      // Also test simple SET/GET
      let setTest = "not run";
      try {
        await r.set("incidents_set_test", JSON.stringify([{ id: "test" }]));
        const readBack = await r.get("incidents_set_test");
        await r.del("incidents_set_test");
        setTest = `OK (read back type: ${typeof readBack})`;
      } catch (err) {
        setTest = `FAILED: ${String(err)}`;
      }

      diagnostics.redis = {
        incidents_v3_type: keyType,
        incidents_v3_hashLen: hashLen,
        incidents_v2_type: oldKeyType,
        writeTest,
        setTest,
      };
    } catch (err) {
      diagnostics.redis = { error: String(err) };
    }
  }

  // Test scraping one channel
  const channels = getConfiguredChannels();

  if (channels.length > 0) {
    const testChannel = channels[0];
    try {
      const posts = await scrapeChannel(testChannel);
      const iranPosts = posts.filter((p) => isIranRelated(p.text));
      diagnostics.telegramTest = {
        channel: testChannel,
        postsScraped: posts.length,
        samplePost: posts[0] ? posts[0].text.slice(0, 100) : "(none)",
        iranRelated: iranPosts.length,
      };
    } catch (err) {
      diagnostics.telegramTest = {
        channel: testChannel,
        error: String(err),
      };
    }
  } else {
    diagnostics.telegramTest = "No channels configured";
  }

  return NextResponse.json(diagnostics, {
    headers: { "Cache-Control": "no-store" },
  });
}
