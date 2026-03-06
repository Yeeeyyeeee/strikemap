import crypto from "crypto";
import { getRedis } from "@/lib/redis";
import { REDIS_MODERATORS_KEY } from "@/lib/constants";

export const MOD_COOKIE_NAME = "mod_token";

export function hashModPassword(password: string): string {
  return crypto
    .createHmac("sha256", password)
    .update("iranaim-mod")
    .digest("hex");
}

export async function isModRequest(
  req: Request
): Promise<{ isMod: boolean; modName: string | null }> {
  const cookie = req.headers.get("cookie") || "";
  const match = cookie.match(new RegExp(`${MOD_COOKIE_NAME}=([^;]+)`));
  const token = match?.[1];
  if (!token) return { isMod: false, modName: null };

  const r = getRedis();
  if (!r) return { isMod: false, modName: null };

  try {
    const all = await r.hgetall(REDIS_MODERATORS_KEY);
    if (!all) return { isMod: false, modName: null };

    for (const [name, raw] of Object.entries(all)) {
      const entry =
        typeof raw === "string"
          ? JSON.parse(raw)
          : (raw as { passwordHash: string });
      if (entry.passwordHash === token) {
        return { isMod: true, modName: name };
      }
    }
  } catch {}

  return { isMod: false, modName: null };
}
