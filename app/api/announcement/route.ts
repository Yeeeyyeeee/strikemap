import { NextResponse } from "next/server";
import { getRedis } from "@/lib/redis";
import { isAdminRequest } from "@/lib/adminAuth";
import { REDIS_ANNOUNCEMENT_KEY } from "@/lib/constants";

export async function GET() {
  const r = getRedis();
  if (!r) return NextResponse.json({ announcement: null });

  try {
    const raw = await r.get(REDIS_ANNOUNCEMENT_KEY);
    if (!raw) return NextResponse.json({ announcement: null });
    const announcement = typeof raw === "string" ? JSON.parse(raw) : raw;
    return NextResponse.json(
      { announcement },
      { headers: { "Cache-Control": "public, s-maxage=10, stale-while-revalidate=20" } }
    );
  } catch {
    return NextResponse.json({ announcement: null });
  }
}

export async function PUT(req: Request) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const r = getRedis();
  if (!r) return NextResponse.json({ error: "Redis not configured" }, { status: 500 });

  try {
    const body = await req.json();
    const text = body.text?.trim();

    if (!text) {
      await r.del(REDIS_ANNOUNCEMENT_KEY);
      return NextResponse.json({ ok: true, announcement: null });
    }

    const announcement = { text, updatedAt: new Date().toISOString() };
    await r.set(REDIS_ANNOUNCEMENT_KEY, JSON.stringify(announcement));
    return NextResponse.json({ ok: true, announcement });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
