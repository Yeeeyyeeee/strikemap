/**
 * Great-circle arc utilities for missile trajectory rendering.
 * Pure math — no external dependencies.
 */

type LngLat = [number, number]; // [lng, lat]

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

/**
 * Generate points along a great-circle arc between two coordinates,
 * with a perpendicular "altitude" offset that makes the trajectory
 * visually arc above the earth's surface on a 2D map.
 *
 * altitudeFactor controls the perpendicular bulge as a fraction of
 * the total distance (0 = flat on surface, 0.15 = noticeable arc).
 */
export function greatCircleArc(
  from: LngLat,
  to: LngLat,
  numPoints = 64,
  altitudeFactor = 0.15
): LngLat[] {
  const [lng1, lat1] = from;
  const [lng2, lat2] = to;

  const phi1 = lat1 * DEG;
  const lam1 = lng1 * DEG;
  const phi2 = lat2 * DEG;
  const lam2 = lng2 * DEG;

  // Central angle via Vincenty formula (numerically stable)
  const dLam = lam2 - lam1;
  const sinPhi1 = Math.sin(phi1);
  const cosPhi1 = Math.cos(phi1);
  const sinPhi2 = Math.sin(phi2);
  const cosPhi2 = Math.cos(phi2);

  const a = cosPhi2 * Math.sin(dLam);
  const b = cosPhi1 * sinPhi2 - sinPhi1 * cosPhi2 * Math.cos(dLam);
  const c = sinPhi1 * sinPhi2 + cosPhi1 * cosPhi2 * Math.cos(dLam);
  const d = Math.atan2(Math.sqrt(a * a + b * b), c);

  if (d < 1e-10) {
    return [from, to];
  }

  const sinD = Math.sin(d);
  const points: LngLat[] = [];

  // Compute the base great-circle points
  for (let i = 0; i <= numPoints; i++) {
    const f = i / numPoints;
    const A = Math.sin((1 - f) * d) / sinD;
    const B = Math.sin(f * d) / sinD;

    const x = A * cosPhi1 * Math.cos(lam1) + B * cosPhi2 * Math.cos(lam2);
    const y = A * cosPhi1 * Math.sin(lam1) + B * cosPhi2 * Math.sin(lam2);
    const z = A * sinPhi1 + B * sinPhi2;

    const lat = Math.atan2(z, Math.sqrt(x * x + y * y)) * RAD;
    const lng = Math.atan2(y, x) * RAD;
    points.push([lng, lat]);
  }

  // Apply altitude offset — perpendicular bulge for "flying above the surface" look
  if (altitudeFactor > 0) {
    // Compute perpendicular direction in Mercator-adjusted coords
    const midLat = (lat1 + lat2) / 2;
    const cosLat = Math.cos(midLat * DEG);

    // Adjusted deltas (scale lng by cos(lat) so 1° lng ≈ 1° lat visually)
    const dx = (lng2 - lng1) * cosLat;
    const dy = lat2 - lat1;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > 1e-6) {
      // Right perpendicular (dy, -dx) — arcs "above" the straight line
      // for typical east→west Middle East trajectories this means northward
      const perpLen = dist;
      const perpDxAdj = dy / perpLen; // in adjusted coords
      const perpDy = -dx / perpLen;

      // Convert perpendicular back to degrees (undo cosLat for longitude)
      const perpLng = perpDxAdj / cosLat;
      const perpLat = perpDy;

      // Max offset scales with distance, capped at 5° to avoid absurd arcs
      const maxOffset = Math.min(dist * altitudeFactor, 5);

      // Apply parabolic offset: sin(π·t) peaks at midpoint
      for (let i = 1; i < points.length - 1; i++) {
        const t = i / numPoints;
        const offset = maxOffset * Math.sin(Math.PI * t);
        points[i] = [points[i][0] + perpLng * offset, points[i][1] + perpLat * offset];
      }
    }
  }

  return points;
}

/**
 * Get the position at a given fraction (0–1) along a pre-computed arc.
 */
export function interpolateArc(arc: LngLat[], fraction: number): LngLat {
  const f = Math.max(0, Math.min(1, fraction));
  const idx = f * (arc.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.min(lo + 1, arc.length - 1);
  const t = idx - lo;

  return [arc[lo][0] + t * (arc[hi][0] - arc[lo][0]), arc[lo][1] + t * (arc[hi][1] - arc[lo][1])];
}

/**
 * Compute bearing (degrees clockwise from north) at a given fraction along an arc.
 * Used to rotate the missile icon in the direction of travel.
 */
export function bearingAtArcPoint(arc: LngLat[], fraction: number): number {
  const f = Math.max(0, Math.min(1, fraction));
  const idx = f * (arc.length - 1);
  const lo = Math.max(0, Math.floor(idx) - 1);
  const hi = Math.min(lo + 2, arc.length - 1);

  const [lng1, lat1] = arc[lo];
  const [lng2, lat2] = arc[hi];

  const dLng = (lng2 - lng1) * DEG;
  const phi1 = lat1 * DEG;
  const phi2 = lat2 * DEG;

  const x = Math.sin(dLng) * Math.cos(phi2);
  const y = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLng);

  return (Math.atan2(x, y) * RAD + 360) % 360;
}
