import { Incident, MediaItem } from "./types";
import { enrichBatch } from "./geocodeWithAI";
import { enrichWithKeywords } from "./keywordEnricher";
import { applyEnrichment } from "./enrichmentUtils";
import { neutralizeText, hasBiasIndicators, neutralizeWithAI } from "./neutralize";

const IRAN_KEYWORDS = [
  "iran",
  "irgc",
  "iranian",
  "ballistic missile",
  "cruise missile",
  "shahed",
  "fateh",
  "emad",
  "ghadr",
  "sejjil",
  "khorramshahr",
  "tehran",
  "missile strike",
  "drone strike",
  "missile attack",
  "retaliatory strike",
  "explosion",
  "explosions",
  "strike",
  "airstrike",
  "air strike",
  "attack",
  "intercept",
  "intercepted",
  "siren",
  "sirens",
  "incoming",
  "missile",
  "rocket",
  "drone",
  "israel",
  "idf",
  "hezbollah",
  "houthi",
  "centcom",
  "pentagon",
  "bahrain",
  "iraq",
  "syria",
  "yemen",
  "lebanon",
  "gaza",
  "tel aviv",
  "haifa",
  "isfahan",
  "bandar abbas",
];

export type FeedCategory = "government" | "analysis" | "strike" | "general";

export interface ChannelPost {
  id: string;
  channel: string;
  channelUsername: string;
  text: string;
  date: string;
  timestamp: string; // full ISO 8601 datetime
  videoUrl: string;
  imageUrls: string[];
  lat?: number;
  lng?: number;
  location?: string;
  category?: FeedCategory;
}

// Blocklist: reject messages about Russia/Ukraine conflict even if they match generic keywords
const RUSSIA_UKRAINE_BLOCKLIST = [
  "ukraine", "ukrainian", "україн", "украин",
  "kyiv", "kiev", "kharkiv", "odesa", "odessa", "mykolaiv", "mykolayiv",
  "zaporizhzhia", "dnipro", "lviv", "kherson", "donetsk", "luhansk",
  "mariupol", "crimea", "sevastopol", "sumy", "poltava", "chernihiv",
  "zhytomyr", "vinnytsia", "rivne", "ternopil", "ivano-frankivsk",
  "cherkasy", "kirovohrad", "kropyvnytskyi", "voznesensk",
  "russia", "russian", "россия", "русск", "москва", "moscow",
  "kursk", "belgorod", "bryansk", "rostov",
  "zelensky", "зеленськ", "зеленск",
  "putin", "путин",
  "iskander", "kalibr", "kinzhal",
  "залужн", "сирський", "будан",
  "повітряна тривога", "воздушная тревога",
  "зсу", "всу", "збройні сили",
];

// Non-military content blocklist: reject entertainment, sports, cultural, and political news
// that match generic keywords like "strike", "attack", "gaza" but are not military events
const NON_MILITARY_BLOCKLIST = [
  "oscar", "oscars", "academy award", "nominated", "nomination",
  "film", "movie", "documentary", "cinema", "director", "actress", "actor",
  "box office", "premiere", "screenplay", "brad pitt", "joaquin phoenix",
  "netflix", "hbo", "disney",
  "football", "soccer", "cricket", "tennis", "olympic", "world cup",
  "fifa", "championship", "tournament", "playoff",
  "election", "ballot", "vote count", "polling station", "campaign rally",
  "smear campaign", "defamation", "lawsuit", "court ruling",
  "concert", "album", "spotify", "grammy", "billboard",
  "stock market", "nasdaq", "dow jones", "wall street", "ipo",
  "earthquake", "tsunami", "hurricane", "wildfire", "flood",
  "covid", "pandemic", "vaccine", "vaccination",
];

