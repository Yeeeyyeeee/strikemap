import { NextRequest, NextResponse } from "next/server";

interface ChatMessage {
  id: string;
  text: string;
  nickname: string;
  timestamp: number;
}

const MAX_MESSAGES = 200;
const MESSAGE_TTL = 60 * 60 * 1000; // 1 hour

let messages: ChatMessage[] = [];

function pruneExpired() {
  const cutoff = Date.now() - MESSAGE_TTL;
  messages = messages.filter((m) => m.timestamp > cutoff);
}

export async function GET(req: NextRequest) {
  pruneExpired();

  const since = Number(req.nextUrl.searchParams.get("since") || "0");
  const filtered = since > 0 ? messages.filter((m) => m.timestamp > since) : messages;

  return NextResponse.json({ messages: filtered });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const text = String(body.text || "").trim().slice(0, 500);
    const nickname = String(body.nickname || "Anon").trim().slice(0, 20);

    if (!text) {
      return NextResponse.json({ error: "Empty message" }, { status: 400 });
    }

    pruneExpired();

    const msg: ChatMessage = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      text,
      nickname,
      timestamp: Date.now(),
    };

    messages.push(msg);

    // FIFO: keep only the most recent messages
    if (messages.length > MAX_MESSAGES) {
      messages = messages.slice(-MAX_MESSAGES);
    }

    return NextResponse.json({ message: msg });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
