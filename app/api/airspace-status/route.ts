import { NextResponse } from "next/server";
import { getRedis } from "@/lib/redis";
import { isAdminRequest } from "@/lib/adminAuth";
import { REDIS_AIRSPACE_OVERRIDES_KEY } from "@/lib/constants";
import { AirspaceStatus } from "@/lib/types";

interface AirspaceOverride {
  status: AirspaceStatus;
  setAt: string;
  setBy: string;
}

export type AirspaceOverrides = Record<string, AirspaceOverride>;

export async function GET() {
  const r = getRedis();
  if (!r) return NextResponse.json({ overrides: {} });

  try {
    const raw = await r.get(REDIS_AIRSPACE_OVERRIDES_KEY);
    if (!raw) return NextResponse.json({ overrides: {} });
    const overrides: AirspaceOverrides = typeof raw === "string" ? JSON.parse(raw) : raw;
    return NextResponse.json({ overrides });
  } catch {
    return NextResponse.json({ overrides: {} });
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

    // Read current overrides
    const raw = await r.get(REDIS_AIRSPACE_OVERRIDES_KEY);
    const overrides: AirspaceOverrides = raw
      ? typeof raw === "string"
        ? JSON.parse(raw)
        : raw
      : {};

    if (action === "set") {
      const { fir, status } = body;
      if (!fir || !["open", "restricted", "closed"].includes(status)) {
        return NextResponse.json({ error: "Invalid fir or status" }, { status: 400 });
      }
      overrides[fir] = {
        status,
        setAt: new Date().toISOString(),
        setBy: "admin",
      };
    } else if (action === "clear") {
      const { fir } = body;
      if (!fir) return NextResponse.json({ error: "Missing fir" }, { status: 400 });
      delete overrides[fir];
    } else if (action === "clear-all") {
      await r.del(REDIS_AIRSPACE_OVERRIDES_KEY);
      return NextResponse.json({ ok: true, overrides: {} });
    } else {
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }

    await r.set(REDIS_AIRSPACE_OVERRIDES_KEY, JSON.stringify(overrides));
    return NextResponse.json({ ok: true, overrides });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
