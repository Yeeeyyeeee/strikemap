import { NextResponse } from "next/server";
import { authenticateSource, makeSourceToken, isSourceRequest, COOKIE_NAME } from "@/lib/sourceAuth";

const MAX_AGE = 60 * 60 * 24 * 7; // 7 days

/** POST — login with password */
export async function POST(req: Request) {
  const { password } = await req.json().catch(() => ({ password: "" }));
  const sourceName = authenticateSource(password);

  if (!sourceName) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const token = makeSourceToken(sourceName, password);
  const res = NextResponse.json({ ok: true, sourceName });
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
  const sourceName = isSourceRequest(req);
  if (sourceName) {
    return NextResponse.json({ authenticated: true, sourceName });
  }
  return NextResponse.json({ authenticated: false });
}

/** DELETE — logout */
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, "", { path: "/", maxAge: 0 });
  return res;
}
