import {
  effectiveActivities,
  seasonState,
  type Activity,
  type House,
  type Season,
} from "./domain";
export type Point = { latitude: number; longitude: number };
export function distance(a: Point, b: Point) {
  const rad = Math.PI / 180,
    dy = (b.latitude - a.latitude) * rad,
    dx = (b.longitude - a.longitude) * rad;
  const n =
    Math.sin(dy / 2) ** 2 +
    Math.cos(a.latitude * rad) *
      Math.cos(b.latitude * rad) *
      Math.sin(dx / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(n), Math.sqrt(1 - n));
}
// Isolated replaceable engine. Estimated walking legs, not road directions.
export function planRoute(
  houses: House[],
  season: Season,
  input: {
    start: string;
    end: string;
    origin: Point;
    activities: Activity[];
    maxFear?: number;
  },
  now = new Date(),
) {
  if (seasonState(season, now) !== "MAP_OPEN")
    throw new Error("La carte est fermée");
  let time = +new Date(input.start);
  const end = +new Date(input.end);
  if (
    !Number.isFinite(time) ||
    !Number.isFinite(end) ||
    end <= time ||
    time < +now - 60000 ||
    end > +new Date(season.closes_at)
  )
    throw new Error("Fenêtre de parcours invalide");
  let point = input.origin,
    meters = 0;
  const remaining = houses.filter(
    (h) =>
      h.status === "VISIBLE" &&
      h.activity === "ACTIVE" &&
      effectiveActivities(h).length &&
      (!input.activities.length ||
        input.activities.some((a) => effectiveActivities(h).includes(a))) &&
      (!input.maxFear || h.adaptable || h.fear <= input.maxFear),
  );
  const stops: {
    house: ReturnType<typeof import("./domain").publicHouse>;
    arrival: string;
    departure: string;
    walkingMinutes: number;
  }[] = [];
  while (remaining.length && stops.length < 30) {
    const candidates = remaining
      .map((h) => {
        const m = distance(point, h),
          travel = (m / 70) * 60000;
        const arrival = Math.max(time + travel, +new Date(h.starts_at));
        return { h, m, travel, arrival, departure: arrival + 5 * 60000 };
      })
      .filter(
        (c) => c.departure <= end && c.departure <= +new Date(c.h.ends_at),
      )
      .sort((a, b) => a.arrival - b.arrival);
    if (!candidates.length) break;
    const c = candidates[0];
    const h = c.h;
    stops.push({
      house: {
        id: h.id,
        name: h.name,
        address: h.address,
        latitude: h.latitude,
        longitude: h.longitude,
        activities: effectiveActivities(h),
        starts_at: h.starts_at,
        ends_at: h.ends_at,
        fear: h.adaptable ? null : h.fear,
        adaptable: h.adaptable,
        rp: h.rp,
        practical: h.practical,
      },
      arrival: new Date(c.arrival).toISOString(),
      departure: new Date(c.departure).toISOString(),
      walkingMinutes: Math.ceil(c.travel / 60000),
    });
    time = c.departure;
    meters += c.m;
    point = h;
    remaining.splice(remaining.indexOf(h), 1);
  }
  return {
    stops,
    distanceMeters: Math.round(meters),
    durationMinutes: Math.ceil((time - +new Date(input.start)) / 60000),
    estimatedEnd: new Date(time).toISOString(),
    geometry: [
      [input.origin.longitude, input.origin.latitude],
      ...stops.map((s) => [s.house.longitude, s.house.latitude]),
    ],
    disclaimer:
      "Estimation à pied (4,2 km/h), 5 minutes par maison. Les segments relient les étapes à vol d’oiseau : suivez les voies publiques et vérifiez les accès.",
  };
}