// High-specificity military keywords that override the non-military blocklist
const HIGH_SPECIFICITY_MILITARY = [
  "missile", "ballistic", "cruise missile", "warhead", "intercept",
  "airstrike", "air strike", "bombing", "bombardment", "shelling",
  "idf", "irgc", "centcom", "pentagon", "military base",
  "casualties", "killed", "wounded", "destroyed",
  "siren", "sirens", "iron dome", "arrow", "david's sling",
  "air defense", "air defence", "anti-aircraft",
  "drone strike", "uav", "shahed", "fateh",
];

// High-specificity Iran keywords that always pass even with Russia/Ukraine present
const HIGH_SPECIFICITY_IRAN = [
  "tehran", "isfahan", "esfahan", "irgc", "shahed", "fateh", "fattah",
  "emad", "ghadr", "sejjil", "kharg island", "bandar abbas", "natanz",
  "fordow", "parchin", "bushehr", "tabriz", "shiraz", "qom", "mashhad",
  "bavar-373", "khordad", "islamic republic", "ayatollah",
  "hezbollah", "houthi", "ansar allah",
];

export function isIranRelated(text: string): boolean {
  const lower = text.toLowerCase();

  // Non-military content filter: reject entertainment/sports/cultural posts
  // that only match generic keywords like "strike", "attack", "gaza"
  const nonMilHits = NON_MILITARY_BLOCKLIST.filter((kw) => lower.includes(kw)).length;
  if (nonMilHits > 0) {
    // Allow if high-specificity military terms are present
    if (HIGH_SPECIFICITY_MILITARY.some((kw) => lower.includes(kw))) {
      // genuinely military, continue
    } else if (HIGH_SPECIFICITY_IRAN.some((kw) => lower.includes(kw))) {
      // Iran-specific, continue
    } else {
      return false;
    }
  }

  // Count Russia/Ukraine keyword hits
  const ruHits = RUSSIA_UKRAINE_BLOCKLIST.filter((kw) => lower.includes(kw)).length;

  if (ruHits > 0) {
    // High-specificity Iran keywords always pass
    if (HIGH_SPECIFICITY_IRAN.some((kw) => lower.includes(kw))) return true;

    // Count Iran keyword hits
    const iranHits = IRAN_KEYWORDS.filter((kw) => lower.includes(kw)).length;

    // Block if zero Iran keywords
    if (iranHits === 0) return false;

    // Block if Russia/Ukraine keywords dominate (> 2x Iran keywords)
    if (ruHits > iranHits * 2) return false;
  }

  return IRAN_KEYWORDS.some((kw) => lower.includes(kw));
}

// --- Feed category classification ---

const GOVERNMENT_KEYWORDS = [
  "statement", "official statement", "press release", "press conference",
  "ministry", "minister", "foreign minister", "defense minister", "prime minister",
  "president", "spokesperson", "government", "decree", "resolution",
  "ambassador", "embassy", "diplomatic", "diplomacy", "envoy",
  "supreme leader", "ayatollah", "khamenei", "raisi", "pezeshkian",
  "white house", "state department", "national security council",
  "netanyahu", "gallant", "katz", "gantz",
  "un security council", "united nations", "iaea",
  "communiqué", "communique", "summit", "bilateral", "treaty",
  "sanctions", "sanction", "executive order",
  "parliament", "knesset", "majlis", "congress",
  "ceasefire", "truce", "peace deal", "peace talks", "negotiations",
  "condemned", "condemns", "denounced", "denounces",
  "urges", "calls on", "demands", "warns",
  "declared", "announces", "announced", "proclamation",
];

