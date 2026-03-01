import { Incident } from "./types";
import { enrichBatch } from "./geocodeWithAI";
import { enrichWithKeywords } from "./keywordEnricher";

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

export interface ChannelPost {
  id: string;
  channel: string;
  channelUsername: string;
  text: string;
  date: string;
  timestamp: string; // full ISO 8601 datetime
  videoUrl: string;
}

export function isIranRelated(text: string): boolean {
  const lower = text.toLowerCase();
  return IRAN_KEYWORDS.some((kw) => lower.includes(kw));
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

function getConfiguredChannels(): string[] {
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

    if (!text && !videoUrl) continue;

    posts.push({
      id: postId,
      channel: username,
      channelUsername: username,
      text: text || "[Video]",
      date,
      timestamp,
      videoUrl,
    });
  }

  return posts;
}

function postToIncident(post: ChannelPost): Incident {
  const msgId = post.id.split("/").pop() || "";

  return {
    id: `tg-${post.id.replace("/", "-")}`,
    date: post.date || new Date().toISOString().split("T")[0],
    timestamp: post.timestamp || new Date().toISOString(),
    location: "",
    lat: 0,
    lng: 0,
    description: `[${post.channelUsername}] ${post.text.slice(0, 200)}${post.text.length > 200 ? "..." : ""}`,
    details: post.text,
    weapon: "",
    target_type: "",
    video_url: post.videoUrl,
    source_url: `https://t.me/${post.channelUsername}/${msgId}`,
    source: "telegram",
    side: "iran",
    target_military: false,
    telegram_post_id: `${post.channelUsername}/${msgId}`,
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

  // Convert ALL posts to incidents (shown in feed)
  const allIncidents = allPosts.map((post) => postToIncident(post));

  // Only enrich Iran-related posts with AI (for map coordinates)
  const iranPosts = allPosts.filter((post) => isIranRelated(post.text));
  console.log(`[telegram] ${iranPosts.length} posts match Iran keywords, enriching with AI`);

  if (iranPosts.length > 0) {
    const enrichments = await enrichBatch(iranPosts, (p) => p.text, 5);

    // Map enriched data back to the corresponding incidents
    const iranIds = new Set(iranPosts.map((p) => `tg-${p.id.replace("/", "-")}`));
    const iranPostMap = new Map(iranPosts.map((p) => [`tg-${p.id.replace("/", "-")}`, p]));
    let enrichIdx = 0;
    for (const inc of allIncidents) {
      if (iranIds.has(inc.id) && enrichIdx < enrichments.length) {
        const enrichment = enrichments[enrichIdx];
        if (enrichment && enrichment.lat !== 0 && enrichment.lng !== 0) {
          inc.location = enrichment.location;
          inc.lat = enrichment.lat;
          inc.lng = enrichment.lng;
          inc.weapon = enrichment.weapon;
          inc.target_type = enrichment.target_type;
          inc.side = enrichment.side;
          inc.target_military = enrichment.target_military;
        } else {
          // Fallback: try keyword-based enrichment
          const post = iranPostMap.get(inc.id);
          if (post) {
            const kwResult = enrichWithKeywords(post.text);
            if (kwResult) {
              inc.location = kwResult.location;
              inc.lat = kwResult.lat;
              inc.lng = kwResult.lng;
              inc.weapon = kwResult.weapon || inc.weapon;
              inc.target_type = kwResult.target_type || inc.target_type;
              inc.side = kwResult.side;
              inc.target_military = kwResult.target_military;
            }
          }
        }
        enrichIdx++;
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

  const allIncidents = allPosts.map((post) => postToIncident(post));

  // Enrich all Iran-related posts
  const iranPosts = allPosts.filter((post) => isIranRelated(post.text));
  console.log(`[telegram-deep] ${iranPosts.length} posts match keywords, enriching with AI`);

  if (iranPosts.length > 0) {
    const enrichments = await enrichBatch(iranPosts, (p) => p.text, 5);

    const iranIds = new Set(iranPosts.map((p) => `tg-${p.id.replace("/", "-")}`));
    const iranPostMap = new Map(iranPosts.map((p) => [`tg-${p.id.replace("/", "-")}`, p]));
    let enrichIdx = 0;
    for (const inc of allIncidents) {
      if (iranIds.has(inc.id) && enrichIdx < enrichments.length) {
        const enrichment = enrichments[enrichIdx];
        if (enrichment && enrichment.lat !== 0 && enrichment.lng !== 0) {
          inc.location = enrichment.location;
          inc.lat = enrichment.lat;
          inc.lng = enrichment.lng;
          inc.weapon = enrichment.weapon;
          inc.target_type = enrichment.target_type;
          inc.side = enrichment.side;
          inc.target_military = enrichment.target_military;
        } else {
          const post = iranPostMap.get(inc.id);
          if (post) {
            const kwResult = enrichWithKeywords(post.text);
            if (kwResult) {
              inc.location = kwResult.location;
              inc.lat = kwResult.lat;
              inc.lng = kwResult.lng;
              inc.weapon = kwResult.weapon || inc.weapon;
              inc.target_type = kwResult.target_type || inc.target_type;
              inc.side = kwResult.side;
              inc.target_military = kwResult.target_military;
            }
          }
        }
        enrichIdx++;
      }
    }
  }

  const withCoords = allIncidents.filter((i) => i.lat !== 0 && i.lng !== 0);
  console.log(`[telegram-deep] Returning ${allIncidents.length} total (${withCoords.length} with coords)`);

  return allIncidents;
}
