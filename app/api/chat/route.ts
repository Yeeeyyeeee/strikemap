import { NextRequest, NextResponse } from "next/server";
import { getRedis } from "@/lib/redis";
import { isAdminRequest } from "@/lib/adminAuth";
import { isModRequest } from "@/lib/modAuth";
import { REDIS_CHAT_KEY, REDIS_CHAT_BANS_KEY, REDIS_CHAT_NICKNAMES_KEY, REDIS_CHAT_PINNED_KEY, REDIS_CHAT_LIKES_KEY, REDIS_CHAT_POLL_VOTES_KEY, NICKNAME_RESERVE_TTL_MS, CHAT_MAX_MESSAGES, CHAT_MESSAGE_TTL_MS, CHAT_COOLDOWN_MS, REDIS_CHAT_COOLDOWN_KEY, REDIS_CHAT_IP_COOLDOWN_KEY, REDIS_CHAT_IP_BANS_KEY } from "@/lib/constants";
import { containsProfanity, isOffensiveNickname } from "@/lib/profanityFilter";

/** Strip anything that isn't alphanumeric or hyphen, cap length at 64 chars */
function sanitizeId(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9\-]/g, "").slice(0, 64);
}

interface PollData {
  question: string;
  options: string[];
  votes: number[];
  totalVotes: number;
}

interface ChatMessage {
  id: string;
  text: string;
  nickname: string;
  timestamp: number;
  flag?: string;
  role?: "dev" | "mod";
  platform?: "mobile" | "desktop";
  ip?: string; // stored server-side, never sent to clients
  replyTo?: {
    id: string;
    nickname: string;
    text: string; // truncated preview of original message
  };
  poll?: PollData;
}

function getIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

/** Strip server-only fields before sending to clients */
function stripPrivateFields(msg: ChatMessage): Omit<ChatMessage, "ip"> {
  const { ip: _ip, ...publicMsg } = msg;
  return publicMsg;
}

// In-memory fallback when Redis is not configured
let fallbackMessages: ChatMessage[] = [];

async function getMessages(since: number): Promise<ChatMessage[]> {
  const r = getRedis();
  if (!r) {
    const cutoff = Date.now() - CHAT_MESSAGE_TTL_MS;
    fallbackMessages = fallbackMessages.filter((m) => m.timestamp > cutoff);
    return since > 0 ? fallbackMessages.filter((m) => m.timestamp > since) : fallbackMessages;
  }

  try {
    const raw = await r.lrange(REDIS_CHAT_KEY, 0, CHAT_MAX_MESSAGES - 1) as string[];
    if (!raw || raw.length === 0) return [];

    const cutoff = Date.now() - CHAT_MESSAGE_TTL_MS;
    const messages: ChatMessage[] = [];
    for (const item of raw) {
      const msg: ChatMessage = typeof item === "string" ? JSON.parse(item) : item as ChatMessage;
      if (msg.timestamp > cutoff && (since === 0 || msg.timestamp > since)) {
        messages.push(msg);
      }
    }
    return messages;
  } catch {
    return [];
  }
}

async function addMessage(msg: ChatMessage): Promise<void> {
  const r = getRedis();
  if (!r) {
    fallbackMessages.push(msg);
    if (fallbackMessages.length > CHAT_MAX_MESSAGES) {
      fallbackMessages = fallbackMessages.slice(-CHAT_MAX_MESSAGES);
    }
    return;
  }

  try {
    await r.rpush(REDIS_CHAT_KEY, JSON.stringify(msg));
    // Trim to max size
    const len = await r.llen(REDIS_CHAT_KEY);
    if (len > CHAT_MAX_MESSAGES) {
      await r.ltrim(REDIS_CHAT_KEY, len - CHAT_MAX_MESSAGES, -1);
    }
  } catch {
    // Fallback to in-memory if Redis fails
    fallbackMessages.push(msg);
  }
}