const STRIKE_KEYWORDS = [
  "airstrike", "air strike", "airstrikes", "air strikes",
  "missile strike", "missile attack", "missile launch", "missiles fired",
  "drone strike", "drone attack", "drone launched",
  "strike on", "strikes on", "struck", "targeted", "hit by",
  "explosion", "explosions", "blast", "detonation",
  "bombardment", "bombing", "bombed", "shelling", "shelled",
  "rocket attack", "rocket fire", "rockets fired",
  "intercept", "intercepted", "interception",
  "iron dome", "arrow-3", "arrow 3", "david's sling", "thaad",
  "air defense", "air defence", "anti-aircraft",
  "projectile", "warhead", "ballistic", "cruise missile",
  "shahed", "fateh", "fattah", "emad", "ghadr", "sejjil",
  "incoming missile", "incoming drone", "incoming rocket",
  "casualties", "killed", "wounded", "injured", "dead",
  "destroyed", "damaged", "crater", "impact site",
  "military operation", "operation underway",
  "siren", "sirens", "red alert", "take cover",
];

const ANALYSIS_KEYWORDS = [
  "osint", "open source intelligence", "geolocation", "geolocated",
  "assessment", "analysis", "intelligence report", "intel report",
  "satellite shows", "satellite image", "satellite imagery",
  "confirmed via", "verified by", "cross-referenced",
  "according to sources", "sources say", "sources report",
  "thread", "🧵", "breakdown", "deep dive",
  "evidence suggests", "indicators", "pattern of life",
  "before and after", "damage assessment", "bda",
  "flight data", "flight tracking", "ads-b", "adsb",
  "ship tracking", "vessel tracking", "ais data",
  "radar data", "sigint", "elint", "imint", "humint",
  "situation report", "sitrep", "sit rep",
  "update:", "summary:", "recap",
  "expert says", "analyst", "researchers",
  "investigation", "findings", "reveals",
];

/**
 * Classify a feed post into a category based on keyword matching.
 * Priority: strike > government > analysis > general.
 */
export function classifyPost(text: string): FeedCategory {
  const lower = text.toLowerCase();

  let strikeScore = 0;
  for (const kw of STRIKE_KEYWORDS) {
    if (lower.includes(kw)) strikeScore++;
  }

  let govScore = 0;
  for (const kw of GOVERNMENT_KEYWORDS) {
    if (lower.includes(kw)) govScore++;
  }

  let analysisScore = 0;
  for (const kw of ANALYSIS_KEYWORDS) {
    if (lower.includes(kw)) analysisScore++;
  }

  // Strike takes priority — these are the most actionable posts
  if (strikeScore >= 2) return "strike";
  if (strikeScore === 1 && lower.match(/\b(airstrike|air strike|missile strike|drone strike|bombardment|intercept(?:ed|ion)|iron dome|arrow-?3|thaad|shahed|fateh|fattah|red alert|sirens?)\b/)) return "strike";

  // Government/official statements
  if (govScore >= 2 && govScore >= analysisScore) return "government";
  if (govScore === 1 && lower.match(/\b(ministry|minister|decree|sanctions?|ceasefire|ambassador|embassy|parliament|knesset|majlis|press release|communiqu[ée])\b/)) return "government";

  // Analysis/OSINT
  if (analysisScore >= 2) return "analysis";
  if (analysisScore === 1 && lower.match(/\b(osint|sitrep|sit rep|geoloca|sigint|elint|imint|bda|ads-?b|situation report)\b/)) return "analysis";

  return "general";
}

/**
 * Extract channel/postId from a Telegram URL.
 * Handles: https://t.me/channel/12345, https://t.me/s/channel/12345
 * Returns null if URL has no specific post ID.
 */
export function parseTelegramPostId(url: string): string | null {
  if (!url) return null;
  const match = url.match(/t\.me\/(?:s\/)?(\w+)\/(\d+)/);
  return match ? `${match[1]}/${match[2]}` : null;
}

/**
 * Build a Telegram embed iframe URL for a given post ID.
 */
export function getTelegramEmbedUrl(postId: string): string {
  return `https://t.me/${postId}?embed=1&dark=1`;
}

export function getConfiguredChannels(): string[] {
  const channels = process.env.TELEGRAM_CHANNELS || "";
  return channels
    .split(",")
    .map((c) => c.trim().replace(/^@/, ""))
    .filter(Boolean);
}

