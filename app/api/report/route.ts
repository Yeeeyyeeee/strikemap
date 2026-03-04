import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI, type ResponseSchema, SchemaType } from "@google/generative-ai";
import { getRedis } from "@/lib/redis";
import {
  REDIS_INCIDENTS_KEY,
  REDIS_FEED_POSTS_KEY,
  REDIS_REPORT_KEY,
  REPORT_CACHE_TTL_S,
} from "@/lib/constants";
import type { Incident, BriefingReport } from "@/lib/types";

// Inline type to avoid importing lib/telegram which has heavy side effects
interface FeedPost {
  id: string;
  channel: string;
  channelUsername: string;
  text: string;
  date: string;
  timestamp: string;
  videoUrl: string;
  imageUrls: string[];
}

export const maxDuration = 60;

const VALID_PERIODS = ["6", "12", "24"];
const MAX_FEED_POSTS = 200;
const POST_TRUNCATE_LEN = 500;

// ── Gemini response schema ──

const reportSchema: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    executive_summary: {
      type: SchemaType.STRING,
      description:
        "2-4 paragraph high-level overview of the situation. Cover the most significant events, overall trajectory, and key takeaways.",
    },
    key_developments: {
      type: SchemaType.ARRAY,
      description: "3-10 key developments ordered by significance",
      items: {
        type: SchemaType.OBJECT,
        properties: {
          headline: { type: SchemaType.STRING, description: "One-line headline" },
          detail: { type: SchemaType.STRING, description: "2-3 sentence explanation" },
          severity: { type: SchemaType.STRING, description: "low, medium, high, or critical" },
        },
        required: ["headline", "detail", "severity"],
      },
    },
    timeline: {
      type: SchemaType.ARRAY,
      description: "Chronological list of significant events",
      items: {
        type: SchemaType.OBJECT,
        properties: {
          time: { type: SchemaType.STRING, description: "Timestamp, e.g. '14:30 UTC' or 'Morning'" },
          event: { type: SchemaType.STRING, description: "What happened" },
          location: { type: SchemaType.STRING, description: "Where it happened" },
        },
        required: ["time", "event", "location"],
      },
    },
    statistics: {
      type: SchemaType.OBJECT,
      description: "Numerical summary of the period",
      properties: {
        total_strikes: { type: SchemaType.NUMBER },
        iran_strikes: { type: SchemaType.NUMBER },
        us_israel_strikes: { type: SchemaType.NUMBER },
        weapons_used: {
          type: SchemaType.ARRAY,
          items: {
            type: SchemaType.OBJECT,
            properties: {
              weapon: { type: SchemaType.STRING },
              count: { type: SchemaType.NUMBER },
            },
            required: ["weapon", "count"],
          },
        },
        locations_affected: {
          type: SchemaType.ARRAY,
          items: { type: SchemaType.STRING },
        },
        overall_damage_level: {
          type: SchemaType.STRING,
          description: "low, moderate, severe, or critical",
        },
      },
      required: [
        "total_strikes",
        "iran_strikes",
        "us_israel_strikes",
        "weapons_used",
        "locations_affected",
        "overall_damage_level",
      ],
    },
    threat_assessment: {
      type: SchemaType.STRING,
      description:
        "1-2 paragraph forward-looking assessment of likely near-term developments based on the data",
    },
    sources_summary: {
      type: SchemaType.STRING,
      description:
        "Brief note on data sources used (number of incidents analyzed, number of channel posts reviewed)",
    },
  },
  required: [
    "executive_summary",
    "key_developments",
    "timeline",
    "statistics",
    "threat_assessment",
    "sources_summary",
  ],
};

const SYSTEM_PROMPT = `You are a senior military intelligence analyst producing a professional situational briefing report. You will be given two categories of data:

1. INCIDENTS — structured strike event records with location, weapon, side (iran/us/israel), damage severity, and timestamps.
2. FEED POSTS — raw Telegram channel posts from conflict monitoring channels, containing real-time news, developments, and commentary.

Produce a comprehensive situational briefing report. The report must be:
- Written in neutral, professional intelligence language (no editorializing, no emotional language)
- Factual and data-driven
- Organized into clear sections
- Comprehensive but concise — cover ALL significant events, do not omit any

NEUTRALITY RULES:
- Use strictly neutral, factual language throughout
- NEVER use politically charged terms like "regime", "terror", "terrorist", "occupied", "Zionist", "apartheid", "entity", "resistance", or "liberation"
- Use neutral alternatives: "government" instead of "regime", "forces" instead of "militants"
- Use internationally recognized location names

Analyze ALL provided data and produce the report sections as specified in the JSON schema.`;

// ── Helpers ──

function withinWindow(ts: string | undefined, cutoff: number): boolean {
  if (!ts) return false;
  const t = new Date(ts).getTime();
  return !isNaN(t) && t >= cutoff;
}

function formatIncident(inc: Incident): string {
  const ts = inc.timestamp || inc.date || "";
  const parts = [
    `[${ts}]`,
    inc.location || "Unknown location",
    `— ${inc.side} strike.`,
    inc.weapon ? `Weapon: ${inc.weapon}.` : "",
    inc.target_type ? `Target: ${inc.target_type}.` : "",
    inc.damage_severity ? `Damage: ${inc.damage_severity}.` : "",
    inc.damage_assessment || "",
  ];
  return parts.filter(Boolean).join(" ");
}

function formatPost(post: FeedPost): string {
  const ts = post.timestamp || post.date || "";
  const text = post.text.length > POST_TRUNCATE_LEN
    ? post.text.slice(0, POST_TRUNCATE_LEN) + "..."
    : post.text;
  return `[${ts}] [${post.channelUsername || post.channel}] ${text}`;
}

// ── GET handler ──

