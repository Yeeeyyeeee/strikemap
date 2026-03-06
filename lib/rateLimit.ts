/** Simple in-memory IP rate limiter for auth endpoints */

interface Entry {
  attempts: number;
  firstAttempt: number;
  lockedUntil: number;
}

const store = new Map<string, Entry>();

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 min window
const LOCKOUT_MS = 15 * 60 * 1000; // 15 min lockout after max attempts

// Cleanup stale entries every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now - entry.firstAttempt > WINDOW_MS && now > entry.lockedUntil) {
      store.delete(key);
    }
  }
}, 10 * 60 * 1000).unref();

function getIp(req: Request): string {
  return (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown";
}

/**
 * Check if this IP is rate-limited. Returns { blocked, retryAfter } .
 * Call `recordFailure` after a failed login, `clearFailures` after success.
 */
export function checkRateLimit(req: Request): { blocked: boolean; retryAfterSecs: number } {
  const ip = getIp(req);
  const entry = store.get(ip);
  if (!entry) return { blocked: false, retryAfterSecs: 0 };

  const now = Date.now();

  // Currently locked out
  if (entry.lockedUntil > now) {
    return { blocked: true, retryAfterSecs: Math.ceil((entry.lockedUntil - now) / 1000) };
  }

  // Window expired — reset
  if (now - entry.firstAttempt > WINDOW_MS) {
    store.delete(ip);
    return { blocked: false, retryAfterSecs: 0 };
  }

  return { blocked: false, retryAfterSecs: 0 };
}

export function recordFailure(req: Request): void {
  const ip = getIp(req);
  const now = Date.now();
  const entry = store.get(ip);

  if (!entry || now - entry.firstAttempt > WINDOW_MS) {
    store.set(ip, { attempts: 1, firstAttempt: now, lockedUntil: 0 });
    return;
  }

  entry.attempts++;
  if (entry.attempts >= MAX_ATTEMPTS) {
    entry.lockedUntil = now + LOCKOUT_MS;
  }
}

export function clearFailures(req: Request): void {
  const ip = getIp(req);
  store.delete(ip);
}
