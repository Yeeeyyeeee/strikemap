import { NextResponse } from "next/server";
import { getAllIncidents } from "@/lib/incidentStore";
import { getRedis } from "@/lib/redis";
import { requireCronAuth } from "@/lib/apiAuth";
import { enrichWithKeywords } from "@/lib/keywordEnricher";
import { neutralizeText } from "@/lib/neutralize";
import { REDIS_INCIDENTS_KEY, REDIS_BATCH_SIZE } from "@/lib/constants";
import type { Incident } from "@/lib/types";

export const maxDuration = 120;

/**
 * One-time migration endpoint: re-processes all stored incidents with
 * the new reliability pipeline (word-boundary matching, multi-factor dedup,
 * neutrality filter, confidence scoring).
 *
 * POST /api/admin/migrate
 * Authorization: Bearer {CRON_SECRET}
 */
export async function POST(request: Request) {
  const authError = requireCronAuth(request);
  if (authError) return authError;

  const r = getRedis();
  if (!r) {
    return NextResponse.json({ ok: false, error: "No Redis configured" }, { status: 500 });
  }

  try {
    const incidents = await getAllIncidents();
    let updated = 0;
    let neutralized = 0;
    let enriched = 0;
    let errors = 0;

    const toWrite: Incident[] = [];

    for (const inc of incidents) {
      try {
        let changed = false;

        // 1. Set confidence/sourceCount if missing
        if (!inc.confidence) {
          inc.confidence = "unconfirmed";
          inc.sourceCount = inc.sourceCount ?? 1;
          changed = true;
        }

        // 2. Re-enrich with keyword enricher (new word-boundary logic)
        const text = inc.details || inc.description || "";
        if (text.length >= 10) {
          const kwResult = enrichWithKeywords(text);
          if (kwResult && kwResult.lat !== 0 && kwResult.lng !== 0) {
            // Update location if the new enrichment is more specific
            const oldCommas = (inc.location || "").split(",").length;
            const newCommas = kwResult.location.split(",").length;
            if (newCommas >= oldCommas || inc.lat === 0) {
              inc.location = kwResult.location;
              inc.lat = kwResult.lat;
              inc.lng = kwResult.lng;
            }
            // Update side with new keyword-first attribution
            inc.side = kwResult.side;
            // Fill in missing fields
            if (!inc.weapon && kwResult.weapon) inc.weapon = kwResult.weapon;
            if (!inc.target_type && kwResult.target_type) inc.target_type = kwResult.target_type;
            inc.target_military = kwResult.target_military;
            // Update casualties if keyword enricher found them and we have none
            if (kwResult.casualties_military > 0 && !inc.casualties_military) {
              inc.casualties_military = kwResult.casualties_military;
            }
            if (kwResult.casualties_civilian > 0 && !inc.casualties_civilian) {
              inc.casualties_civilian = kwResult.casualties_civilian;
            }
            if (kwResult.casualties_description && kwResult.casualties_description !== "No casualties reported" && !inc.casualties_description) {
              inc.casualties_description = kwResult.casualties_description;
            }
            if (kwResult.isStatement) inc.isStatement = true;
            enriched++;
            changed = true;
          }
        }

        // 3. Neutralize description
        const result = neutralizeText(inc.description || "");
        if (result.wasModified) {
          inc.description = result.text;
          neutralized++;
          changed = true;
        }

        if (changed) {
          toWrite.push(inc);
          updated++;
        }
      } catch (err) {
        errors++;
        console.error(`[migrate] Error processing ${inc.id}:`, err);
      }
    }

    // Batch write to Redis
    let written = 0;
    for (let i = 0; i < toWrite.length; i += REDIS_BATCH_SIZE) {
      const batch = toWrite.slice(i, i + REDIS_BATCH_SIZE);
      const fields: Record<string, string> = {};
      for (const inc of batch) {
        fields[inc.id] = JSON.stringify({
          id: inc.id,
          date: inc.date,
          timestamp: inc.timestamp,
          location: inc.location,
          lat: inc.lat,
          lng: inc.lng,
          description: inc.description?.slice(0, 300) || "",
          details: "",
          weapon: inc.weapon,
          target_type: inc.target_type,
          video_url: inc.video_url,
          media: inc.media,
          source_url: inc.source_url,
          source: inc.source,
          side: inc.side,
          target_military: inc.target_military,
          telegram_post_id: inc.telegram_post_id,
          intercepted_by: inc.intercepted_by,
          intercept_success: inc.intercept_success,
          damage_severity: inc.damage_severity,
          casualties_military: inc.casualties_military,
          casualties_civilian: inc.casualties_civilian,
          confidence: inc.confidence,
          sourceCount: inc.sourceCount,
        });
      }
      try {
        await r.hset(REDIS_INCIDENTS_KEY, fields);
        written += batch.length;
      } catch (err) {
        console.error(`[migrate] HSET batch failed:`, err);
      }
    }

    console.log(`[migrate] Done: ${updated}/${incidents.length} updated (${enriched} re-enriched, ${neutralized} neutralized, ${errors} errors, ${written} written to Redis)`);

    return NextResponse.json({
      ok: true,
      total: incidents.length,
      updated,
      enriched,
      neutralized,
      errors,
      written,
    });
  } catch (err) {
    console.error("[migrate] Failed:", err);
    return NextResponse.json(
      { ok: false, error: String(err) },
      { status: 500 },
    );
  }
}
