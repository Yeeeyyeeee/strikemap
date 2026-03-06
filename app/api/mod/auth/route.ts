import { NextResponse } from "next/server";
import { getRedis } from "@/lib/redis";
import { REDIS_MODERATORS_KEY } from "@/lib/constants";
import { hashModPassword, MOD_COOKIE_NAME } from "@/lib/modAuth";
import { checkRateLimit, recordFailure, clearFailures } from "@/lib/rateLimit";

const MAX_AGE = 60 * 60 * 24 * 7; // 7 days

/** POST — login with password */
export async function POST(req: Request) {
  const { blocked, retryAfterSecs } = checkRateLimit(req);
  if (blocked) {
    return NextResponse.json(
      { ok: false, error: `Too many attempts. Try again in ${retryAfterSecs}s` },
      { status: 429, headers: { "Retry-After": String(retryAfterSecs) } },
    );
  }

  const { password } = await req.json().catch(() => ({ password: "" }));
  if (!password) {
    recordFailure(req);
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const r = getRedis();
  if (!r) {
    return NextResponse.json({ error: "Redis not configured" }, { status: 500 });
  }

  const hash = hashModPassword(password);
  const all = await r.hgetall(REDIS_MODERATORS_KEY);
  if (!all) {
    recordFailure(req);
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  for (const [name, raw] of Object.entries(all)) {
    const entry =
      typeof raw === "string"
        ? JSON.parse(raw)
        : (raw as { passwordHash: string });
    if (entry.passwordHash === hash) {
      clearFailures(req);
      const res = NextResponse.json({ ok: true, name });
      res.cookies.set(MOD_COOKIE_NAME, hash, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: MAX_AGE,
      });
      return res;
    }
  }

  recordFailure(req);
  return NextResponse.json({ ok: false }, { status: 401 });
}

/** GET — check if current session is valid */
export async function GET(req: Request) {
  const cookie = req.headers.get("cookie") || "";
  const match = cookie.match(new RegExp(`${MOD_COOKIE_NAME}=([^;]+)`));
  const token = match?.[1];
  if (!token) {
    return NextResponse.json({ authenticated: false, name: null });
  }

  const r = getRedis();
  if (!r) {
    return NextResponse.json({ authenticated: false, name: null });
  }

  const all = await r.hgetall(REDIS_MODERATORS_KEY);
  if (!all) {
    return NextResponse.json({ authenticated: false, name: null });
  }

  for (const [name, raw] of Object.entries(all)) {
    const entry =
      typeof raw === "string"
        ? JSON.parse(raw)
        : (raw as { passwordHash: string });
    if (entry.passwordHash === token) {
      return NextResponse.json({ authenticated: true, name });
    }
  }

  return NextResponse.json({ authenticated: false, name: null });
}

/** DELETE — logout */
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(MOD_COOKIE_NAME, "", { path: "/", maxAge: 0 });
  return res;
}
