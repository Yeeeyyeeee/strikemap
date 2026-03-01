import { GoogleGenerativeAI, type ResponseSchema, SchemaType } from "@google/generative-ai";
import { scrapeChannel } from "./telegram";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Leader {
  id: string;
  name: string;
  role: string;
  tier: 1 | 2 | 3;
  dead: boolean;
  deathDate?: string;
  deathCause?: string;
  imageUrl?: string;
}

export interface LeadershipUpdate {
  name: string;
  role: string;
  tier: 1 | 2 | 3;
  dead: boolean;
  deathDate: string;
  deathCause: string;
  imageSearchQuery: string;
}

// ---------------------------------------------------------------------------
// Base leadership data (manually curated starting point)
// ---------------------------------------------------------------------------

export const BASE_LEADERS: Leader[] = [
  // Tier 1 — Supreme Leadership
  {
    id: "khamenei",
    name: "Ali Khamenei",
    role: "Supreme Leader of Iran",
    tier: 1,
    dead: true,
    deathDate: "28 Feb 2026",
    deathCause: "US-Israeli strikes, Iran",
    imageUrl: "/leaders/khamenei.jpg",
  },
  // Tier 2 — Senior Officials
  {
    id: "pezeshkian",
    name: "Masoud Pezeshkian",
    role: "President of Iran",
    tier: 2,
    dead: false,
    imageUrl: "/leaders/pezeshkian.jpg",
  },
  {
    id: "salami",
    name: "Hossein Salami",
    role: "IRGC Commander-in-Chief",
    tier: 2,
    dead: false,
    imageUrl: "/leaders/salami.jpg",
  },
  {
    id: "qaani",
    name: "Esmail Qaani",
    role: "Quds Force Commander",
    tier: 2,
    dead: false,
    imageUrl: "/leaders/qaani.jpg",
  },
  {
    id: "bagheri",
    name: "Mohammad Bagheri",
    role: "Chief of General Staff",
    tier: 2,
    dead: false,
    imageUrl: "/leaders/bagheri.jpg",
  },
  {
    id: "nasirzadeh",
    name: "Aziz Nasirzadeh",
    role: "Minister of Defense",
    tier: 2,
    dead: false,
    imageUrl: "/leaders/nasirzadeh.jpg",
  },
  {
    id: "ahmadinejad",
    name: "Mahmoud Ahmadinejad",
    role: "Former President of Iran",
    tier: 2,
    dead: true,
    deathDate: "1 Mar 2026",
    deathCause: "US-Israeli strike, Tehran",
    imageUrl: "/leaders/ahmadinejad.jpg",
  },
  // Tier 3 — Eliminated Commanders
  {
    id: "soleimani",
    name: "Qasem Soleimani",
    role: "Quds Force Commander",
    tier: 3,
    dead: true,
    deathDate: "3 Jan 2020",
    deathCause: "US drone strike, Baghdad",
    imageUrl: "/leaders/soleimani.jpg",
  },
  {
    id: "fakhrizadeh",
    name: "Mohsen Fakhrizadeh",
    role: "Chief Nuclear Scientist",
    tier: 3,
    dead: true,
    deathDate: "27 Nov 2020",
    deathCause: "Assassination, Absard",
    imageUrl: "/leaders/fakhrizadeh.jpg",
  },
  {
    id: "haniyeh",
    name: "Ismail Haniyeh",
    role: "Hamas Political Bureau Chief",
    tier: 3,
    dead: true,
    deathDate: "31 Jul 2024",
    deathCause: "Assassination, Tehran",
    imageUrl: "/leaders/haniyeh.jpg",
  },
  {
    id: "nasrallah",
    name: "Hassan Nasrallah",
    role: "Hezbollah Secretary-General",
    tier: 3,
    dead: true,
    deathDate: "27 Sep 2024",
    deathCause: "Israeli airstrike, Beirut",
    imageUrl: "/leaders/nasrallah.jpg",
  },
  {
    id: "nilforoushan",
    name: "Abbas Nilforoushan",
    role: "IRGC Deputy Commander",
    tier: 3,
    dead: true,
    deathDate: "27 Sep 2024",
    deathCause: "Israeli airstrike, Beirut",
    imageUrl: "/leaders/nilforoushan.jpg",
  },
  {
    id: "mousavi",
    name: "Razi Mousavi",
    role: "IRGC Senior Adviser in Syria",
    tier: 3,
    dead: true,
    deathDate: "25 Dec 2023",
    deathCause: "Israeli airstrike, Damascus",
    imageUrl: "/leaders/mousavi.jpg",
  },
];

