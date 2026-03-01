/**
 * Server-side persistent incident store.
 * Accumulates all incidents to a JSON file on disk.
 * Anyone visiting the site gets the full history instantly.
 */

import { Incident } from "./types";

const isServer = typeof window === "undefined";

let store: Map<string, Incident> | null = null;

function getStorePath(): string {
  const path = require("path");
  return path.join(process.cwd(), ".incident-store.json");
}

function loadStore(): Map<string, Incident> {
  if (store) return store;

  store = new Map();

  if (!isServer) return store;

  try {
    const fs = require("fs");
    const storePath = getStorePath();
    if (fs.existsSync(storePath)) {
      const raw = fs.readFileSync(storePath, "utf-8");
      const incidents = JSON.parse(raw) as Incident[];
      for (const inc of incidents) {
        store.set(inc.id, inc);
      }
      console.log(`[store] Loaded ${store.size} incidents from disk`);
    }
  } catch (err) {
    console.error("[store] Failed to load:", err);
  }

  return store;
}

function saveStore() {
  if (!isServer || !store) return;
  try {
    const fs = require("fs");
    const incidents = Array.from(store.values());
    fs.writeFileSync(getStorePath(), JSON.stringify(incidents), "utf-8");
  } catch (err) {
    console.error("[store] Failed to save:", err);
  }
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
function debouncedSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveStore();
    saveTimer = null;
  }, 2000);
}

/** Get all stored incidents */
export function getAllIncidents(): Incident[] {
  return Array.from(loadStore().values());
}

/** Get current count */
export function getIncidentCount(): number {
  return loadStore().size;
}

/**
 * Merge new incidents into the store.
 * Only adds incidents with valid coordinates that aren't already stored.
 * Returns count of newly added incidents.
 */
export function mergeIncidents(incidents: Incident[]): number {
  const s = loadStore();
  let added = 0;

  for (const inc of incidents) {
    if (!s.has(inc.id) && inc.lat !== 0 && inc.lng !== 0) {
      s.set(inc.id, inc);
      added++;
    }
  }

  if (added > 0) {
    console.log(`[store] Added ${added} new incidents (total: ${s.size})`);
    debouncedSave();
  }

  return added;
}

/**
 * Seed the store with initial data if empty.
 */
export function seedIfEmpty(incidents: Incident[]) {
  const s = loadStore();
  if (s.size === 0 && incidents.length > 0) {
    for (const inc of incidents) {
      s.set(inc.id, inc);
    }
    console.log(`[store] Seeded with ${s.size} incidents`);
    saveStore(); // Immediate save for seed
  }
}
