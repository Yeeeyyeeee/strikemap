import { NextRequest, NextResponse } from "next/server";
import { getRedis } from "@/lib/redis";
import { isAdminRequest } from "@/lib/adminAuth";
import { REDIS_CHAT_KEY, CHAT_MAX_MESSAGES, CHAT_MESSAGE_TTL_MS } from "@/lib/constants";

interface ChatMessage {
  id: string;
  text: string;
  nickname: string;
  timestamp: number;
  role?: "dev";
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

export async function GET(req: NextRequest) {
  const since = Number(req.nextUrl.searchParams.get("since") || "0");
  const messages = await getMessages(since);
  return NextResponse.json(
    { messages },
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
    const text = String(body.text || "").trim().slice(0, 500);
    const nickname = String(body.nickname || "Anon").trim().slice(0, 20);

    if (!text) {
      return NextResponse.json({ error: "Empty message" }, { status: 400 });
    }

    const isDev = isAdminRequest(req);

    const msg: ChatMessage = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      text,
      nickname,
      timestamp: Date.now(),
      ...(isDev ? { role: "dev" as const } : {}),
    };

    await addMessage(msg);
    return NextResponse.json({ message: msg });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
