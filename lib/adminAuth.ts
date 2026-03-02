import crypto from "crypto";

const COOKIE_NAME = "admin_token";

export function isAdminRequest(req: Request): boolean {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) return false;
  const expected = crypto.createHmac("sha256", password).update("iranaim-admin").digest("hex");
  const cookie = req.headers.get("cookie") || "";
  const match = cookie.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  return match?.[1] === expected;
}
