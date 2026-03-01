/**
 * Deep-scrape telegram channels for all Iranian leadership eliminations
 * since the start of the war. Paginates backwards through history.
 * Uses Gemini AI to extract confirmed kills.
 */

const CHANNELS = [
  "IDFofficial", "IsraelWarRoom", "CIG_telegram", "QudsNen",
  "SouthFirstResponders", "tabzlive", "AMK_Mapping", "rnintel", "intelslava",
];
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "AIzaSyAWpnOnLBfiIa0mSC-S4pnaVhqz5J_Ti9s";

// How many pages to go back per channel (~20 posts per page)
// IDF/Israeli channels post less, so we can go deeper
const MAX_PAGES = 30;

const DEATH_KEYWORDS = [
  "killed", "dead", "eliminated", "assassinated", "assassination",
  "martyred", "martyr", "dies", "died", "death", "struck down",
  "taken out", "neutralized", "confirmed dead", "targeted killing",
  "liquidated", "senior commander", "commander killed", "general killed",
  "official killed", "leader killed", "terror target", "high-value target",
  "hvt", "senior operative", "senior figure", "top commander",
];

const IRAN_KEYWORDS = [
  "iran", "irgc", "iranian", "quds", "hezbollah", "hamas", "houthi",
  "tehran", "revolutionary guard", "islamic jihad", "axis of resistance",
  "proxy", "militia", "nasrallah", "soleimani", "haniyeh",
];

function cleanText(rawHtml) {
  return rawHtml
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]\d+/gu, "")
    .replace(/[\d.]+K?\s*views?/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function parseChannelHtml(html, username) {
  const posts = [];
  const messageBlocks = html.split(/(?=tgme_widget_message_wrap)/);

  for (const block of messageBlocks) {
    const postMatch = block.match(/data-post="([^"]+)"/);
    if (!postMatch) continue;
    const postId = postMatch[1];

    const textMatch = block.match(
      /tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/
    );
    const text = textMatch ? cleanText(textMatch[1]) : "";

    const dateMatch = block.match(/<time[^>]+datetime="([^"]+)"/);
    const date = dateMatch ? dateMatch[1].split("T")[0] : "";

    if (!text) continue;
    posts.push({ id: postId, channel: username, text, date });
  }
  return posts;
}

async function scrapeChannelPage(username, beforeId = null) {
  const url = beforeId
    ? `https://t.me/s/${username}?before=${beforeId}`
    : `https://t.me/s/${username}`;

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept: "text/html",
      },
    });
    if (!res.ok) return [];
    const html = await res.text();
    return parseChannelHtml(html, username);
  } catch (err) {
    console.error(`  Error scraping ${username} (before=${beforeId}):`, err.message);
    return [];
  }
}

