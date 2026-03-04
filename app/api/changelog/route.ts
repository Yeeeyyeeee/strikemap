import { NextResponse } from "next/server";
import { getRedis } from "@/lib/redis";
import { isAdminRequest } from "@/lib/adminAuth";
import { REDIS_CHANGELOG_KEY } from "@/lib/constants";

export interface ChangelogEntry {
  id: string;
  text: string;
  createdAt: number;
}

export async function GET() {
  const r = getRedis();
  if (!r) return NextResponse.json({ entries: [] });

  try {
    const raw = await r.get(REDIS_CHANGELOG_KEY);
    if (!raw) return NextResponse.json({ entries: [] });
    const entries: ChangelogEntry[] = typeof raw === "string" ? JSON.parse(raw) : raw;
    // Sort most recent first
    entries.sort((a, b) => b.createdAt - a.createdAt);
    return NextResponse.json(
      { entries },
      { headers: { "Cache-Control": "public, s-maxage=10, stale-while-revalidate=30" } }
    );
  } catch {
    return NextResponse.json({ entries: [] });
  }
}

export async function POST(req: Request) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const r = getRedis();
  if (!r) return NextResponse.json({ error: "Redis not configured" }, { status: 500 });

  try {
    const body = await req.json();
    const { action } = body;

    // Load existing entries
    const raw = await r.get(REDIS_CHANGELOG_KEY);
    let entries: ChangelogEntry[] = [];
    if (raw) {
      entries = typeof raw === "string" ? JSON.parse(raw) : raw;
    }

    if (action === "add") {
      const text = body.text?.trim();
      if (!text) {
        return NextResponse.json({ error: "Text is required" }, { status: 400 });
      }
      const entry: ChangelogEntry = {
        id: `cl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        text,
        createdAt: Date.now(),
      };
      entries.push(entry);
      await r.set(REDIS_CHANGELOG_KEY, JSON.stringify(entries));
      return NextResponse.json({ ok: true, entry });
    }

    if (action === "delete") {
      const { id } = body;
      if (!id) return NextResponse.json({ error: "ID is required" }, { status: 400 });
      entries = entries.filter((e) => e.id !== id);
      await r.set(REDIS_CHANGELOG_KEY, JSON.stringify(entries));
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
