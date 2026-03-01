/**
 * Server-side in-memory incident store.
 * Accumulates all incidents in memory for the lifetime of the serverless function.
 * On cold starts, seeds with sample data and refetches live data via cron.
 */

import { Incident } from "./types";

let store: Map<string, Incident> = new Map();
let seeded = false;

/** Get all stored incidents */
export function getAllIncidents(): Incident[] {
  return Array.from(store.values());
}

/** Get current count */
export function getIncidentCount(): number {
  return store.size;
}

/** Check if the store only has seed data (no live data yet) */
export function isOnlySeedData(): boolean {
  return seeded && !liveDataMerged;
}

let liveDataMerged = false;

/**
 * Merge new incidents into the store.
 * Only adds incidents with valid coordinates that aren't already stored.
 * Returns count of newly added incidents.
 */
export function mergeIncidents(incidents: Incident[]): number {
  let added = 0;

  for (const inc of incidents) {
    if (!store.has(inc.id) && inc.lat !== 0 && inc.lng !== 0) {
      store.set(inc.id, inc);
      added++;
    }
  }

  if (added > 0) {
    liveDataMerged = true;
    console.log(`[store] Added ${added} new incidents (total: ${store.size})`);
  }

  return added;
}

/**
 * Seed the store with initial data if empty.
 */
export function seedIfEmpty(incidents: Incident[]) {
  if (store.size === 0 && incidents.length > 0) {
    for (const inc of incidents) {
      store.set(inc.id, inc);
    }
    seeded = true;
    console.log(`[store] Seeded with ${store.size} incidents`);
  }
}