/** Check if a nickname is currently reserved by another client */
async function isNicknameTaken(nickname: string, clientId: string): Promise<boolean> {
  const r = getRedis();
  if (!r) return false;
  try {
    const raw = await r.hget(REDIS_CHAT_NICKNAMES_KEY, nickname.toLowerCase()) as string | null;
    if (!raw) return false;
    const entry = typeof raw === "string" ? JSON.parse(raw) : raw as { clientId: string; timestamp: number };
    // Same client reconnecting — not taken
    if (entry.clientId === clientId) return false;
    // Different client — check if expired
    if (Date.now() - entry.timestamp > NICKNAME_RESERVE_TTL_MS) return false;
    return true;
  } catch {
    return false;
  }
}

/** Reserve a nickname for a client */
async function claimNickname(nickname: string, clientId: string, flag?: string): Promise<void> {
  const r = getRedis();
  if (!r) return;
  await r.hset(REDIS_CHAT_NICKNAMES_KEY, {
    [nickname.toLowerCase()]: JSON.stringify({ clientId, timestamp: Date.now(), ...(flag !== undefined ? { flag } : {}) }),
  });
}

/** Release a nickname */
async function releaseNickname(nickname: string, clientId: string): Promise<void> {
  const r = getRedis();
  if (!r) return;
  try {
    const raw = await r.hget(REDIS_CHAT_NICKNAMES_KEY, nickname.toLowerCase()) as string | null;
    if (!raw) return;
    const entry = typeof raw === "string" ? JSON.parse(raw) : raw as { clientId: string };
    // Only release if this client owns it
    if (entry.clientId === clientId) {
      await r.hdel(REDIS_CHAT_NICKNAMES_KEY, nickname.toLowerCase());
    }
  } catch {}
}

/** Get pinned message from Redis */
async function getPinnedMessage(): Promise<ChatMessage | null> {
  const r = getRedis();
  if (!r) return null;
  try {
    const raw = await r.get(REDIS_CHAT_PINNED_KEY);
    if (!raw) return null;
    return typeof raw === "string" ? JSON.parse(raw) : raw as ChatMessage;
  } catch {
    return null;
  }
}

/** Get like counts for a set of message IDs */
async function getLikes(messageIds: string[]): Promise<Record<string, number>> {
  const r = getRedis();
  if (!r || messageIds.length === 0) return {};
  try {
    const result: Record<string, number> = {};
    const raw = await r.hgetall(REDIS_CHAT_LIKES_KEY);
    if (raw && typeof raw === "object") {
      for (const [id, count] of Object.entries(raw)) {
        if (messageIds.includes(id)) {
          const n = typeof count === "string" ? parseInt(count, 10) : Number(count);
          if (n > 0) result[id] = n;
        }
      }
    }
    return result;
  } catch {
    return {};
  }
}