async function deepScrapeChannel(username) {
  console.log(`\nScraping @${username}...`);
  let allPosts = [];
  let beforeId = null;

  for (let page = 0; page < MAX_PAGES; page++) {
    const posts = await scrapeChannelPage(username, beforeId);
    if (posts.length === 0) break;

    allPosts.push(...posts);
    // Get the oldest post ID for pagination (extract numeric part)
    const oldestPost = posts[posts.length - 1];
    const numericId = oldestPost.id.split("/").pop();
    beforeId = numericId;

    const oldestDate = posts[posts.length - 1]?.date || "?";
    console.log(`  Page ${page + 1}: ${posts.length} posts (oldest: ${oldestDate})`);

    // Rate limit
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log(`  Total: ${allPosts.length} posts from @${username}`);
  return allPosts;
}

function isRelevantDeathPost(text) {
  const lower = text.toLowerCase();
  const hasDeath = DEATH_KEYWORDS.some((kw) => lower.includes(kw));
  const hasIran = IRAN_KEYWORDS.some((kw) => lower.includes(kw));
  return hasDeath && hasIran;
}

async function analyzeWithGemini(posts) {
  console.log(`\nSending ${posts.length} death-related posts to Gemini for analysis...`);

  const prompt = `You are a military intelligence analyst. Below are Telegram posts from OSINT channels about the Middle East conflict.

Your task: identify ALL confirmed deaths/eliminations of Iranian regime figures and their proxy allies since October 2023. This includes:
- Iranian government officials
- IRGC commanders and officers at ALL levels
- Quds Force operatives
- Iranian military personnel
- Iranian nuclear scientists and defense researchers
- Hezbollah commanders and senior figures
- Hamas leaders and commanders
- Houthi commanders
- Iraqi Shia militia leaders (PMF/Hashd al-Shaabi)
- Islamic Jihad leaders
- Any figure in Iran's "axis of resistance"

For EACH confirmed death, provide:
- name: Full name
- role: Their title/position
- tier: 1 if supreme leader level, 2 if senior official (president, minister, force commander-in-chief, Hezbollah/Hamas top leader), 3 for all others
- deathDate: When (format: "DD Mon YYYY")
- deathCause: How and where

Return valid JSON with this exact structure:
{"eliminations": [{"name": "...", "role": "...", "tier": N, "deathDate": "...", "deathCause": "..."}]}

Only include people you are CERTAIN were killed based on the posts. Do not hallucinate or guess.
If someone is mentioned as "reportedly" killed but later confirmed, include them.
Do NOT include people merely injured or arrested.

Posts:
`;

  // Batch posts into chunks to fit context window
  const CHUNK_SIZE = 80;
  const allResults = [];

  for (let i = 0; i < posts.length; i += CHUNK_SIZE) {
    const chunk = posts.slice(i, i + CHUNK_SIZE);
    const postTexts = chunk
      .map((p, idx) => `[${p.date}] ${p.text.slice(0, 500)}`)
      .join("\n---\n");

    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt + postTexts }] }],
            generationConfig: {
              responseMimeType: "application/json",
            },
          }),
        }
      );

      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
      const parsed = JSON.parse(text);
      if (parsed.eliminations) {
        allResults.push(...parsed.eliminations);
        console.log(`  Batch ${Math.floor(i / CHUNK_SIZE) + 1}: found ${parsed.eliminations.length} eliminations`);
      }
    } catch (err) {
      console.error(`  Gemini batch error:`, err.message);
    }

    await new Promise((r) => setTimeout(r, 1000));
  }

  return allResults;
}

// Deduplicate by name similarity
function deduplicateResults(results) {
  const seen = new Map();
  for (const r of results) {
    const key = r.name.toLowerCase().replace(/[^a-z\s]/g, "").trim();
    // Keep the one with more detail
    if (!seen.has(key) || (r.deathCause?.length || 0) > (seen.get(key).deathCause?.length || 0)) {
      seen.set(key, r);
    }
  }
  return Array.from(seen.values());
}

async function main() {
  console.log("=== Deep Telegram Scrape for Iranian Leadership Eliminations ===\n");

  // Step 1: Deep scrape all channels
  let allPosts = [];
  for (const channel of CHANNELS) {
    const posts = await deepScrapeChannel(channel);
    allPosts.push(...posts);
  }

  console.log(`\nTotal posts scraped: ${allPosts.length}`);

  // Step 2: Filter for death-related + Iran-related
  const deathPosts = allPosts.filter((p) => isRelevantDeathPost(p.text));
  console.log(`Death-related posts about Iran/proxies: ${deathPosts.length}`);

  if (deathPosts.length === 0) {
    console.log("No relevant posts found.");
    return;
  }

  // Step 3: Analyze with Gemini
  const results = await analyzeWithGemini(deathPosts);
  console.log(`\nRaw results from Gemini: ${results.length}`);

  // Step 4: Deduplicate
  const unique = deduplicateResults(results);

  // Sort by tier then date
  unique.sort((a, b) => a.tier - b.tier || a.name.localeCompare(b.name));

  console.log(`\n${"=".repeat(60)}`);
  console.log(`CONFIRMED ELIMINATIONS: ${unique.length}`);
  console.log(`${"=".repeat(60)}\n`);

  for (const r of unique) {
    console.log(`[Tier ${r.tier}] ${r.name}`);
    console.log(`  Role: ${r.role}`);
    console.log(`  Killed: ${r.deathDate}`);
    console.log(`  Cause: ${r.deathCause}`);
    console.log();
  }

  // Output as JSON for easy parsing
  console.log("\n--- JSON OUTPUT ---");
  console.log(JSON.stringify(unique, null, 2));
}

main().catch(console.error);