export async function GET(request: NextRequest) {
  const period = request.nextUrl.searchParams.get("period") || "24";
  if (!VALID_PERIODS.includes(period)) {
    return NextResponse.json({ error: "Invalid period. Use 6, 12, or 24." }, { status: 400 });
  }

  const redis = getRedis();

  // 1. Check cache
  let staleReport: BriefingReport | null = null;
  if (redis) {
    try {
      const cached = await redis.hget<BriefingReport>(REDIS_REPORT_KEY, period);
      if (cached && cached.generatedAt) {
        const age = Date.now() - new Date(cached.generatedAt).getTime();
        if (age < REPORT_CACHE_TTL_S * 1000) {
          return NextResponse.json(
            { report: cached, cached: true },
            { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } }
          );
        }
        // Keep stale report to serve if generation fails or is locked
        staleReport = cached;
      }
    } catch {}

    // 1b. Generation lock — only one request regenerates at a time
    try {
      const lockKey = `report_lock_${period}`;
      const acquired = await redis.set(lockKey, "1", { nx: true, ex: 120 });
      if (!acquired && staleReport) {
        // Another request is already generating — serve stale
        return NextResponse.json(
          { report: staleReport, cached: true },
          { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } }
        );
      }
    } catch {}
  }

  // 2. Fetch data
  const cutoff = Date.now() - parseInt(period) * 60 * 60 * 1000;
  let incidents: Incident[] = [];
  let feedPosts: FeedPost[] = [];

  if (redis) {
    try {
      // Incidents
      const incHash = await redis.hgetall<Record<string, Incident>>(REDIS_INCIDENTS_KEY);
      if (incHash) {
        incidents = Object.values(incHash)
          .filter((inc) => withinWindow(inc.timestamp || inc.date, cutoff))
          .sort((a, b) => {
            const ta = new Date(a.timestamp || a.date).getTime();
            const tb = new Date(b.timestamp || b.date).getTime();
            return tb - ta;
          });
      }

      // Feed posts
      const raw = await redis.get<FeedPost[]>(REDIS_FEED_POSTS_KEY);
      if (Array.isArray(raw)) {
        feedPosts = raw
          .filter((p) => withinWindow(p.timestamp || p.date, cutoff))
          .slice(0, MAX_FEED_POSTS);
      }
    } catch (err) {
      console.error("Report: failed to fetch data from Redis:", err);
    }
  }

  // 3. Empty check
  if (incidents.length === 0 && feedPosts.length === 0) {
    const emptyReport: BriefingReport = {
      executive_summary: `No significant activity was reported in the last ${period} hours. Monitoring continues across all channels.`,
      key_developments: [],
      timeline: [],
      statistics: {
        total_strikes: 0,
        iran_strikes: 0,
        us_israel_strikes: 0,
        weapons_used: [],
        locations_affected: [],
        overall_damage_level: "low",
      },
      threat_assessment: "Insufficient data for threat assessment. Situation remains under observation.",
      sources_summary: `0 incidents and 0 feed posts analyzed for this ${period}-hour period.`,
      generatedAt: new Date().toISOString(),
      period: parseInt(period),
      incidentCount: 0,
      feedPostCount: 0,
    };
    return NextResponse.json({ report: emptyReport, cached: false });
  }

  // 4. Build prompt
  const incidentLines = incidents.map(formatIncident).join("\n");
  const postLines = feedPosts.map(formatPost).join("\n");

  const dataPrompt = `${SYSTEM_PROMPT}

Produce a ${period}-HOUR situational briefing report based on the following data:

=== INCIDENTS (last ${period} hours): ${incidents.length} records ===
${incidentLines || "(none)"}

=== FEED POSTS (last ${period} hours): ${feedPosts.length} posts ===
${postLines || "(none)"}`;

  // 5. Call Gemini
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "AI service unavailable" }, { status: 503 });
  }

  const MODELS = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash-lite"];

  try {
    const genAI = new GoogleGenerativeAI(apiKey);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let parsed: any = null;
    let lastErr: unknown = null;

    for (const modelName of MODELS) {
      try {
        const model = genAI.getGenerativeModel({
          model: modelName,
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: reportSchema,
          },
        });
        const result = await model.generateContent(dataPrompt);
        parsed = JSON.parse(result.response.text());
        break;
      } catch (e) {
        lastErr = e;
        const msg = e instanceof Error ? e.message : String(e);
        console.warn(`Report: ${modelName} failed (${msg.slice(0, 100)}), trying next model...`);
        // Continue to next model on any error
        continue;
      }
    }

    if (!parsed) throw lastErr;

    const report: BriefingReport = {
      executive_summary: parsed.executive_summary || "",
      key_developments: parsed.key_developments || [],
      timeline: parsed.timeline || [],
      statistics: parsed.statistics || {
        total_strikes: 0,
        iran_strikes: 0,
        us_israel_strikes: 0,
        weapons_used: [],
        locations_affected: [],
        overall_damage_level: "low",
      },
      threat_assessment: parsed.threat_assessment || "",
      sources_summary: parsed.sources_summary || "",
      generatedAt: new Date().toISOString(),
      period: parseInt(period),
      incidentCount: incidents.length,
      feedPostCount: feedPosts.length,
    };

    // 6. Cache
    if (redis) {
      redis.hset(REDIS_REPORT_KEY, { [period]: report }).catch(() => {});
    }

    return NextResponse.json(
      { report, cached: false },
      { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Report: Gemini generation failed:", msg, err);
    // Serve stale report on failure instead of erroring
    if (staleReport) {
      return NextResponse.json(
        { report: staleReport, cached: true },
        { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } }
      );
    }
    return NextResponse.json({ error: "Failed to generate briefing", detail: msg }, { status: 500 });
  }
}