/**
 * Scrape a single page of posts from a public Telegram channel.
 * Pass `before` post number to paginate backwards.
 */
async function scrapeChannelPage(username: string, before?: number): Promise<ChannelPost[]> {
  try {
    const url = before
      ? `https://t.me/s/${username}?before=${before}`
      : `https://t.me/s/${username}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
      cache: "no-store",
    });

    if (!res.ok) {
      console.error(`Failed to fetch t.me/s/${username}: ${res.status}`);
      return [];
    }

    const html = await res.text();
    return parseChannelHtml(html, username);
  } catch (err) {
    console.error(`Error scraping channel ${username}:`, err);
    return [];
  }
}

/**
 * Scrape recent posts from a public Telegram channel (single page).
 */
export async function scrapeChannel(username: string): Promise<ChannelPost[]> {
  return scrapeChannelPage(username);
}

/**
 * Deep-scrape a channel by paginating backwards through history.
 * Returns up to `maxPages` pages of posts (~20 posts per page).
 */
export async function scrapeChannelDeep(username: string, maxPages = 15): Promise<ChannelPost[]> {
  const allPosts: ChannelPost[] = [];
  let before: number | undefined = undefined;

  for (let page = 0; page < maxPages; page++) {
    const posts = await scrapeChannelPage(username, before);
    if (posts.length === 0) break;

    allPosts.push(...posts);

    // Get the lowest post number for pagination
    const postNumbers = posts
      .map((p) => parseInt(p.id.split("/").pop() || "0", 10))
      .filter((n) => n > 0);
    if (postNumbers.length === 0) break;

    const minPost = Math.min(...postNumbers);
    if (before !== undefined && minPost >= before) break; // No progress
    before = minPost;
  }

  // Deduplicate by post ID
  const seen = new Set<string>();
  return allPosts.filter((p) => {
    if (seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  });
}

function cleanText(rawHtml: string): string {
  return rawHtml
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    // Strip reaction counts like "😢66🤬61🔥27❤13"
    .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]\d+/gu, "")
    // Strip view counts like "6.77K views"
    .replace(/[\d.]+K?\s*views?/gi, "")
    // Strip author attribution like "Hyperborea, 08:40"
    .replace(/,\s*\d{2}:\d{2}\s*$/m, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function parseChannelHtml(html: string, username: string): ChannelPost[] {
  const posts: ChannelPost[] = [];

  // Split HTML into individual message blocks for scoped extraction
  const messageBlocks = html.split(/(?=tgme_widget_message_wrap)/);

  for (const block of messageBlocks) {
    // Extract post ID
    const postMatch = block.match(/data-post="([^"]+)"/);
    if (!postMatch) continue;
    const postId = postMatch[1];

    // Extract text
    const textMatch = block.match(
      /tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/
    );
    const text = textMatch ? cleanText(textMatch[1]) : "";

    // Extract date and full timestamp
    const dateMatch = block.match(/<time[^>]+datetime="([^"]+)"/);
    const timestamp = dateMatch ? dateMatch[1] : "";
    const date = timestamp ? timestamp.split("T")[0] : "";

    // Extract video — check both <video src=""> and <video><source src="">
    let videoUrl = "";
    const videoSrcMatch = block.match(/<video[^>]+src="([^"]+)"/);
    const sourceSrcMatch = block.match(
      /<video[\s\S]*?<source[^>]+src="([^"]+)"/
    );
    videoUrl = videoSrcMatch?.[1] || sourceSrcMatch?.[1] || "";

    // Extract images — look for photo backgrounds and img tags
    const imageUrls: string[] = [];

    // Skip channel avatar/logo images
    const isAvatar = (url: string): boolean =>
      url.includes("/userpic/") ||
      url.includes("emoji") ||
      url.includes("/profile_photos/") ||
      url.includes("/chat_photo/") ||
      url.includes("/avatar") ||
      url.includes("/stickers/") ||
      url.includes("tgme_icon") ||
      // Small Telegram CDN thumbnails (logo-sized, usually <=100px in filename)
      /\/[a-z]\/\d+\/\d+\/[a-f0-9]+\.jpg/i.test(url);

    // Only extract images from the photo section of the message, not the header/footer
    const photoSection = block.match(/tgme_widget_message_photo_wrap[\s\S]*?(?=tgme_widget_message_text|tgme_widget_message_footer|$)/);
    const imageBlock = photoSection ? photoSection[0] : block;

    // Telegram uses background-image for photos in the message
    const bgImageMatches = imageBlock.matchAll(/background-image:\s*url\('([^']+)'\)/gi);
    for (const m of bgImageMatches) {
      const url = m[1];
      if (url && !isAvatar(url)) {
        imageUrls.push(url);
      }
    }
    // Also check for <img> tags with actual content images (only in photo section)
    if (photoSection) {
      const imgMatches = imageBlock.matchAll(/<img[^>]+src="([^"]+)"[^>]*>/gi);
      for (const m of imgMatches) {
        const url = m[1];
        if (url && !isAvatar(url) && !imageUrls.includes(url)) {
          imageUrls.push(url);
        }
      }
    }

    if (!text && !videoUrl && imageUrls.length === 0) continue;

    posts.push({
      id: postId,
      channel: username,
      channelUsername: username,
      text: text || (videoUrl ? "[Video]" : "[Photo]"),
      date,
      timestamp,
      videoUrl,
      imageUrls,
    });
  }

  return posts;
}

export function postToIncident(post: ChannelPost): Incident {
  const msgId = post.id.split("/").pop() || "";

  // Build media array from video + images
  const media: MediaItem[] = [];
  if (post.videoUrl) {
    media.push({ type: "video", url: post.videoUrl });
  }
  for (const url of post.imageUrls) {
    media.push({ type: "image", url });
  }

  // Neutralize description text (rule-based, instant)
  const neutralized = neutralizeText(post.text);
  const displayText = neutralized.text;

  return {
    id: `tg-${post.id.replace("/", "-")}`,
    date: post.date || "",
    timestamp: post.timestamp || "",
    location: "",
    lat: 0,
    lng: 0,
    description: `${displayText.slice(0, 200)}${displayText.length > 200 ? "..." : ""}`,
    details: post.text, // Keep original for enrichment analysis
    weapon: "",
    target_type: "",
    video_url: post.videoUrl,
    source_url: `https://t.me/${post.channelUsername}/${msgId}`,
    source: "telegram",
    side: "iran",
    target_military: false,
    telegram_post_id: `${post.channelUsername}/${msgId}`,
    media: media.length > 0 ? media : undefined,
  };
}

