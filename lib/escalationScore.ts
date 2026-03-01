import { Incident } from "./types";

/** Parse YYYY-MM-DD as local midnight (avoids UTC offset from new Date("YYYY-MM-DD")) */
function parseLocalDate(dateStr: string): number {
  const parts = dateStr?.split("-");
  if (!parts || parts.length !== 3) return 0;
  const t = new Date(+parts[0], +parts[1] - 1, +parts[2]).getTime();
  return isNaN(t) ? 0 : t;
}

export interface EscalationResult {
  score: number; // 0-100
  level: "LOW" | "ELEVATED" | "HIGH" | "CRITICAL";
  color: string;
  factors: string[];
}

const SEVERITY_WEIGHT: Record<string, number> = {
  minor: 1,
  moderate: 2,
  severe: 3,
  catastrophic: 4,
};

export function computeEscalation(incidents: Incident[]): EscalationResult {
  if (incidents.length === 0) {
    return { score: 0, level: "LOW", color: "#22c55e", factors: [] };
  }

  const now = Date.now();
  const h24 = 24 * 60 * 60 * 1000;
  const h48 = 48 * 60 * 60 * 1000;

  const recent24 = incidents.filter((i) => {
    const t = parseLocalDate(i.date);
    return t > 0 && now - t < h24;
  });
  const recent48 = incidents.filter((i) => {
    const t = parseLocalDate(i.date);
    return t > 0 && now - t < h48;
  });

  const factors: string[] = [];
  let score = 0;

  // Factor 1: Strike frequency in last 24h (0-30 points)
  const freq = recent24.length;
  const freqScore = Math.min(freq * 3, 30);
  if (freq > 0) factors.push(`${freq} strike${freq > 1 ? "s" : ""} in 24h`);
  score += freqScore;

  // Factor 2: Average damage severity in last 48h (0-25 points)
  if (recent48.length > 0) {
    const avgSeverity =
      recent48.reduce((sum, i) => sum + (SEVERITY_WEIGHT[i.damage_severity || "minor"] || 1), 0) / recent48.length;
    const sevScore = Math.min(Math.round((avgSeverity / 4) * 25), 25);
    if (avgSeverity >= 2) factors.push(`Avg severity: ${avgSeverity.toFixed(1)}/4`);
    score += sevScore;
  }

  // Factor 3: Total casualties in last 48h (0-25 points)
  const casualties48 = recent48.reduce(
    (sum, i) => sum + (i.casualties_military || 0) + (i.casualties_civilian || 0),
    0
  );
  const casScore = Math.min(Math.round(Math.sqrt(casualties48) * 5), 25);
  if (casualties48 > 0) factors.push(`${casualties48} casualties in 48h`);
  score += casScore;

  // Factor 4: Tit-for-tat (both sides struck in last 24h = +20 points)
  const iranRecent = recent24.some((i) => i.side === "iran");
  const usRecent = recent24.some((i) => i.side === "us_israel" || i.side === "us" || i.side === "israel");
  if (iranRecent && usRecent) {
    score += 20;
    factors.push("Both sides active in 24h");
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
