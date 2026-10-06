import type { Instance } from "../lib/domain";
import {
  RoutingError,
  type Point,
  type WalkingRouter,
} from "../lib/walking-router";
function separation(a: Point, b: Point) {
  return Math.hypot(
    (a.latitude - b.latitude) * 111320,
    (a.longitude - b.longitude) *
      111320 *
      Math.cos((a.latitude * Math.PI) / 180),
  );
}
export async function discoverTestPositions(
  i: Instance,
  router: WalkingRouter,
): Promise<Point[]> {
  if (!router.snap) throw new RoutingError("configuration");
  // Fixed concentric sampling only seeds discovery; never display unvalidated seeds.
  const candidates: Point[] = [
    { latitude: i.latitude, longitude: i.longitude },
  ];
  for (const radius of [200, 450, 750])
    for (let n = 0; n < 8; n++) {
      const angle = (n * Math.PI) / 4;
      candidates.push({
        latitude: i.latitude + (Math.sin(angle) * radius) / 111320,
        longitude:
          i.longitude +
          (Math.cos(angle) * radius) /
            (111320 * Math.cos((i.latitude * Math.PI) / 180)),
      });
    }
  const snapped = (await router.snap(candidates, 300)).filter(
    (p): p is Point => p !== null,
  );
  const distinct: Point[] = [];
  for (const p of snapped)
    if (distinct.every((q) => separation(p, q) >= 80)) distinct.push(p);
  if (distinct.length < 5) throw new RoutingError("no_route");
  const matrix = await router.matrix(distinct);
  for (let anchor = 0; anchor < distinct.length; anchor++) {
    const selected = [anchor];
    for (let n = 0; n < distinct.length && selected.length < 5; n++)
      if (
        !selected.includes(n) &&
        selected.every((q) => matrix[q][n] && matrix[n][q])
      )
        selected.push(n);
    if (selected.length === 5) {
      const result = selected.map((n) => distinct[n]);
      await router.directions(result); // Require an actual connected pedestrian itinerary.
      return result;
    }
  }
  throw new RoutingError("no_route");
}
