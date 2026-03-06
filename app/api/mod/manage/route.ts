import { NextResponse } from "next/server";
import { getRedis } from "@/lib/redis";
import { isAdminRequest } from "@/lib/adminAuth";
import { REDIS_MODERATORS_KEY } from "@/lib/constants";
import { hashModPassword } from "@/lib/modAuth";

export async function POST(req: Request) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const r = getRedis();
  if (!r) {
    return NextResponse.json({ error: "Redis not configured" }, { status: 500 });
  }

  const body = await req.json().catch(() => ({}));
  const action = body.action as string;

  if (action === "create") {
    const name = String(body.name || "").trim().toLowerCase();
    const password = String(body.password || "").trim();
    if (!name || !password) {
      return NextResponse.json(
        { error: "Name and password required" },
        { status: 400 }
      );
    }
    if (name.length > 20) {
      return NextResponse.json(
        { error: "Name too long (max 20 chars)" },
        { status: 400 }
      );
    }

    // Check if name already taken
    const existing = await r.hget(REDIS_MODERATORS_KEY, name);
    if (existing) {
      return NextResponse.json(
        { error: "Moderator name already exists" },
        { status: 409 }
      );
    }

    // Ensure no password hash collision
    const hash = hashModPassword(password);
    const all = await r.hgetall(REDIS_MODERATORS_KEY);
    if (all) {
      for (const [, raw] of Object.entries(all)) {
        const entry =
          typeof raw === "string"
            ? JSON.parse(raw)
            : (raw as { passwordHash: string });
        if (entry.passwordHash === hash) {
          return NextResponse.json(
            { error: "Password already in use by another moderator" },
            { status: 409 }
          );
        }
      }
    }

    await r.hset(REDIS_MODERATORS_KEY, {
      [name]: JSON.stringify({
        passwordHash: hash,
        createdAt: Date.now(),
      }),
    });

    return NextResponse.json({ ok: true, name });
  }

  if (action === "delete") {
    const name = String(body.name || "").trim().toLowerCase();
    if (!name) {
      return NextResponse.json(
        { error: "Name required" },
        { status: 400 }
      );
    }
    await r.hdel(REDIS_MODERATORS_KEY, name);
    return NextResponse.json({ ok: true, deleted: name });
  }

  if (action === "list") {
    const all = await r.hgetall(REDIS_MODERATORS_KEY);
    if (!all) return NextResponse.json({ moderators: [] });

    const moderators = Object.entries(all).map(([name, raw]) => {
      const entry =
        typeof raw === "string"
          ? JSON.parse(raw)
          : (raw as { createdAt: number });
      return { name, createdAt: entry.createdAt || 0 };
    });

    return NextResponse.json({ moderators });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
