import { NextResponse } from "next/server";
import crypto from "crypto";
import { checkRateLimit, recordFailure, clearFailures } from "@/lib/rateLimit";

const COOKIE_NAME = "admin_token";
const MAX_AGE = 60 * 60 * 24 * 7; // 7 days

function getToken(): string {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) return "";
  return crypto.createHmac("sha256", password).update("iranaim-admin").digest("hex");
}

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
  const expected = process.env.ADMIN_PASSWORD;

  if (!expected || password !== expected) {
    recordFailure(req);
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  clearFailures(req);
  const token = getToken();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
  return res;
}

/** GET — check if current session is valid */
export async function GET(req: Request) {
  const cookie = req.headers.get("cookie") || "";
  const match = cookie.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  const token = match?.[1] || "";
  const valid = token === getToken() && token !== "";
  return NextResponse.json({ authenticated: valid });
}

/** DELETE — logout */
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, "", { path: "/", maxAge: 0 });
  return res;
}
