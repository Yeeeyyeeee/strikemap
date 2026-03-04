import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/adminAuth";
import { getRedis } from "@/lib/redis";
import { REDIS_YOUTUBE_KEY } from "@/lib/constants";

const DEFAULT_CONFIG = {
  liveCams: [] as { id: string; label: string }[],
  liveNews: [] as { id: string; label: string }[],
  speech: { id: "", title: "", enabled: false },
};

async function readConfig() {
  const r = getRedis();
  if (!r) return DEFAULT_CONFIG;
  try {
    const data = await r.get(REDIS_YOUTUBE_KEY);
    if (data && typeof data === "object") return data;
    return DEFAULT_CONFIG;
  } catch {
    return DEFAULT_CONFIG;
  }
}

async function writeConfig(data: unknown) {
  const r = getRedis();
  if (!r) throw new Error("Redis not configured");
  await r.set(REDIS_YOUTUBE_KEY, JSON.stringify(data));
}

export async function GET() {
  return NextResponse.json(await readConfig());
}

export async function PUT(req: Request) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await req.json();
    await writeConfig(body);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }
}
