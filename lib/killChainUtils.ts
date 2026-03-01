import { Incident, StrikeSide } from "./types";

export interface KillChainStage {
  type: "launch" | "intercept" | "impact";
  incident: Incident;
  weapon: string;
  outcome: string;
}

export interface KillChainEvent {
  id: string;
  date: string;
  attackerSide: StrikeSide;
  originLocation: string;
  targetLocation: string;
  stages: KillChainStage[];
  totalProjectiles: number;
  intercepted: number;
  impacted: number;
  weapons: string[];
  damageSeverity?: string;
}

/** Haversine distance in km between two lat/lng points */
function haversineKm(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Group incidents into kill chain events.
 * Incidents are grouped when they share the same date, same side,
 * and are geographically close (within 100km).
 */
export function groupIntoKillChains(incidents: Incident[]): KillChainEvent[] {
  const valid = incidents.filter((i) => i.lat !== 0 && i.lng !== 0);
  const sorted = [...valid].sort((a, b) => (b.date > a.date ? 1 : -1));

  const groups: Incident[][] = [];
  const used = new Set<string>();

  for (const inc of sorted) {
    if (used.has(inc.id)) continue;

    const group: Incident[] = [inc];
    used.add(inc.id);

    // Find other incidents on the same date, same side, within 100km
    for (const other of sorted) {
      if (used.has(other.id)) continue;
      if (other.date !== inc.date) continue;
      if (other.side !== inc.side) continue;

      const dist = haversineKm(inc.lat, inc.lng, other.lat, other.lng);
      if (dist < 100) {
        group.push(other);
        used.add(other.id);
      }
    }

    groups.push(group);
  }

  // Convert groups into KillChainEvents
  return groups.map((group) => {
    const first = group[0];
    const weapons = [...new Set(group.map((g) => g.weapon).filter(Boolean))];

    const stages: KillChainStage[] = [];
    let intercepted = 0;
    let impacted = 0;
    let worstSeverity: string | undefined;

    const severityRank: Record<string, number> = {
      minor: 1,
      moderate: 2,
      severe: 3,
      catastrophic: 4,
    };

    for (const inc of group) {
      // Launch stage
      stages.push({
        type: "launch",
        incident: inc,
        weapon: inc.weapon || "Unknown",
        outcome: `Launched from ${inc.side === "iran" ? "Iran/Proxy" : "US/Israel"}`,
      });

      // Intercept or Impact stage
      if (inc.intercept_success && inc.intercepted_by) {
        intercepted++;
        stages.push({
          type: "intercept",
          incident: inc,
          weapon: inc.weapon || "Unknown",
          outcome: `Intercepted by ${inc.intercepted_by}`,
        });
      } else {
        impacted++;
        stages.push({
          type: "impact",
          incident: inc,
          weapon: inc.weapon || "Unknown",
          outcome: inc.damage_assessment || "Impact confirmed",
        });

        // Track worst severity
        if (inc.damage_severity) {
          if (
            !worstSeverity ||
            (severityRank[inc.damage_severity] || 0) > (severityRank[worstSeverity] || 0)
          ) {
            worstSeverity = inc.damage_severity;
          }
        }
      }
    }

    return {
      id: `kc-${first.date}-${first.id}`,
      date: first.date,
      attackerSide: first.side,
      originLocation: first.side === "iran" ? "Iran / Proxy Territory" : "US / Israel",
      targetLocation: first.location,
      stages,
      totalProjectiles: group.length,
      intercepted,
      impacted,
      weapons,
      damageSeverity: worstSeverity,
    };
  });
}