// ---------------------------------------------------------------------------
// Gemini AI: parse telegram posts for leadership death reports
// ---------------------------------------------------------------------------

const leadershipSchema: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    reports: {
      type: SchemaType.ARRAY,
      description: "List of confirmed or reported deaths/eliminations of Iranian regime figures",
      items: {
        type: SchemaType.OBJECT,
        properties: {
          name: { type: SchemaType.STRING, description: "Full name of the person killed" },
          role: { type: SchemaType.STRING, description: "Their role/title in the Iranian regime, IRGC, or allied proxy group" },
          tier: { type: SchemaType.NUMBER, description: "Importance: 1=supreme leader level, 2=senior official (president, minister, force commander), 3=commander/operative/adviser" },
          deathDate: { type: SchemaType.STRING, description: "Date of death if mentioned, e.g. '15 Mar 2025'" },
          deathCause: { type: SchemaType.STRING, description: "How they died, e.g. 'Israeli airstrike, Damascus'" },
          confidence: { type: SchemaType.STRING, description: "confirmed or unconfirmed" },
        },
        required: ["name", "role", "tier", "deathDate", "deathCause", "confidence"],
      },
    },
  },
  required: ["reports"],
};

const LEADERSHIP_PROMPT = `You are a military intelligence analyst monitoring Telegram channels for reports about the deaths or eliminations of Iranian regime leadership figures.

Analyze the following batch of Telegram posts. Identify ANY reports of deaths, killings, assassinations, or eliminations of:
- Iranian government officials (president, ministers, MPs)
- IRGC (Islamic Revolutionary Guard Corps) commanders and officers
- Quds Force operatives
- Iranian military generals and commanders
- Iranian nuclear scientists
- Leaders of Iranian proxy groups (Hezbollah, Hamas, Houthis, Iraqi Shia militias)
- Any senior figure in the Iranian "axis of resistance"

For each death report found, extract:
- name: Full name of the person
- role: Their title/position
- tier: 1 if supreme leader level, 2 if senior official (president, minister, force commander-in-chief), 3 for all others (commanders, operatives, advisers, scientists, proxy leaders)
- deathDate: When they died
- deathCause: How they died and where
- confidence: "confirmed" if the post states it as fact/confirmed, "unconfirmed" if it says "reportedly" or "allegedly"

IMPORTANT:
- Only include DEATH reports, not injuries or arrests
- Only include Iranian regime figures or their proxy allies, not opposition/civilian deaths
- If no death reports are found, return an empty reports array
- Do NOT include people who are already well-known to have been killed before 2025 (like Soleimani, Nasrallah, Haniyeh, Fakhrizadeh, Nilforoushan, Mousavi) unless the post describes a NEW death event

Posts to analyze:
`;

// In-memory cache for AI results (refreshes with server restart)
const aiCache = new Map<string, LeadershipUpdate[]>();

