import { NextRequest, NextResponse } from "next/server";
import { getRedis } from "@/lib/redis";
import { isAdminRequest } from "@/lib/adminAuth";
import {
  REDIS_CHAT_KEY,
  REDIS_CHAT_BANS_KEY,
  REDIS_CHAT_NICKNAMES_KEY,
  REDIS_CHAT_PINNED_KEY,
  REDIS_CHAT_LIKES_KEY,
  NICKNAME_RESERVE_TTL_MS,
  CHAT_MAX_MESSAGES,
  CHAT_MESSAGE_TTL_MS,
} from "@/lib/constants";
import { containsProfanity, isOffensiveNickname } from "@/lib/profanityFilter";

interface ChatMessage {
  id: string;
  text: string;
  nickname: string;
  timestamp: number;
  flag?: string;
  role?: "dev";
  replyTo?: {
    id: string;
    nickname: string;
    text: string; // truncated preview of original message
  };
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
    const raw = (await r.lrange(REDIS_CHAT_KEY, 0, CHAT_MAX_MESSAGES - 1)) as string[];
    if (!raw || raw.length === 0) return [];

    const cutoff = Date.now() - CHAT_MESSAGE_TTL_MS;
    const messages: ChatMessage[] = [];
    for (const item of raw) {
      const msg: ChatMessage = typeof item === "string" ? JSON.parse(item) : (item as ChatMessage);
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
    const raw = (await r.hget(REDIS_CHAT_NICKNAMES_KEY, nickname.toLowerCase())) as string | null;
    if (!raw) return false;
    const entry =
      typeof raw === "string" ? JSON.parse(raw) : (raw as { clientId: string; timestamp: number });
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
    [nickname.toLowerCase()]: JSON.stringify({
      clientId,
      timestamp: Date.now(),
      ...(flag !== undefined ? { flag } : {}),
    }),
  });
}