export async function GET(req: NextRequest) {
  const since = Number(req.nextUrl.searchParams.get("since") || "0");
  const messages = await getMessages(since);
  const pinned = await getPinnedMessage();

  // Filter out messages from shadow-banned users (by nickname and IP)
  const r = getRedis();
  let filtered = messages;
  if (r) {
    try {
      const bans = await r.smembers(REDIS_CHAT_BANS_KEY);
      const ipBans = await r.smembers(REDIS_CHAT_IP_BANS_KEY);
      const banSet = new Set((bans || []).map((b: string) => b.toLowerCase()));
      const ipBanSet = new Set((ipBans || []).map((b: string) => b));
      if (banSet.size > 0 || ipBanSet.size > 0) {
        filtered = messages.filter((m) =>
          !banSet.has(m.nickname.toLowerCase()) && !(m.ip && ipBanSet.has(m.ip))
        );
      }
    } catch {}
  }

  const likes = await getLikes(filtered.map((m) => m.id));
  // Strip server-only fields (ip) before sending to clients
  const publicMessages = filtered.map(stripPrivateFields);
  return NextResponse.json(
    { messages: publicMessages, pinned, likes },
    {
      headers: {
        // Brief CDN cache — chat is near-realtime but doesn't need per-request freshness
        "Cache-Control": "public, s-maxage=2, stale-while-revalidate=5",
      },
    }
  );
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const ip = getIp(req);

    // Admin/mod ban/unban actions
    if (body.action === "ban" || body.action === "unban" || body.action === "list-bans") {
      const isAdmin = isAdminRequest(req);
      const { isMod } = isAdmin ? { isMod: false } : await isModRequest(req);
      if (!isAdmin && !isMod) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      const r = getRedis();
      if (!r) return NextResponse.json({ error: "Redis not configured" }, { status: 500 });

      if (body.action === "ban") {
        const target = String(body.nickname || "").trim().toLowerCase();
        if (!target) return NextResponse.json({ error: "Nickname required" }, { status: 400 });
        await r.sadd(REDIS_CHAT_BANS_KEY, target);
        // Also ban IPs associated with this nickname (scan recent messages)
        const bannedIps: string[] = [];
        try {
          const msgs = await r.lrange(REDIS_CHAT_KEY, 0, CHAT_MAX_MESSAGES - 1) as (string | ChatMessage)[];
          for (const raw of msgs) {
            const msg: ChatMessage = typeof raw === "string" ? JSON.parse(raw) : raw as ChatMessage;
            if (msg.nickname.toLowerCase() === target && msg.ip) {
              bannedIps.push(msg.ip);
            }
          }
          const uniqueIps = Array.from(new Set(bannedIps));
          for (const bannedIpAddr of uniqueIps) {
            await r.sadd(REDIS_CHAT_IP_BANS_KEY, bannedIpAddr);
          }
        } catch {}
        return NextResponse.json({ ok: true, banned: target, ipsBanned: bannedIps.length });
      }
      if (body.action === "unban") {
        const target = String(body.nickname || "").trim().toLowerCase();
        if (!target) return NextResponse.json({ error: "Nickname required" }, { status: 400 });
        await r.srem(REDIS_CHAT_BANS_KEY, target);
        // Also unban IPs associated with this nickname
        try {
          const msgs = await r.lrange(REDIS_CHAT_KEY, 0, CHAT_MAX_MESSAGES - 1) as (string | ChatMessage)[];
          const ipsToUnban: string[] = [];
          for (const raw of msgs) {
            const msg: ChatMessage = typeof raw === "string" ? JSON.parse(raw) : raw as ChatMessage;
            if (msg.nickname.toLowerCase() === target && msg.ip) {
              ipsToUnban.push(msg.ip);
            }
          }
          if (ipsToUnban.length > 0) {
            for (const unbannedIp of new Set(ipsToUnban)) {
              await r.srem(REDIS_CHAT_IP_BANS_KEY, unbannedIp);
            }
          }
        } catch {}
        return NextResponse.json({ ok: true, unbanned: target });
      }
      if (body.action === "list-bans") {
        const bans = await r.smembers(REDIS_CHAT_BANS_KEY);
        const ipBans = await r.smembers(REDIS_CHAT_IP_BANS_KEY);
        return NextResponse.json({ bans, ipBans });
      }
    }

    // Admin pin/unpin actions
    if (body.action === "pin" || body.action === "unpin") {
      if (!isAdminRequest(req)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      const r = getRedis();
      if (!r) return NextResponse.json({ error: "Redis not configured" }, { status: 500 });

      if (body.action === "pin") {
        const message = body.message;
        if (!message || !message.id || !message.text) {
          return NextResponse.json({ error: "Message required" }, { status: 400 });
        }
        const pinned: ChatMessage = {
          id: String(message.id),
          text: String(message.text).slice(0, 500),
          nickname: String(message.nickname || ""),
          timestamp: Number(message.timestamp) || Date.now(),
          ...(message.flag ? { flag: String(message.flag).slice(0, 4) } : {}),
          ...(message.role === "dev" ? { role: "dev" as const } : message.role === "mod" ? { role: "mod" as const } : {}),
        };
        await r.set(REDIS_CHAT_PINNED_KEY, JSON.stringify(pinned));
        return NextResponse.json({ ok: true, pinned });
      }
      if (body.action === "unpin") {
        await r.del(REDIS_CHAT_PINNED_KEY);
        return NextResponse.json({ ok: true, pinned: null });
      }
    }

    // Admin/mod delete message action
    if (body.action === "delete-message") {
      const isAdmin = isAdminRequest(req);
      const { isMod } = isAdmin ? { isMod: false } : await isModRequest(req);
      if (!isAdmin && !isMod) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      const messageId = sanitizeId(String(body.messageId || "").trim());
      if (!messageId) {
        return NextResponse.json({ error: "messageId required" }, { status: 400 });
      }
      const r = getRedis();
      if (!r) return NextResponse.json({ error: "Redis not configured" }, { status: 500 });

      const raw = await r.lrange(REDIS_CHAT_KEY, 0, CHAT_MAX_MESSAGES - 1) as (string | ChatMessage)[];
      for (let i = 0; i < raw.length; i++) {
        const msg: ChatMessage = typeof raw[i] === "string" ? JSON.parse(raw[i] as string) : raw[i] as ChatMessage;
        if (msg.id === messageId) {
          // Mods cannot delete dev messages
          if (!isAdmin && msg.role === "dev") {
            return NextResponse.json({ error: "Cannot delete dev messages" }, { status: 403 });
          }
          // Replace message content with [deleted]
          msg.text = "[message deleted]";
          delete msg.poll;
          delete msg.replyTo;
          await r.lset(REDIS_CHAT_KEY, i, JSON.stringify(msg));
          return NextResponse.json({ ok: true, deleted: messageId });
        }
      }
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }

    // Like action — any user (IP + clientId dedup)
    if (body.action === "like") {
      const messageId = sanitizeId(String(body.messageId || "").trim());
      const clientId = sanitizeId(String(body.clientId || "").trim());
      if (!messageId || !clientId) {
        return NextResponse.json({ error: "messageId and clientId required" }, { status: 400 });
      }
      const r = getRedis();
      if (!r) return NextResponse.json({ error: "Redis not configured" }, { status: 500 });

      // IP-based dedup (primary — can't be bypassed by rotating clientIds)
      if (ip && ip !== "unknown") {
        const ipLikedKey = `chat_liked_ip:${ip}`;
        const ipAlreadyLiked = await r.sismember(ipLikedKey, messageId);
        if (ipAlreadyLiked) {
          return NextResponse.json({ ok: true, alreadyLiked: true });
        }
        await r.sadd(ipLikedKey, messageId);
        await r.expire(ipLikedKey, 7200);
      }

      // clientId-based dedup (secondary)
      const likedKey = `chat_liked:${clientId}`;
      const alreadyLiked = await r.sismember(likedKey, messageId);
      if (alreadyLiked) {
        return NextResponse.json({ ok: true, alreadyLiked: true });
      }

      await r.sadd(likedKey, messageId);
      await r.expire(likedKey, 7200);
      const newCount = await r.hincrby(REDIS_CHAT_LIKES_KEY, messageId, 1);
      return NextResponse.json({ ok: true, likes: newCount });
    }

    // Unlike action — any user (IP + clientId dedup)
    if (body.action === "unlike") {
      const messageId = sanitizeId(String(body.messageId || "").trim());
      const clientId = sanitizeId(String(body.clientId || "").trim());
      if (!messageId || !clientId) {
        return NextResponse.json({ error: "messageId and clientId required" }, { status: 400 });
      }
      const r = getRedis();
      if (!r) return NextResponse.json({ error: "Redis not configured" }, { status: 500 });

      // Check IP-based like record
      if (ip && ip !== "unknown") {
        const ipLikedKey = `chat_liked_ip:${ip}`;
        const ipWasLiked = await r.sismember(ipLikedKey, messageId);
        if (!ipWasLiked) {
          return NextResponse.json({ ok: true, alreadyUnliked: true });
        }
        await r.srem(ipLikedKey, messageId);
      }

      const likedKey = `chat_liked:${clientId}`;
      await r.srem(likedKey, messageId);
      const newCount = await r.hincrby(REDIS_CHAT_LIKES_KEY, messageId, -1);
      if (newCount <= 0) {
        await r.hdel(REDIS_CHAT_LIKES_KEY, messageId);
      }
      return NextResponse.json({ ok: true, likes: Math.max(0, newCount) });
    }

    // Admin: create poll
    if (body.action === "create-poll") {
      if (!isAdminRequest(req)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      const question = String(body.question || "").trim().slice(0, 200);
      const options: string[] = (body.options || [])
        .map((o: unknown) => String(o || "").trim().slice(0, 100))
        .filter((o: string) => o.length > 0);
      if (!question) return NextResponse.json({ error: "Question required" }, { status: 400 });
      if (options.length < 2 || options.length > 6) {
        return NextResponse.json({ error: "2-6 options required" }, { status: 400 });
      }
      const nickname = String(body.nickname || "Admin").trim().slice(0, 20);
      const flag = body.flag ? String(body.flag).slice(0, 4) : undefined;
      const msg: ChatMessage = {
        id: `poll-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        text: question,
        nickname,
        timestamp: Date.now(),
        role: "dev",
        ...(flag ? { flag } : {}),
        poll: {
          question,
          options,
          votes: new Array(options.length).fill(0),
          totalVotes: 0,
        },
      };
      await addMessage(msg);
      return NextResponse.json({ message: msg });
    }

    // Vote on poll — any user (IP + clientId dedup)
    if (body.action === "vote-poll") {
      const pollId = sanitizeId(String(body.pollId || "").trim());
      const optionIndex = Number(body.optionIndex);
      const clientId = sanitizeId(String(body.clientId || "").trim());
      if (!pollId || !clientId || isNaN(optionIndex) || optionIndex < 0) {
        return NextResponse.json({ error: "pollId, optionIndex, and clientId required" }, { status: 400 });
      }
      const r = getRedis();
      if (!r) return NextResponse.json({ error: "Redis not configured" }, { status: 500 });

      // IP-based vote dedup (primary — can't be bypassed)
      if (ip && ip !== "unknown") {
        const ipVoteKey = `${pollId}:ip:${ip}`;
        const ipExisting = await r.hget(REDIS_CHAT_POLL_VOTES_KEY, ipVoteKey);
        if (ipExisting !== null && ipExisting !== undefined) {
          return NextResponse.json({ ok: true, alreadyVoted: true });
        }
      }

      // clientId-based vote dedup (secondary)
      const voteKey = `${pollId}:${clientId}`;
      const existing = await r.hget(REDIS_CHAT_POLL_VOTES_KEY, voteKey);
      if (existing !== null && existing !== undefined) {
        return NextResponse.json({ ok: true, alreadyVoted: true });
      }

      // Find the poll message in the list and update inline
      const raw = await r.lrange(REDIS_CHAT_KEY, 0, CHAT_MAX_MESSAGES - 1) as (string | ChatMessage)[];
      let found = false;
      for (let i = 0; i < raw.length; i++) {
        const msg: ChatMessage = typeof raw[i] === "string" ? JSON.parse(raw[i] as string) : raw[i] as ChatMessage;
        if (msg.id === pollId && msg.poll) {
          if (optionIndex >= msg.poll.options.length) {
            return NextResponse.json({ error: "Invalid option index" }, { status: 400 });
          }
          msg.poll.votes[optionIndex]++;
          msg.poll.totalVotes++;
          await r.lset(REDIS_CHAT_KEY, i, JSON.stringify(msg));
          // Record the vote (both clientId and IP)
          const voteEntries: Record<string, string> = { [voteKey]: String(optionIndex) };
          if (ip && ip !== "unknown") {
            voteEntries[`${pollId}:ip:${ip}`] = String(optionIndex);
          }
          await r.hset(REDIS_CHAT_POLL_VOTES_KEY, voteEntries);
          found = true;
          return NextResponse.json({ ok: true, poll: msg.poll });
        }
      }
      if (!found) return NextResponse.json({ error: "Poll not found" }, { status: 404 });
    }

    // Nickname claim/check actions
    if (body.action === "claim-nickname") {
      const nick = String(body.nickname || "").trim().slice(0, 20);
      const clientId = sanitizeId(String(body.clientId || "").trim());
      if (!nick || !clientId) return NextResponse.json({ error: "Nickname and clientId required" }, { status: 400 });
      if (!/^[A-Za-z]{1,6}-\d{4}$/.test(nick)) return NextResponse.json({ error: "Nickname must be XXXX-1234 format" }, { status: 400 });
      if (isOffensiveNickname(nick)) return NextResponse.json({ error: "That username is not allowed" }, { status: 400 });

      const taken = await isNicknameTaken(nick, clientId);
      if (taken) return NextResponse.json({ error: "Username is already taken" }, { status: 409 });

      // Release old nickname if changing
      const oldNick = String(body.oldNickname || "").trim();
      if (oldNick && oldNick.toLowerCase() !== nick.toLowerCase()) {
        await releaseNickname(oldNick, clientId);
      }

      const flag = body.flag ? String(body.flag).slice(0, 4) : undefined;
      await claimNickname(nick, clientId, flag);
      return NextResponse.json({ ok: true, nickname: nick });
    }

    if (body.action === "update-flag") {
      const clientId = sanitizeId(String(body.clientId || "").trim());
      const nickname = String(body.nickname || "").trim();
      const flag = body.flag ? String(body.flag).slice(0, 4) : "";
      if (!clientId || !nickname) return NextResponse.json({ error: "clientId and nickname required" }, { status: 400 });
      // Verify ownership — only the client that claimed this nickname can update its flag
      const rFlag = getRedis();
      if (rFlag) {
        try {
          const raw = await rFlag.hget(REDIS_CHAT_NICKNAMES_KEY, nickname.toLowerCase()) as string | null;
          if (raw) {
            const entry = typeof raw === "string" ? JSON.parse(raw) : raw as { clientId: string };
            if (entry.clientId !== clientId) {
              return NextResponse.json({ error: "Not your nickname" }, { status: 403 });
            }
          }
        } catch {}
      }
      await claimNickname(nickname, clientId, flag);
      return NextResponse.json({ ok: true, flag });
    }

    if (body.action === "check-nickname") {
      const nick = String(body.nickname || "").trim().slice(0, 20);
      const clientId = sanitizeId(String(body.clientId || "").trim());
      if (!nick || !clientId) return NextResponse.json({ error: "Nickname and clientId required" }, { status: 400 });
      const taken = await isNicknameTaken(nick, clientId);
      return NextResponse.json({ available: !taken });
    }

    const text = String(body.text || "").replace(/<[^>]*>/g, "").trim().slice(0, 500);
    const nickname = String(body.nickname || "Anon").replace(/<[^>]*>/g, "").trim().slice(0, 20);
    const flag = body.flag ? String(body.flag).slice(0, 4) : undefined;

    if (!text) {
      return NextResponse.json({ error: "Empty message" }, { status: 400 });
    }

    // Enforce nickname format server-side
    if (!/^[A-Za-z]{1,6}-\d{4}$/.test(nickname)) {
      return NextResponse.json({ error: "Invalid nickname format" }, { status: 400 });
    }

    // Profanity filter — block offensive nicknames and messages
    if (isOffensiveNickname(nickname)) {
      return NextResponse.json({ error: "That username is not allowed" }, { status: 400 });
    }
    const blockedWord = containsProfanity(text);
    if (blockedWord) {
      return NextResponse.json({ error: "Message contains inappropriate content" }, { status: 400 });
    }

    const clientId = sanitizeId(String(body.clientId || "").trim());

    // Message rate limit — IP-based (primary, can't be bypassed) + clientId (secondary)
    {
      const rl = getRedis();
      if (rl) {
        try {
          // IP-based cooldown (primary enforcement)
          if (ip && ip !== "unknown") {
            const lastIp = await rl.hget(REDIS_CHAT_IP_COOLDOWN_KEY, ip) as string | null;
            if (lastIp) {
              const elapsed = Date.now() - Number(lastIp);
              if (elapsed < CHAT_COOLDOWN_MS) {
                return NextResponse.json({ error: "Slow down" }, { status: 429 });
              }
            }
            await rl.hset(REDIS_CHAT_IP_COOLDOWN_KEY, { [ip]: String(Date.now()) });
          }
          // clientId-based cooldown (secondary — still useful for users behind same IP)
          if (clientId) {
            const lastMsg = await rl.hget(REDIS_CHAT_COOLDOWN_KEY, clientId) as string | null;
            if (lastMsg) {
              const elapsed = Date.now() - Number(lastMsg);
              if (elapsed < CHAT_COOLDOWN_MS) {
                return NextResponse.json({ error: "Slow down" }, { status: 429 });
              }
            }
            await rl.hset(REDIS_CHAT_COOLDOWN_KEY, { [clientId]: String(Date.now()) });
          }
        } catch {}
      }
    }

    const isDev = isAdminRequest(req);
    const { isMod } = isDev ? { isMod: false } : await isModRequest(req);

    // Shadow ban check — nickname OR IP (user thinks message sent, but it's silently dropped)
    const r = getRedis();
    if (r) {
      try {
        const nickBanned = await r.sismember(REDIS_CHAT_BANS_KEY, nickname.toLowerCase());
        const ipBanned = (ip && ip !== "unknown") ? await r.sismember(REDIS_CHAT_IP_BANS_KEY, ip) : false;
        if (nickBanned || ipBanned) {
          // Return a fake message so the banned user sees it locally
          const fakeMsg: ChatMessage = {
            id: `shadow-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            text,
            nickname,
            timestamp: Date.now(),
            ...(flag ? { flag } : {}),
          };
          return NextResponse.json({ message: stripPrivateFields(fakeMsg) });
        }
      } catch {}
    }

    // Build reply reference if provided
    let replyTo: ChatMessage["replyTo"] | undefined;
    if (body.replyTo && typeof body.replyTo === "object") {
      replyTo = {
        id: String(body.replyTo.id || "").slice(0, 50),
        nickname: String(body.replyTo.nickname || "").slice(0, 20),
        text: String(body.replyTo.text || "").slice(0, 100), // truncated preview
      };
    }

    const platform = body.platform === "mobile" ? "mobile" as const : body.platform === "desktop" ? "desktop" as const : undefined;

    const msg: ChatMessage = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      text,
      nickname,
      timestamp: Date.now(),
      ...(flag ? { flag } : {}),
      ...(isDev ? { role: "dev" as const } : isMod ? { role: "mod" as const } : {}),
      ...(platform ? { platform } : {}),
      ...(replyTo ? { replyTo } : {}),
      ...(ip && ip !== "unknown" ? { ip } : {}),
    };

    await addMessage(msg);

    // Return message without IP to client
    const publicMsg = stripPrivateFields(msg);

    // Refresh nickname reservation on activity
    if (clientId) {
      await claimNickname(nickname, clientId, flag).catch(() => {});
    }

    return NextResponse.json({ message: publicMsg });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