export async function analyzePostsForDeaths(posts: { text: string; date: string }[]): Promise<LeadershipUpdate[]> {
  if (posts.length === 0) return [];

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return [];

  // Create cache key from post content
  const cacheKey = posts.map((p) => p.text.slice(0, 100)).join("|").slice(0, 500);
  if (aiCache.has(cacheKey)) {
    return aiCache.get(cacheKey)!;
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: leadershipSchema,
      },
    });

    const postTexts = posts
      .map((p, i) => `--- Post ${i + 1} (${p.date}) ---\n${p.text}`)
      .join("\n\n");

    const result = await model.generateContent(`${LEADERSHIP_PROMPT}\n${postTexts}`);
    const parsed = JSON.parse(result.response.text());

    const updates: LeadershipUpdate[] = (parsed.reports || [])
      .filter((r: { confidence: string }) => r.confidence === "confirmed")
      .map((r: { name: string; role: string; tier: number; deathDate: string; deathCause: string }) => ({
        name: r.name,
        role: r.role,
        tier: Math.min(Math.max(r.tier, 1), 3) as 1 | 2 | 3,
        dead: true,
        deathDate: r.deathDate,
        deathCause: r.deathCause,
        imageSearchQuery: r.name,
      }));

    aiCache.set(cacheKey, updates);
    return updates;
  } catch (err) {
    console.error("Leadership AI analysis failed:", err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Fetch leader image from Wikipedia
// ---------------------------------------------------------------------------

export async function fetchWikipediaImage(name: string): Promise<string | null> {
  try {
    const searchName = name.replace(/\s+/g, "_");
    const res = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(searchName)}`,
      {
        headers: {
          "User-Agent": "StrikeMap/1.0 (leadership tracker)",
        },
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data?.originalimage?.source || data?.thumbnail?.source || null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Main: build merged leadership list
// ---------------------------------------------------------------------------

// Death-related keywords to filter telegram posts
const DEATH_KEYWORDS = [
  "killed", "dead", "eliminated", "assassinated", "assassination",
  "martyred", "martyr", "dies", "died", "death", "struck down",
  "taken out", "neutralized", "confirmed dead", "airstrike kill",
  "targeted killing", "liquidated",
];

function isDeathRelated(text: string): boolean {
  const lower = text.toLowerCase();
  return DEATH_KEYWORDS.some((kw) => lower.includes(kw));
}

function getConfiguredChannels(): string[] {
  const channels = process.env.TELEGRAM_CHANNELS || "";
  return channels
    .split(",")
    .map((c) => c.trim().replace(/^@/, ""))
    .filter(Boolean);
}

export async function getLeadership(): Promise<Leader[]> {
  const leaders = BASE_LEADERS.map((l) => ({ ...l }));

  // Scrape telegram channels for death reports
  const channels = getConfiguredChannels();
  if (channels.length === 0) return leaders;

  try {
    const results = await Promise.all(channels.map((ch) => scrapeChannel(ch)));
    const allPosts = results.flat();

    // Filter to death-related posts
    const deathPosts = allPosts.filter((p) => isDeathRelated(p.text));
    if (deathPosts.length === 0) return leaders;

    // Send to Gemini for analysis
    const updates = await analyzePostsForDeaths(
      deathPosts.map((p) => ({ text: p.text, date: p.date }))
    );

    for (const update of updates) {
      // Check if this person is already in our list
      const normalizedName = update.name.toLowerCase().trim();
      const existing = leaders.find((l) =>
        l.name.toLowerCase().trim() === normalizedName ||
        normalizedName.includes(l.name.toLowerCase().split(" ").pop() || "___")
      );

      if (existing) {
        // Update existing leader status
        if (!existing.dead) {
          existing.dead = true;
          existing.deathDate = update.deathDate;
          existing.deathCause = update.deathCause;
        }
      } else {
        // New person — add to the list
        const id = update.name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");

        // Try to get their image from Wikipedia
        const imageUrl = await fetchWikipediaImage(update.name);

        leaders.push({
          id,
          name: update.name,
          role: update.role,
          tier: update.tier,
          dead: true,
          deathDate: update.deathDate,
          deathCause: update.deathCause,
          imageUrl: imageUrl || undefined,
        });
      }
    }
  } catch (err) {
    console.error("Leadership telegram scan failed:", err);
  }

  return leaders;
}
