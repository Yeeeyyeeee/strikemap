import { Incident, NOTAM } from "./types";

export interface EscalationResult {
  score: number; // 0-100
  level: "LOW" | "ELEVATED" | "HIGH" | "CRITICAL";
  color: string;
  factors: string[];
}

/** Parse timestamp or date string into epoch ms */
function parseTime(inc: Incident): number {
  // Prefer full ISO timestamp
  if (inc.timestamp) {
    const t = new Date(inc.timestamp).getTime();
    if (!isNaN(t)) return t;
  }
  // Fallback to date string
  if (inc.date) {
    const parts = inc.date.split("-");
    if (parts.length === 3) {
      const t = new Date(+parts[0], +parts[1] - 1, +parts[2]).getTime();
      if (!isNaN(t)) return t;
    }
  }
  return 0;
}

export function computeEscalation(incidents: Incident[], notams?: NOTAM[]): EscalationResult {
  if (incidents.length === 0) {
    return { score: 0, level: "LOW", color: "#22c55e", factors: [] };
  }

  const now = Date.now();
  const h6 = 6 * 60 * 60 * 1000;
  const h24 = 24 * 60 * 60 * 1000;
  const h48 = 48 * 60 * 60 * 1000;

  const recent6h = incidents.filter((i) => {
    const t = parseTime(i);
    return t > 0 && now - t < h6;
  });
  const recent24 = incidents.filter((i) => {
    const t = parseTime(i);
    return t > 0 && now - t < h24;
  });
  const recent48 = incidents.filter((i) => {
    const t = parseTime(i);
    return t > 0 && now - t < h48;
  });

  const factors: string[] = [];
  let score = 0;

  // Factor 1: Strike volume in last 24h (0-35 points)
  // Active conflict produces dozens-hundreds of reports
  const freq24 = recent24.length;
  const freqScore = Math.min(Math.round(Math.sqrt(freq24) * 7), 35);
  if (freq24 > 0) factors.push(`${freq24} strikes in 24h`);
  score += freqScore;

  // Factor 2: Recent intensity — strikes in last 6 hours (0-25 points)
  // High recent activity = very active conflict
  const freq6 = recent6h.length;
  const recentScore = Math.min(Math.round(Math.sqrt(freq6) * 10), 25);
  if (freq6 > 0) factors.push(`${freq6} strikes in 6h`);
  score += recentScore;

  // Factor 3: Both sides active in 24h (tit-for-tat = +20 points)
  const iranRecent = recent24.some((i) => i.side === "iran");
  const usRecent = recent24.some((i) => i.side === "us_israel" || i.side === "us" || i.side === "israel");
  if (iranRecent && usRecent) {
    score += 20;
    factors.push("Both sides active in 24h");
  }

  // Factor 4: Conflict breadth — multiple locations hit (0-20 points)
  const locations48 = new Set(recent48.filter((i) => i.location).map((i) => i.location));
  const locScore = Math.min(locations48.size * 2, 20);
  if (locations48.size > 3) factors.push(`${locations48.size} locations targeted`);
  score += locScore;

  // Factor 5: Airspace closures from NOTAM data (0-25 points)
  if (notams && notams.length > 0) {
    const criticalNotams = notams.filter((n) => n.severity === "critical");
    const closedCountries = new Set(criticalNotams.map((n) => n.country));

    // 3+ countries with full airspace closures = major escalation signal
    if (closedCountries.size >= 3) {
      score += 15;
      factors.push(`${closedCountries.size} regional airspace closures`);
    }

    // Iran AND Israel both closed = imminent conflict signal
    if (closedCountries.has("Iran") && closedCountries.has("Israel")) {
      score += 10;
      factors.push("Iran + Israel airspace closed");
    }
  }

  score = Math.min(score, 100);

  let level: EscalationResult["level"];
  let color: string;
  if (score >= 76) {
    level = "CRITICAL";
    color = "#ef4444";
  } else if (score >= 51) {
    level = "HIGH";
    color = "#f97316";
  } else if (score >= 26) {
    level = "ELEVATED";
    color = "#eab308";
  } else {
    level = "LOW";
    color = "#22c55e";
  }

  return { score, level, color, factors };
}