/** Release a nickname */
async function releaseNickname(nickname: string, clientId: string): Promise<void> {
  const r = getRedis();
  if (!r) return;
  try {
    const raw = (await r.hget(REDIS_CHAT_NICKNAMES_KEY, nickname.toLowerCase())) as string | null;
    if (!raw) return;
    const entry = typeof raw === "string" ? JSON.parse(raw) : (raw as { clientId: string });
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
    return typeof raw === "string" ? JSON.parse(raw) : (raw as ChatMessage);
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
  const likes = await getLikes(messages.map((m) => m.id));
  return NextResponse.json(
    { messages, pinned, likes },
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

    // Admin ban/unban actions
    if (body.action === "ban" || body.action === "unban" || body.action === "list-bans") {
      if (!isAdminRequest(req)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      const r = getRedis();
      if (!r) return NextResponse.json({ error: "Redis not configured" }, { status: 500 });

      if (body.action === "ban") {
        const target = String(body.nickname || "")
          .trim()
          .toLowerCase();
        if (!target) return NextResponse.json({ error: "Nickname required" }, { status: 400 });
        await r.sadd(REDIS_CHAT_BANS_KEY, target);
        return NextResponse.json({ ok: true, banned: target });
      }
      if (body.action === "unban") {
        const target = String(body.nickname || "")
          .trim()
          .toLowerCase();
        if (!target) return NextResponse.json({ error: "Nickname required" }, { status: 400 });
        await r.srem(REDIS_CHAT_BANS_KEY, target);
        return NextResponse.json({ ok: true, unbanned: target });
      }
      if (body.action === "list-bans") {
        const bans = await r.smembers(REDIS_CHAT_BANS_KEY);
        return NextResponse.json({ bans });
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
          ...(message.role === "dev" ? { role: "dev" as const } : {}),
        };
        await r.set(REDIS_CHAT_PINNED_KEY, JSON.stringify(pinned));
        return NextResponse.json({ ok: true, pinned });
      }
      if (body.action === "unpin") {
        await r.del(REDIS_CHAT_PINNED_KEY);
        return NextResponse.json({ ok: true, pinned: null });
      }
    }

    // Like action — any user
    if (body.action === "like") {
      const messageId = String(body.messageId || "").trim();
      const clientId = String(body.clientId || "").trim();
      if (!messageId || !clientId) {
        return NextResponse.json({ error: "messageId and clientId required" }, { status: 400 });
      }
      const r = getRedis();
      if (!r) return NextResponse.json({ error: "Redis not configured" }, { status: 500 });

      // Prevent double-liking: check per-client liked set
      const likedKey = `chat_liked:${clientId}`;
      const alreadyLiked = await r.sismember(likedKey, messageId);
      if (alreadyLiked) {
        return NextResponse.json({ ok: true, alreadyLiked: true });
      }

      await r.sadd(likedKey, messageId);
      // Expire the liked set after 2 hours (matches message TTL)
      await r.expire(likedKey, 7200);
      const newCount = await r.hincrby(REDIS_CHAT_LIKES_KEY, messageId, 1);
      return NextResponse.json({ ok: true, likes: newCount });
    }

    // Nickname claim/check actions
    if (body.action === "claim-nickname") {
      const nick = String(body.nickname || "")
        .trim()
        .slice(0, 20);
      const clientId = String(body.clientId || "").trim();
      if (!nick || !clientId)
        return NextResponse.json({ error: "Nickname and clientId required" }, { status: 400 });
      if (isOffensiveNickname(nick))
        return NextResponse.json({ error: "That username is not allowed" }, { status: 400 });

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
      const clientId = String(body.clientId || "").trim();
      const nickname = String(body.nickname || "").trim();
      const flag = body.flag ? String(body.flag).slice(0, 4) : "";
      if (!clientId || !nickname)
        return NextResponse.json({ error: "clientId and nickname required" }, { status: 400 });
      await claimNickname(nickname, clientId, flag);
      return NextResponse.json({ ok: true, flag });
    }

    if (body.action === "check-nickname") {
      const nick = String(body.nickname || "")
        .trim()
        .slice(0, 20);
      const clientId = String(body.clientId || "").trim();
      if (!nick || !clientId)
        return NextResponse.json({ error: "Nickname and clientId required" }, { status: 400 });
      const taken = await isNicknameTaken(nick, clientId);
      return NextResponse.json({ available: !taken });
    }

    const text = String(body.text || "")
      .trim()
      .slice(0, 500);
    const nickname = String(body.nickname || "Anon")
      .trim()
      .slice(0, 20);
    const flag = body.flag ? String(body.flag).slice(0, 4) : undefined;

    if (!text) {
      return NextResponse.json({ error: "Empty message" }, { status: 400 });
    }

    // Profanity filter — block offensive nicknames and messages
    if (isOffensiveNickname(nickname)) {
      return NextResponse.json({ error: "That username is not allowed" }, { status: 400 });
    }
    const blockedWord = containsProfanity(text);
    if (blockedWord) {
      return NextResponse.json(
        { error: "Message contains inappropriate content" },
        { status: 400 }
      );
    }

    const isDev = isAdminRequest(req);

    // Shadow ban check — user thinks message sent, but it's silently dropped
    const r = getRedis();
    if (r) {
      try {
        const banned = await r.sismember(REDIS_CHAT_BANS_KEY, nickname.toLowerCase());
        if (banned) {
          // Return a fake message so the banned user sees it locally
          const fakeMsg: ChatMessage = {
            id: `shadow-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            text,
            nickname,
            timestamp: Date.now(),
            ...(flag ? { flag } : {}),
          };
          return NextResponse.json({ message: fakeMsg });
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

    const msg: ChatMessage = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      text,
      nickname,
      timestamp: Date.now(),
      ...(flag ? { flag } : {}),
      ...(isDev ? { role: "dev" as const } : {}),
      ...(replyTo ? { replyTo } : {}),
    };

    await addMessage(msg);

    // Refresh nickname reservation on activity
    const clientId = String(body.clientId || "").trim();
    if (clientId) {
      await claimNickname(nickname, clientId, flag).catch(() => {});
    }

    return NextResponse.json({ message: msg });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