export async function fetchTelegramIncidents(): Promise<Incident[]> {
  const channels = getConfiguredChannels();
  if (channels.length === 0) {
    console.warn("[telegram] No channels configured (TELEGRAM_CHANNELS env var missing)");
    return [];
  }

  console.log(`[telegram] Scraping ${channels.length} channels: ${channels.join(", ")}`);
  const results = await Promise.all(channels.map((ch) => scrapeChannel(ch)));
  const allPosts = results.flat();
  console.log(`[telegram] Scraped ${allPosts.length} total posts`);

  // Only convert Iran-related posts to incidents — non-related posts (sports, politics, etc.)
  // inflate the unmapped count and serve no purpose in the incident store.
  // The feed sidebar uses /api/feed (separate scrape), not the incident store.
  const iranPosts = allPosts.filter((post) => isIranRelated(post.text));
  console.log(`[telegram] ${iranPosts.length}/${allPosts.length} posts match Iran keywords`);

  const allIncidents = iranPosts.map((post) => postToIncident(post));

  if (iranPosts.length > 0) {
    const incidentMap = new Map(allIncidents.map((inc) => [inc.id, inc]));
    const needsAI: ChannelPost[] = [];

    // First pass: keyword enrichment (instant, deterministic)
    for (const post of iranPosts) {
      const incId = `tg-${post.id.replace("/", "-")}`;
      const inc = incidentMap.get(incId);
      if (!inc) continue;

      const kwResult = enrichWithKeywords(post.text);
      if (kwResult && kwResult.lat !== 0 && kwResult.lng !== 0) {
        applyEnrichment(inc, kwResult);
      } else {
        // Keywords couldn't geolocate, but may have extracted casualties/weapon — apply those
        if (kwResult) {
          if (kwResult.weapon) inc.weapon = kwResult.weapon;
          if (kwResult.casualties_military) inc.casualties_military = kwResult.casualties_military;
          if (kwResult.casualties_description) inc.casualties_description = kwResult.casualties_description;
          if (kwResult.intercepted_by) inc.intercepted_by = kwResult.intercepted_by;
          if (kwResult.intercept_success != null) inc.intercept_success = kwResult.intercept_success;
          if (kwResult.missiles_fired) inc.missiles_fired = kwResult.missiles_fired;
          if (kwResult.missiles_intercepted) inc.missiles_intercepted = kwResult.missiles_intercepted;
          if (kwResult.damage_severity) inc.damage_severity = kwResult.damage_severity as Incident["damage_severity"];
        }
        needsAI.push(post);
      }
    }

    console.log(`[telegram] Keyword enricher placed ${iranPosts.length - needsAI.length}/${iranPosts.length} posts on map`);

    // Second pass: AI fallback only for posts keywords couldn't geolocate
    if (needsAI.length > 0 && process.env.GEMINI_API_KEY) {
      console.log(`[telegram] Falling back to AI for ${needsAI.length} unplaced posts`);
      const enrichments = await enrichBatch(needsAI, (p) => p.text, 5);
      for (let i = 0; i < needsAI.length && i < enrichments.length; i++) {
        const post = needsAI[i];
        const enrichment = enrichments[i];
        const incId = `tg-${post.id.replace("/", "-")}`;
        const inc = incidentMap.get(incId);
        if (inc && enrichment && enrichment.lat !== 0 && enrichment.lng !== 0) {
          // AI provides geolocation — apply it but preserve keyword-extracted data
          inc.location = enrichment.location;
          inc.lat = enrichment.lat;
          inc.lng = enrichment.lng;
          inc.weapon = inc.weapon || enrichment.weapon;
          inc.target_type = enrichment.target_type;
          inc.side = enrichment.side;
          inc.target_military = enrichment.target_military;
          // Don't overwrite keyword-extracted casualties with AI's zeros
          if (enrichment.casualties_military && !inc.casualties_military) inc.casualties_military = enrichment.casualties_military;
          if (enrichment.casualties_description && !inc.casualties_description) inc.casualties_description = enrichment.casualties_description;
        }
      }
    }
  }

  // Third pass: AI neutralization for descriptions with remaining bias
  if (process.env.GEMINI_API_KEY) {
    const flagged = allIncidents.filter((inc) => hasBiasIndicators(inc.description));
    if (flagged.length > 0) {
      console.log(`[telegram] AI-neutralizing ${flagged.length} biased descriptions`);
      for (const inc of flagged) {
        inc.description = await neutralizeWithAI(inc.description);
      }
    }
  }

  const withCoords = allIncidents.filter((i) => i.lat !== 0 && i.lng !== 0);
  console.log(`[telegram] Returning ${allIncidents.length} total (${withCoords.length} with map coordinates)`);

  return allIncidents;
}

