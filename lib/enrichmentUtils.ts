/**
 * Shared enrichment application logic.
 * Applies keyword enrichment results onto an Incident object.
 */

import { Incident } from "./types";

interface KeywordResult {
  location: string;
  lat: number;
  lng: number;
  weapon?: string;
  target_type?: string;
  side: Incident["side"];
  target_military: boolean;
  intercepted_by?: string;
  intercept_success?: boolean | null;
  missiles_fired?: number;
  missiles_intercepted?: number;
  casualties_military: number;
  casualties_civilian: number;
  casualties_description?: string;
  damage_assessment?: string;
  damage_severity?: string;
  isStatement?: boolean;
}

/** Apply keyword enrichment results onto an incident (mutates in place). */
export function applyEnrichment(inc: Incident, kwResult: KeywordResult): void {
  inc.location = kwResult.location;
  inc.lat = kwResult.lat;
  inc.lng = kwResult.lng;
  inc.weapon = kwResult.weapon || inc.weapon;
  inc.target_type = kwResult.target_type || inc.target_type;
  inc.side = kwResult.side;
  inc.target_military = kwResult.target_military;
  if (kwResult.intercepted_by) inc.intercepted_by = kwResult.intercepted_by;
  if (kwResult.intercept_success != null) inc.intercept_success = kwResult.intercept_success;
  if (kwResult.missiles_fired) inc.missiles_fired = kwResult.missiles_fired;
  if (kwResult.missiles_intercepted) inc.missiles_intercepted = kwResult.missiles_intercepted;
  if (kwResult.casualties_military) inc.casualties_military = kwResult.casualties_military;
  if (kwResult.casualties_civilian) inc.casualties_civilian = kwResult.casualties_civilian;
  if (kwResult.casualties_description && kwResult.casualties_description !== "No casualties reported") {
    inc.casualties_description = kwResult.casualties_description;
  }
  if (kwResult.damage_assessment) inc.damage_assessment = kwResult.damage_assessment;
  if (kwResult.damage_severity) inc.damage_severity = kwResult.damage_severity as Incident["damage_severity"];
  if (kwResult.isStatement) inc.isStatement = true;
}
