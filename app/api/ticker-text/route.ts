import { NextResponse } from "next/server";
import { getRedis } from "@/lib/redis";
import { isAdminRequest } from "@/lib/adminAuth";
import { REDIS_TICKER_TEXT_KEY } from "@/lib/constants";

export async function GET() {
  const r = getRedis();
  if (!r) return NextResponse.json({ text: null });

  try {
    const raw = await r.get(REDIS_TICKER_TEXT_KEY);
    if (!raw) return NextResponse.json({ text: null });
    const data = typeof raw === "string" ? JSON.parse(raw) : raw;
    return NextResponse.json(
      { text: data.text || null },
      { headers: { "Cache-Control": "public, s-maxage=10, stale-while-revalidate=20" } }
    );
  } catch {
    return NextResponse.json({ text: null });
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
      await r.del(REDIS_TICKER_TEXT_KEY);
      return NextResponse.json({ ok: true, text: null });
    }

    await r.set(
      REDIS_TICKER_TEXT_KEY,
      JSON.stringify({ text, updatedAt: new Date().toISOString() })
    );
    return NextResponse.json({ ok: true, text });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
