import { Incident } from "./types";
import { enrichBatch } from "./geocodeWithAI";

interface RSSItem {
  title: string;
  link: string;
  pubDate: string;
  description: string;
}

function parseRSSXml(xml: string): RSSItem[] {
  const items: RSSItem[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const content = match[1];
    const getTag = (tag: string) => {
      const m = content.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
      return m ? m[1].replace(/<!\[CDATA\[([\s\S]*?)]]>/g, "$1").trim() : "";
    };

    items.push({
      title: getTag("title"),
      link: getTag("link"),
      pubDate: getTag("pubDate"),
      description: getTag("description"),
    });
  }

  return items;
}

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
];

function isIranRelated(text: string): boolean {
  const lower = text.toLowerCase();
  return IRAN_KEYWORDS.some((kw) => lower.includes(kw));
}

export async function fetchRSSIncidents(): Promise<Incident[]> {
  const rssUrl = process.env.NEXT_PUBLIC_FJ_RSS_URL || "";
  if (!rssUrl) return [];

  try {
    const res = await fetch(rssUrl, {
      headers: { "User-Agent": "StrikeMap/1.0" },
      next: { revalidate: 300 },
    });
    const xml = await res.text();
    const items = parseRSSXml(xml);

    const filtered = items.filter((item) =>
      isIranRelated(item.title + " " + item.description)
    );

    const incidents: Incident[] = filtered.map((item, i) => ({
      id: `rss-${i}`,
      date: item.pubDate ? new Date(item.pubDate).toISOString().split("T")[0] : "",
      location: "",
      lat: 0,
      lng: 0,
      description: item.title,
      details: item.description,
      weapon: "",
      target_type: "",
      video_url: "",
      source_url: item.link,
      source: "rss" as const,
      side: "iran" as const,
      target_military: false,
    }));

    // Enrich with AI geocoding in batches of 5
    const enrichments = await enrichBatch(
      filtered,
      (item) => `${item.title} ${item.description}`,
      5,
    );

    for (let i = 0; i < incidents.length; i++) {
      const enrichment = enrichments[i];
      if (enrichment) {
        incidents[i].location = enrichment.location;
        incidents[i].lat = enrichment.lat;
        incidents[i].lng = enrichment.lng;
        incidents[i].weapon = enrichment.weapon;
        incidents[i].target_type = enrichment.target_type;
        incidents[i].side = enrichment.side;
        incidents[i].target_military = enrichment.target_military;
      }
    }

    return incidents;
  } catch (err) {
    console.error("Failed to fetch/enrich RSS feed:", err);
    return [];
  }
}
