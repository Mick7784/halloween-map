import {
  effectiveActivities,
  publicHouse,
  type House,
  type Season,
} from "./domain";
import type { RouteInput, RouteResult } from "./routing";
import { validateRouteWindow } from "./selection-window";

// Keep the legacy response contract for saved collections and reporting.
// Neutral metrics are compatibility fields, never travel estimates.
export function prepareSelection(
  houses: House[],
  season: Season,
  input: RouteInput,
  now: Date,
): RouteResult {
  validateRouteWindow(season, input, now);
  const start = +new Date(input.start),
    end = +new Date(input.end);
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
    .slice(0, 30);
  return {
    stops: eligible.map((h) => {
      const availableFrom = new Date(
        Math.max(start, +new Date(h.starts_at)),
      ).toISOString();
      return {
        house: publicHouse(h),
        arrival: availableFrom,
        departure: availableFrom,
        walkingMinutes: 0,
        walkingSeconds: 0,
        distanceMeters: 0,
      };
    }),
    distanceMeters: 0,
    walkingMinutes: 0,
    walkingSeconds: 0,
    durationMinutes: 0,
    estimatedEnd: input.start,
    geometry: [],
    disclaimer:
      "Sélection libre : choisissez vos maisons et l’ordre des visites.",
    ...(!eligible.length
      ? { message: "Aucune maison disponible avec ces filtres et horaires." }
      : {}),
  };
}

export function neutralSelection(result: RouteResult): RouteResult {
  return {
    ...result,
    geometry: [],
    distanceMeters: 0,
    walkingMinutes: 0,
    walkingSeconds: 0,
    durationMinutes: 0,
    estimatedEnd: result.stops[0]?.house.starts_at ?? result.estimatedEnd,
    disclaimer:
      "Sélection libre : choisissez vos maisons et l’ordre des visites.",
    stops: result.stops.map((s) => ({
      ...s,
      arrival: s.house.starts_at,
      departure: s.house.starts_at,
      walkingMinutes: 0,
      walkingSeconds: 0,
      distanceMeters: 0,
    })),
  };
}
