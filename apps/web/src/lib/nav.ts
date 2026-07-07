// Turn-by-turn navigation geometry. Given the route polyline and the user's live
// position, work out how far along the route they are (to pick the current step)
// and how far off it they've strayed (to warn / prompt a re-route).

export type LngLat = [number, number];

/** Metres between two lng/lat points (equirectangular — accurate at city scale). */
export function metersBetween(a: LngLat, b: LngLat): number {
  const latRad = (a[1] * Math.PI) / 180;
  const dx = (b[0] - a[0]) * 111320 * Math.cos(latRad);
  const dy = (b[1] - a[1]) * 110540;
  return Math.hypot(dx, dy);
}

/**
 * Project `pos` onto the route polyline. Returns the distance travelled ALONG the
 * route to the nearest point (metres) and the perpendicular OFF-route distance.
 */
export function projectOntoRoute(pos: LngLat, line: LngLat[]): { along: number; off: number } {
  if (line.length < 2) return { along: 0, off: Infinity };
  let cum = 0;
  let bestOff = Infinity;
  let bestAlong = 0;
  for (let i = 0; i + 1 < line.length; i++) {
    const a = line[i];
    const b = line[i + 1];
    if (!a || !b) continue;
    const latRad = (a[1] * Math.PI) / 180;
    const mx = 111320 * Math.cos(latRad);
    const my = 110540;
    const px = (pos[0] - a[0]) * mx;
    const py = (pos[1] - a[1]) * my;
    const bx = (b[0] - a[0]) * mx;
    const by = (b[1] - a[1]) * my;
    const segLen2 = bx * bx + by * by;
    const segLen = Math.sqrt(segLen2);
    let t = segLen2 ? (px * bx + py * by) / segLen2 : 0;
    t = Math.max(0, Math.min(1, t));
    const off = Math.hypot(px - t * bx, py - t * by);
    if (off < bestOff) {
      bestOff = off;
      bestAlong = cum + segLen * t;
    }
    cum += segLen;
  }
  return { along: bestAlong, off: bestOff };
}

/** Cumulative distance to the END of each step (its maneuver point along the route). */
export function stepCumulative(steps: { distance: number }[]): number[] {
  let acc = 0;
  return steps.map((s) => (acc += s.distance));
}

/**
 * Which step the user is currently completing, given how far along the route they
 * are. The current step is the first whose maneuver point is still ahead.
 */
export function currentStepIndex(along: number, stepEnds: number[]): number {
  for (let i = 0; i < stepEnds.length; i++) {
    if ((stepEnds[i] ?? Infinity) > along - 5) return i; // 5 m tolerance so we don't flip early
  }
  return Math.max(0, stepEnds.length - 1);
}
