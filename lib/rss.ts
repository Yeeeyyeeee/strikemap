import { createHash } from "crypto";
import { Incident } from "./types";
import { enrichBatch } from "./geocodeWithAI";
import { isIranRelated } from "./telegram";
import { enrichWithKeywords } from "./keywordEnricher";
import { applyEnrichment } from "./enrichmentUtils";
import { neutralizeText, hasBiasIndicators, neutralizeWithAI } from "./neutralize";

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

    const incidents: Incident[] = filtered.map((item) => {
      const neutralizedTitle = neutralizeText(item.title);
      return {
      id: `rss-${createHash("md5").update(`${item.title}|${item.link}`).digest("hex").slice(0, 10)}`,
      date: item.pubDate ? new Date(item.pubDate).toISOString().split("T")[0] : "",
      timestamp: item.pubDate ? new Date(item.pubDate).toISOString() : "",
      location: "",
      lat: 0,
      lng: 0,
      description: neutralizedTitle.text,
      details: item.description, // Keep original
      weapon: "",
      target_type: "",
      video_url: "",
      source_url: item.link,
      source: "rss" as const,
      side: "iran" as const,
      target_military: false,
    };
    });

    // First pass: keyword enrichment (instant, no API calls)
    const needsAI: number[] = [];
    for (let i = 0; i < incidents.length; i++) {
      const text = `${filtered[i].title} ${filtered[i].description}`;
      const kwResult = enrichWithKeywords(text);
      if (kwResult && kwResult.lat !== 0 && kwResult.lng !== 0) {
        applyEnrichment(incidents[i], kwResult);
      } else {
        // Apply partial keyword data (weapon, casualties) even without location
        if (kwResult) {
          if (kwResult.weapon) incidents[i].weapon = kwResult.weapon;
          if (kwResult.casualties_military) incidents[i].casualties_military = kwResult.casualties_military;
          if (kwResult.casualties_civilian) incidents[i].casualties_civilian = kwResult.casualties_civilian;
          if (kwResult.casualties_description) incidents[i].casualties_description = kwResult.casualties_description;
          if (kwResult.intercepted_by) incidents[i].intercepted_by = kwResult.intercepted_by;
          if (kwResult.damage_severity) incidents[i].damage_severity = kwResult.damage_severity as Incident["damage_severity"];
        }
        needsAI.push(i);
      }
    }

    console.log(`[rss] Keyword enricher placed ${incidents.length - needsAI.length}/${incidents.length} items on map`);

    // Second pass: AI fallback only for items keywords couldn't geolocate
    if (needsAI.length > 0) {
      const aiItems = needsAI.map((idx) => filtered[idx]);
      const enrichments = await enrichBatch(
        aiItems,
        (item) => `${item.title} ${item.description}`,
        5,
      );

      for (let j = 0; j < needsAI.length; j++) {
        const idx = needsAI[j];
        const enrichment = enrichments[j];
        if (enrichment) {
          incidents[idx].location = enrichment.location;
          incidents[idx].lat = enrichment.lat;
          incidents[idx].lng = enrichment.lng;
          incidents[idx].weapon = incidents[idx].weapon || enrichment.weapon;
          incidents[idx].target_type = enrichment.target_type;
          incidents[idx].side = enrichment.side;
          incidents[idx].target_military = enrichment.target_military;
        }
      }
    }

    // Third pass: AI neutralization for descriptions with remaining bias
    if (process.env.GEMINI_API_KEY) {
      const flagged = incidents.filter((inc) => hasBiasIndicators(inc.description));
      if (flagged.length > 0) {
        console.log(`[rss] AI-neutralizing ${flagged.length} biased descriptions`);
        for (const inc of flagged) {
          inc.description = await neutralizeWithAI(inc.description);
        }
      }
    }

    return incidents;
  } catch (err) {
    console.error("Failed to fetch/enrich RSS feed:", err);
    return [];
  }
}
