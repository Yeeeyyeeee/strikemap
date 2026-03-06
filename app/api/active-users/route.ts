import { NextRequest, NextResponse } from "next/server";
import { getRedis } from "@/lib/redis";
import { REDIS_ACTIVE_USERS_KEY, ACTIVE_USER_TTL_S } from "@/lib/constants";

export async function POST(req: NextRequest) {
  const redis = getRedis();
  if (!redis) {
    return NextResponse.json({ count: 0 });
  }

  try {
    // Accept client-generated session ID for accurate per-tab counting
    let sessionId: string | undefined;
    try {
      const body = await req.json();
      sessionId = body.sessionId;
    } catch {}

    // Fallback to IP if no session ID provided
    if (!sessionId) {
      const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
      sessionId = ip;
    }

    const now = Math.floor(Date.now() / 1000);
    const cutoff = now - ACTIVE_USER_TTL_S;

    // Add this visitor with current timestamp as score
    await redis.zadd(REDIS_ACTIVE_USERS_KEY, { score: now, member: sessionId });

    // Remove expired entries
    await redis.zremrangebyscore(REDIS_ACTIVE_USERS_KEY, 0, cutoff);

    // Count active users
    const count = await redis.zcard(REDIS_ACTIVE_USERS_KEY);

    return NextResponse.json({ count });
  } catch {
    return NextResponse.json({ count: 0 });
  }
}

export async function GET() {
  const redis = getRedis();
  if (!redis) {
    return NextResponse.json({ count: 0 });
  }

  try {
    const now = Math.floor(Date.now() / 1000);
    const cutoff = now - ACTIVE_USER_TTL_S;

    await redis.zremrangebyscore(REDIS_ACTIVE_USERS_KEY, 0, cutoff);

    const count = await redis.zcard(REDIS_ACTIVE_USERS_KEY);
    return NextResponse.json(
      { count },
      { headers: { "Cache-Control": "public, s-maxage=10, stale-while-revalidate=20" } }
    );
  } catch {
    return NextResponse.json({ count: 0 });
  }
}
