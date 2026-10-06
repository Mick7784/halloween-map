import {
  effectiveActivities,
  publicHouse,
  mapAccessible,
  type Activity,
  type House,
  type Season,
} from "./domain";
import {
  createWalkingRouter,
  RoutingError,
  type Point,
  type WalkingRouter,
} from "./walking-router";
export type { Point } from "./walking-router";
const familyWalkingSeconds = (cost: {
  durationSeconds: number;
  distanceMeters: number;
}) => Math.max(cost.durationSeconds, cost.distanceMeters); // 1 m/s, with five minutes per house.
export type RouteInput = {
  start: string;
  end: string;
  origin: Point;
  activities: Activity[];
  maxFear?: number;
};
export type RouteResult = {
  stops: {
    unavailable?: boolean;
    house: ReturnType<typeof publicHouse>;
    arrival: string;
    departure: string;
    walkingMinutes: number;
    walkingSeconds: number;
    distanceMeters: number;
  }[];
  distanceMeters: number;
  walkingMinutes: number;
  walkingSeconds: number;
  durationMinutes: number;
  estimatedEnd: string;
  geometry: number[][];
  disclaimer: string;
  message?: string;
};
export function validateRouteWindow(
  season: Season,
  input: RouteInput,
  now: Date,
  earlyAccess = false,
) {
  if (!mapAccessible(season, now, earlyAccess))
    throw new Error("La carte est fermée");
  const start = +new Date(input.start),
    end = +new Date(input.end);
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    end <= start ||
    start < +now - 60000 ||
    start < +new Date(season.opens_at) ||
    end > +new Date(season.closes_at)
  )
    throw new Error("Fenêtre de parcours invalide");
}
export async function planRoute(
  houses: House[],
  season: Season,
  input: RouteInput,
  now = new Date(),
  router?: WalkingRouter,
  earlyAccess = false,
): Promise<RouteResult> {
  validateRouteWindow(season, input, now, earlyAccess);
  const end = +new Date(input.end),
    start = +new Date(input.start);
  const eligible = houses
    .filter(
      (h) =>
        h.status === "VISIBLE" &&
        (h.review_status ?? "VALIDATED") === "VALIDATED" &&
        h.activity === "ACTIVE" &&
        effectiveActivities(h).length &&
        (!input.activities.length ||
          input.activities.some((a) => effectiveActivities(h).includes(a))) &&
        (!input.maxFear || h.adaptable || h.fear <= input.maxFear) &&
        +new Date(h.starts_at) < end &&
        +new Date(h.ends_at) > start,
    )
    .sort((a, b) => a.id.localeCompare(b.id));
  const empty: RouteResult = {
    stops: [],
    distanceMeters: 0,
    walkingMinutes: 0,
    walkingSeconds: 0,
    durationMinutes: 0,
    estimatedEnd: input.start,
    geometry: [],
    disclaimer: "",
    message:
      "Aucune sélection de maisons compatible. Vérifiez les filtres et les horaires.",
  };
  if (!eligible.length) return empty;
  const engine = router ?? createWalkingRouter(),
    points = [input.origin, ...eligible];
  const matrix = await engine.matrix(points);
  if (
    matrix.length !== points.length ||
    matrix.some((row) => row.length !== points.length)
  )
    throw new RoutingError("invalid");
  let current = 0,
    time = start;
  const remaining = eligible.map((h, i) => ({ h, index: i + 1 })),
    selected: House[] = [];
  while (remaining.length && selected.length < 30) {
    const candidates = remaining
      .flatMap((c) => {
        const cost = matrix[current][c.index];
        if (!cost) return [];
        const arrival = Math.max(
            time + familyWalkingSeconds(cost) * 1000,
            +new Date(c.h.starts_at),
          ),
          departure = arrival + 300000;
        return departure <= end && departure <= +new Date(c.h.ends_at)
          ? [{ ...c, arrival, departure, cost }]
          : [];
      })
      .sort(
        (a, b) =>
          a.arrival - b.arrival ||
          a.cost.distanceMeters - b.cost.distanceMeters ||
          a.h.id.localeCompare(b.h.id),
      );
    if (!candidates.length) break;
    const next = candidates[0];
    selected.push(next.h);
    current = next.index;
    time = next.departure;
    remaining.splice(
      remaining.findIndex((c) => c.index === next.index),
      1,
    );
  }
  if (!selected.length) return empty;
  // Final directions own both geometry and metrics. Recheck the schedule if
  // directions differ from matrix costs, rerouting after any removed stop.
  while (selected.length) {
    const routed = await engine.directions([input.origin, ...selected]);
    time = start;
    const stops: RouteResult["stops"] = [];
    let invalid = -1;
    if (routed.legs.length !== selected.length || routed.geometry.length < 2)
      throw new RoutingError("invalid");
    for (let i = 0; i < selected.length; i++) {
      const h = selected[i],
        leg = routed.legs[i];
      const arrival = Math.max(
        time + familyWalkingSeconds(leg) * 1000,
        +new Date(h.starts_at),
      );
      time = arrival + 300000;
      if (time > end || time > +new Date(h.ends_at)) {
        invalid = i;
        break;
      }
      stops.push({
        house: publicHouse(h),
        arrival: new Date(arrival).toISOString(),
        departure: new Date(time).toISOString(),
        walkingMinutes: Math.ceil(familyWalkingSeconds(leg) / 60),
        walkingSeconds: familyWalkingSeconds(leg),
        distanceMeters: leg.distanceMeters,
      });
    }
    if (invalid >= 0) {
      selected.splice(invalid, 1);
      continue;
    }
    const walkingSeconds = stops.reduce((sum, s) => sum + s.walkingSeconds, 0);
    return {
      stops,
      distanceMeters: stops.reduce((sum, s) => sum + s.distanceMeters, 0),
      walkingSeconds,
      walkingMinutes: Math.ceil(walkingSeconds / 60),
      durationMinutes: Math.ceil((time - start) / 60000),
      estimatedEnd: new Date(time).toISOString(),
      geometry: routed.geometry,
      disclaimer:
        "Estimation indicative à pied · openrouteservice / © OpenStreetMap contributors. Allure familiale et 5 minutes par maison. Choisissez librement votre chemin et l’ordre des visites.",
    };
  }
  return empty;
}