/**
 * Deep-fetch: scrape many pages of history from all channels and enrich.
 * Used for rebuilding the full dataset after data loss.
 */
export async function fetchTelegramIncidentsDeep(pagesPerChannel = 15): Promise<Incident[]> {
  const channels = getConfiguredChannels();
  if (channels.length === 0) return [];

  console.log(`[telegram-deep] Deep-scraping ${channels.length} channels (${pagesPerChannel} pages each)`);

  // Scrape channels sequentially to avoid rate limiting
  const allPosts: ChannelPost[] = [];
  for (const ch of channels) {
    const posts = await scrapeChannelDeep(ch, pagesPerChannel);
    console.log(`[telegram-deep] ${ch}: scraped ${posts.length} posts`);
    allPosts.push(...posts);
  }

  console.log(`[telegram-deep] Total scraped: ${allPosts.length} posts`);

  // Only convert Iran-related posts to incidents
  const iranPosts = allPosts.filter((post) => isIranRelated(post.text));
  console.log(`[telegram-deep] ${iranPosts.length}/${allPosts.length} posts match keywords`);

  const allIncidents = iranPosts.map((post) => postToIncident(post));

  if (iranPosts.length > 0) {
    const incidentMap = new Map(allIncidents.map((inc) => [inc.id, inc]));
    const needsAI: ChannelPost[] = [];

    // First pass: keyword enrichment (instant, deterministic)
    for (const post of iranPosts) {
      const incId = `tg-${post.id.replace("/", "-")}`;
      const inc = incidentMap.get(incId);
      if (!inc) continue;

      const kwResult = enrichWithKeywords(post.text);
      if (kwResult && kwResult.lat !== 0 && kwResult.lng !== 0) {
        applyEnrichment(inc, kwResult);
      } else {
        if (kwResult) {
          if (kwResult.weapon) inc.weapon = kwResult.weapon;
          if (kwResult.casualties_military) inc.casualties_military = kwResult.casualties_military;
          if (kwResult.casualties_description) inc.casualties_description = kwResult.casualties_description;
          if (kwResult.intercepted_by) inc.intercepted_by = kwResult.intercepted_by;
          if (kwResult.intercept_success != null) inc.intercept_success = kwResult.intercept_success;
          if (kwResult.missiles_fired) inc.missiles_fired = kwResult.missiles_fired;
          if (kwResult.missiles_intercepted) inc.missiles_intercepted = kwResult.missiles_intercepted;
          if (kwResult.damage_severity) inc.damage_severity = kwResult.damage_severity as Incident["damage_severity"];
        }
        needsAI.push(post);
      }
    }

    console.log(`[telegram-deep] Keyword enricher placed ${iranPosts.length - needsAI.length}/${iranPosts.length} posts on map`);

    // Second pass: AI fallback only for posts keywords couldn't geolocate
    if (needsAI.length > 0 && process.env.GEMINI_API_KEY) {
      console.log(`[telegram-deep] Falling back to AI for ${needsAI.length} unplaced posts`);
      const enrichments = await enrichBatch(needsAI, (p) => p.text, 5);
      for (let i = 0; i < needsAI.length && i < enrichments.length; i++) {
        const post = needsAI[i];
        const enrichment = enrichments[i];
        const incId = `tg-${post.id.replace("/", "-")}`;
        const inc = incidentMap.get(incId);
        if (inc && enrichment && enrichment.lat !== 0 && enrichment.lng !== 0) {
          inc.location = enrichment.location;
          inc.lat = enrichment.lat;
          inc.lng = enrichment.lng;
          inc.weapon = inc.weapon || enrichment.weapon;
          inc.target_type = enrichment.target_type;
          inc.side = enrichment.side;
          inc.target_military = enrichment.target_military;
          if (enrichment.casualties_military && !inc.casualties_military) inc.casualties_military = enrichment.casualties_military;
          if (enrichment.casualties_description && !inc.casualties_description) inc.casualties_description = enrichment.casualties_description;
        }
      }
    }
  }

  const withCoords = allIncidents.filter((i) => i.lat !== 0 && i.lng !== 0);
  console.log(`[telegram-deep] Returning ${allIncidents.length} total (${withCoords.length} with coords)`);

  return allIncidents;
}
