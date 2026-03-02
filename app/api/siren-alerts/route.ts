import { NextResponse } from "next/server";
import { getActiveSirenAlerts, processSirenPosts, hasRecentProcessing, clearSirenByCountry, clearAllSirens, addManualSiren } from "@/lib/sirenDetector";
import { scrapeChannel, getConfiguredChannels } from "@/lib/telegram";
import { isAdminRequest } from "@/lib/adminAuth";
import { isSourceRequest } from "@/lib/sourceAuth";

export async function GET() {
  try {
    // If /api/feed hasn't been called recently, do a quick scrape to seed siren state
    if (!hasRecentProcessing()) {
      const channels = getConfiguredChannels();
      if (channels.length > 0) {
        console.log("[siren-alerts] No recent feed processing, doing fallback scrape");
        const results = await Promise.all(
          channels.map((ch) => scrapeChannel(ch).catch(() => []))
        );
        const posts = results.flat().filter((p) => p.text);
        await processSirenPosts(posts);
      }
    }

    const alerts = await getActiveSirenAlerts();
    return NextResponse.json(
      { sirenAlerts: alerts },
      { headers: { "Cache-Control": "public, s-maxage=10, stale-while-revalidate=20" } }
    );
  } catch (err) {
    return NextResponse.json({ sirenAlerts: [], error: String(err) });
  }
}

export async function POST(req: Request) {
  // Admin or source auth required
  const sourceName = isSourceRequest(req);
  if (!isAdminRequest(req) && !sourceName) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const actor = sourceName ? `source:${sourceName}` : "admin";

  try {
    const body = await req.json();
    const { action, country } = body;

    if (action === "clear" && country) {
      console.log(`[siren-alerts] ${actor} cleared siren for ${country}`);
      const cleared = await clearSirenByCountry(country);
      return NextResponse.json({ ok: true, cleared });
    }

    if (action === "clear-all") {
      console.log(`[siren-alerts] ${actor} cleared all sirens`);
      const cleared = await clearAllSirens();
      return NextResponse.json({ ok: true, cleared });
    }

    if (action === "add") {
      const { country } = body;
      if (!country || typeof country !== "string") {
        return NextResponse.json({ error: "country is required" }, { status: 400 });
      }
      console.log(`[siren-alerts] ${actor} manually activated siren for ${country}`);
      const alert = await addManualSiren(country.trim());
      return NextResponse.json({ ok: true, alert });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
