# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
npm run dev          # Next.js dev server with Turbopack
npm run build        # Production build
npm run start        # Start production server
npm run lint         # ESLint
npx tsc --noEmit     # Type check without emitting
npx vercel --prod    # Deploy to production (strikemap.live)
```

## Architecture

**StrikeMap** is a real-time military conflict tracker built with Next.js 15 (App Router), React 19, Mapbox GL, and Upstash Redis. It ingests strike reports from multiple sources, enriches them with geolocation and metadata, and displays them on an interactive map with satellite imagery.

### Data Flow

```
Sources (Telegram channels, RSS feeds, Google Sheets)
  → /api/cron (every 2min) calls refreshLiveData()
  → Enrichment: keywordEnricher.ts (150+ hardcoded locations, weapons, sides)
               + geocodeWithAI.ts (Gemini AI for unknown locations)
  → Dedup: mergeIncidents() — 30km radius, 10min window, same side
  → Redis hash store (incidents_v3)
  → Client polls /api/incidents (30s) with ETag caching
```

### Real-Time Broadcasting

Two paths feed the Telegram broadcast channel:

1. **Webhook** (`/api/telegram/webhook`) — real-time, receives channel_post updates instantly
2. **Broadcast cron** (`/api/broadcast`, every 1min) — scrapes channels, catches anything webhook missed

Both use spatial dedup (`lib/broadcastDedup.ts`) — 30km radius, 30min window — to prevent cross-channel duplicate alerts.

### Incident Enrichment Pipeline

`lib/keywordEnricher.ts` → rules-based, no API calls, extracts: location (lat/lng), weapon type, side (iran/us_israel), casualties, intercept data, damage severity.

`lib/enrichmentUtils.ts` → applies keyword results, then batch-geocodes unknown locations via Gemini AI.

`lib/sirenDetector.ts` → multilingual siren/alert keyword detection (English, Arabic, Persian, Hebrew).

### Satellite Imagery Pipeline

`/api/satellite/imagery` orchestrates: Sentinel-2 L2A via Process API (10m resolution, evalscript for RGB bands) → histogram matching → sharpen/enhance → optional SAR change detection → optional super-resolution. Falls back to WMS if Process API fails. Maxar Open Data checked in parallel for high-res alternatives. Credentials are from Copernicus Data Space (dataspace.copernicus.eu), NOT sentinelhub.com.

### Key Modules

| Module | Purpose |
|--------|---------|
| `lib/incidentStore.ts` | Redis hash-based store, dedup via `findDuplicate()`, merge logic |
| `lib/refresh.ts` | Orchestrates parallel fetch from Sheet/RSS/Telegram, debounced 1x/min |
| `lib/telegram.ts` | Channel scraping, `isIranRelated()`, `postToIncident()` |
| `lib/telegramBot.ts` | Bot API wrapper: `sendIncident()`, `sendFeedPost()`, media upload |
| `lib/keywordEnricher.ts` | `enrichWithKeywords()` — location/weapon/side/casualty extraction |
| `lib/constants.ts` | All magic numbers, Redis keys, polling intervals, thresholds |
| `lib/sentinel.ts` | OAuth2 token, catalog search, image download + composite generation |
| `lib/sentinelProcess.ts` | Process API + WMS fallback + evalscripts |
| `lib/broadcastDedup.ts` | Spatial/temporal strike broadcast dedup (Redis sorted set) |
| `lib/firms.ts` | NASA FIRMS hotspot fetch + incident correlation (15km radius) |

### Client-Side Polling

Hooks in `hooks/` drive real-time updates — no WebSockets (Vercel doesn't support them):
- `useIncidentPolling` → 30s, `/api/incidents`
- `useAlertPolling` → 15s, `/api/alerts` (missile alerts)
- `useSirenPolling` → 15s, siren state
- `useFIRMSPolling` → 5min, `/api/satellite/firms`
- `useNotamPolling` → 5min, `/api/notams`

### Cron Jobs (vercel.json)

| Route | Interval | Purpose |
|-------|----------|---------|
| `/api/cron` | 2 min | Main data refresh (Sheet + RSS + Telegram) |
| `/api/broadcast` | 1 min | Telegram broadcast dispatcher |
| `/api/satellite/cron` | 10 min | FIRMS thermal hotspot refresh |

## Redis Schema

All keys defined in `lib/constants.ts`. Key ones:
- `incidents_v3` (Hash) — incident store, field=id, value=JSON
- `broadcastSentIds` (Set, 500 max) — tracks sent broadcast post IDs
- `broadcast_strike_locations` (Sorted Set) — spatial dedup for strike broadcasts
- `feed_posts_v1` (List, 1000 max) — Telegram feed history
- `sentinel_imagery_v9` (Hash, 1h TTL) — cached satellite imagery per incident
- `firms_hotspots_v1` (Hash, 10min TTL) — FIRMS thermal anomalies

## Environment Variables

**Required:** `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHANNELS` (comma-separated channel usernames), `TELEGRAM_CHANNEL_ID`, `NEXT_PUBLIC_MAPBOX_TOKEN`, `GEMINI_API_KEY`, `CRON_SECRET`, `ADMIN_PASSWORD`

**Optional:** `SENTINEL_HUB_CLIENT_ID`, `SENTINEL_HUB_CLIENT_SECRET`, `SENTINEL_HUB_INSTANCE_ID` (Copernicus CDSE), `NASA_FIRMS_MAP_KEY`, `NEXT_PUBLIC_SHEET_URL`, `NEXT_PUBLIC_SITE_URL`

## Conventions

- Path alias: `@/*` maps to project root
- Components: PascalCase files. Utilities: camelCase files. Constants: UPPER_SNAKE_CASE.
- API routes: kebab-case directories under `app/api/`
- Cron endpoints validate `Authorization: Bearer {CRON_SECRET}` header
- Incidents are immutable once stored — mergeIncidents replaces, never mutates
- Casualty attribution: `i.side` = who struck, casualties = victims (opposite side)
- Sharp gamma() requires values 1.0-3.0 — skip if 1.0
- Telegram webhook setup: `POST /api/telegram/webhook?setup=1&secret=CRON_SECRET`
- Deploy via `npx vercel --prod` (project: strikemap, domain: strikemap.live)
