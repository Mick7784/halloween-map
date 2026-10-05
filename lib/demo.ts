import type { House, Instance, Season } from "./domain";
import {
  createWalkingRouter,
  RoutingError,
  type Point,
  type WalkingRouter,
} from "./walking-router";
import { DateTime } from "luxon";
export function demoSeason(s: Season): Season {
  return { ...s, activated: true, archived: false, purged_at: null };
}
export function demoTime(i: Instance, s: Season, houses: House[]) {
  const start = +new Date(s.opens_at),
    end = +new Date(s.closes_at);
  const evening = +DateTime.fromObject(
    { year: s.year, month: 10, day: 31, hour: 18 },
    { zone: i.timezone },
  );
  const candidates = [
    evening >= start && evening <= end - 30 * 60000 ? evening : start,
    ...houses.map((h) => +new Date(h.starts_at)),
  ];
  return new Date(
    candidates
      .filter((t) => t >= start && t < end)
      .sort(
        (a, b) =>
          houses.filter(
            (h) => +new Date(h.starts_at) <= b && +new Date(h.ends_at) > b,
          ).length -
          houses.filter(
            (h) => +new Date(h.starts_at) <= a && +new Date(h.ends_at) > a,
          ).length,
      )[0] ?? start,
  );
}
const positions = new Map<string, Promise<Point[]>>();
function separation(a: Point, b: Point) {
  return Math.hypot(
    (a.latitude - b.latitude) * 111320,
    (a.longitude - b.longitude) *
      111320 *
      Math.cos((a.latitude * Math.PI) / 180),
  );
}
export async function demoPositions(
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
export async function fictionalHouses(
  i: Instance,
  s: Season,
): Promise<House[]> {
  const key = JSON.stringify([
    i.latitude,
    i.longitude,
    process.env.ORS_BASE_URL,
  ]);
  let pending = positions.get(key);
  if (!pending) {
    pending = demoPositions(i, createWalkingRouter());
    if (positions.size >= 32) positions.delete(positions.keys().next().value!);
    positions.set(key, pending);
    pending.catch(() => {
      if (positions.get(key) === pending) positions.delete(key);
    });
  }
  const points = await pending;
  const names = [
    "Les petits fantômes",
    "Le jardin des brumes",
    "Le manoir de minuit",
    "Les lanternes oubliées",
    "Le refuge des sorcières",
  ];
  return names.map((name, n) => ({
    id: `demo-${n}`,
    instance_id: i.id,
    season_id: s.id,
    user_id: "",
    name,
    address: `Maison de démonstration · ${i.territory}`,
    latitude: points[n].latitude,
    longitude: points[n].longitude,
    activities: n % 2 ? ["DECORATION", "ACTING"] : ["DECORATION", "CANDY"],
    starts_at: s.opens_at,
    ends_at: s.closes_at,
    fear: n + 1,
    adaptable: n === 0,
    rp: "Une ambiance de démonstration et quelques surprises.",
    practical:
      "Maison de démonstration, aucune adresse de participation réelle.",
    candy_available: true,
    status: "VISIBLE",
    activity: "ACTIVE",
    demo: true,
  }));
}
