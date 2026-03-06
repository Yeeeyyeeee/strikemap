import { NextRequest, NextResponse } from "next/server";
import { getRedis } from "@/lib/redis";
import { isAdminRequest } from "@/lib/adminAuth";
import { REDIS_SUGGESTIONS_KEY } from "@/lib/constants";

function sanitizeId(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9\-]/g, "").slice(0, 64);
}

function stripHtml(raw: string): string {
  return raw.replace(/<[^>]*>/g, "");
}

interface Suggestion {
  id: string;
  title: string;
  device: "desktop" | "mobile" | "all";
  description: string;
  status: "wip" | "completed";
  votes: number;
  voterIds: string[];
  downvoterIds?: string[];
  createdAt: number;
  nickname: string;
}

// In-memory fallback — use globalThis to survive module re-evaluation in dev
const globalStore = globalThis as unknown as { __suggestions?: Suggestion[] };
if (!globalStore.__suggestions) globalStore.__suggestions = [];
const getFallback = () => globalStore.__suggestions!;
const setFallback = (s: Suggestion[]) => { globalStore.__suggestions = s; };

async function loadSuggestions(): Promise<Suggestion[]> {
  const redis = getRedis();
  if (!redis) return getFallback();
  try {
    const raw = await redis.get(REDIS_SUGGESTIONS_KEY);
    if (!raw) return getFallback();
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (Array.isArray(parsed)) {
      setFallback(parsed);
      return parsed;
    }
    return getFallback();
  } catch (e) {
    console.error("[suggestions] load error:", e);
    return getFallback();
  }
}

async function saveSuggestions(suggestions: Suggestion[]): Promise<void> {
  setFallback(suggestions);
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.set(REDIS_SUGGESTIONS_KEY, JSON.stringify(suggestions));
  } catch (e) {
    console.error("[suggestions] save error:", e);
  }
}

function sortSuggestions(arr: Suggestion[]): Suggestion[] {
  return arr.sort((a, b) => {
    if (b.votes !== a.votes) return b.votes - a.votes;
    return b.createdAt - a.createdAt;
  });
}

export async function GET() {
  const suggestions = await loadSuggestions();
  return NextResponse.json(
    { suggestions: sortSuggestions(suggestions) },
    { headers: { "Cache-Control": "public, s-maxage=5, stale-while-revalidate=10" } }
  );
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;

    if (action === "add") {
      const title = stripHtml(String(body.title || "")).trim().slice(0, 100);
      const description = stripHtml(String(body.description || "")).trim().slice(0, 1000);
      const device = ["desktop", "mobile", "all"].includes(body.device) ? body.device : "all";
      const nickname = stripHtml(String(body.nickname || "Anon")).trim().slice(0, 20);

      if (!title || !description) {
        return NextResponse.json({ error: "Title and description required" }, { status: 400 });
      }

      // Rate limit: max 1 suggestion per 60s per IP
      const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
      const redis = getRedis();
      if (redis) {
        try {
          const key = `sug_rl:${ip}`;
          const last = await redis.get(key) as string | null;
          if (last && Date.now() - Number(last) < 60_000) {
            return NextResponse.json({ error: "Please wait before submitting another suggestion" }, { status: 429 });
          }
          await redis.set(key, String(Date.now()), { ex: 60 });
        } catch {}
      }

      const suggestion: Suggestion = {
        id: `sug-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        title,
        device,
        description,
        status: "wip",
        votes: 0,
        voterIds: [],
        createdAt: Date.now(),
        nickname,
      };

      const suggestions = await loadSuggestions();
      suggestions.push(suggestion);
      await saveSuggestions(suggestions);

      return NextResponse.json({ ok: true, suggestion });
    }

    if (action === "vote") {
      const id = sanitizeId(String(body.id || ""));
      const voterId = sanitizeId(String(body.voterId || ""));
      if (!id || !voterId) {
        return NextResponse.json({ error: "id and voterId required" }, { status: 400 });
      }

      const suggestions = await loadSuggestions();
      const sug = suggestions.find((s) => s.id === id);
      if (!sug) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      if (sug.voterIds.includes(voterId)) {
        return NextResponse.json({ error: "Already voted" }, { status: 409 });
      }

      sug.voterIds.push(voterId);
      sug.votes++;
      await saveSuggestions(suggestions);

      return NextResponse.json({ ok: true, votes: sug.votes });
    }

    if (action === "downvote") {
      const id = sanitizeId(String(body.id || ""));
      const voterId = sanitizeId(String(body.voterId || ""));
      if (!id || !voterId) {
        return NextResponse.json({ error: "id and voterId required" }, { status: 400 });
      }

      const suggestions = await loadSuggestions();
      const sug = suggestions.find((s) => s.id === id);
      if (!sug) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      // Can't downvote if already upvoted or already downvoted
      if (sug.voterIds.includes(voterId)) {
        return NextResponse.json({ error: "Already voted" }, { status: 409 });
      }
      const downvoterIds = sug.downvoterIds || [];
      if (downvoterIds.includes(voterId)) {
        return NextResponse.json({ error: "Already downvoted" }, { status: 409 });
      }

      downvoterIds.push(voterId);
      sug.downvoterIds = downvoterIds;
      sug.votes--;
      await saveSuggestions(suggestions);

      return NextResponse.json({ ok: true, votes: sug.votes });
    }

    if (action === "status") {
      if (!isAdminRequest(req)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      const { id, status } = body;
      if (!id || !["wip", "completed"].includes(status)) {
        return NextResponse.json({ error: "Invalid" }, { status: 400 });
      }

      const suggestions = await loadSuggestions();
      const sug = suggestions.find((s) => s.id === id);
      if (!sug) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }

      sug.status = status;
      await saveSuggestions(suggestions);

      return NextResponse.json({ ok: true });
    }

    if (action === "clear") {
      if (!isAdminRequest(req)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      const { id } = body;

      const suggestions = await loadSuggestions();
      const filtered = suggestions.filter((s) => s.id !== id);
      await saveSuggestions(filtered);

      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
