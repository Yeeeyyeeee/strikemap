import crypto from "crypto";

const COOKIE_NAME = "source_token";

function getPasswords(): Record<string, string> {
  try {
    return JSON.parse(process.env.SOURCE_PASSWORDS || "{}");
  } catch {
    return {};
  }
}

/** Find which source name matches the given password, or null */
export function authenticateSource(password: string): string | null {
  const map = getPasswords();
  for (const [name, pw] of Object.entries(map)) {
    if (pw === password) return name;
  }
  return null;
}

/** Generate HMAC token for a source name + password pair */
export function makeSourceToken(name: string, password: string): string {
  return crypto
    .createHmac("sha256", password)
    .update(`iranaim-source-${name}`)
    .digest("hex");
}

/** Check if request has a valid source cookie. Returns source name or null. */
export function isSourceRequest(req: Request): string | null {
  const cookie = req.headers.get("cookie") || "";
  const match = cookie.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  if (!match?.[1]) return null;

  const token = match[1];
  const map = getPasswords();
  for (const [name, pw] of Object.entries(map)) {
    if (makeSourceToken(name, pw) === token) return name;
  }
  return null;
}

export { COOKIE_NAME };
