/**
 * Auth helper for protected API routes.
 * Validates CRON_SECRET bearer token from the Authorization header.
 */

import { NextResponse } from "next/server";

/** Check CRON_SECRET bearer token. Returns a 401 response if unauthorized, or null if OK. */
export function requireCronAuth(request: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) return null; // No secret configured — allow (dev mode)

  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
