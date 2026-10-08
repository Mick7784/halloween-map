import type { RouteResult } from "./routing";
import type { Activity } from "./domain";
import { gpsDistance, type GPSFix } from "./collection";

type House = RouteResult["stops"][number]["house"];
export function acceptsFear(house: House, maximum: number) {
  return house.adaptable || (house.fear !== null && house.fear <= maximum);
}
export function selectableHouses(
  houses: House[],
  maximum: number,
  activities: Activity[],
  start: number,
  end: number,
) {
  return houses.filter(
    (h) =>
      acceptsFear(h, maximum) &&
      h.activities.length > 0 &&
      (!activities.length ||
        activities.some((a) => h.activities.includes(a))) &&
      +new Date(h.starts_at) < end &&
      +new Date(h.ends_at) > start,
  );
}
// Keep the current highlight until another house is decisively closer than GPS noise.
export function nearestHouse(
  stops: RouteResult["stops"],
  visited: string[],
  fix: GPSFix | null,
  previous: string | null,
  now: number,
) {
  if (
    !fix ||
    !Number.isFinite(fix.timestamp) ||
    !fix.point.every(Number.isFinite) ||
    Math.abs(fix.point[0]) > 180 ||
    Math.abs(fix.point[1]) > 90 ||
    !Number.isFinite(fix.accuracy) ||
    fix.accuracy > 20 ||
    fix.accuracy < 0 ||
    fix.timestamp < now - 15000 ||
    fix.timestamp > now + 5000
  )
    return null;
  const eligible = stops
    .filter(
      (s) =>
        !s.unavailable &&
        !visited.includes(s.house.id) &&
        s.house.activities.length &&
        +new Date(s.house.starts_at) <= now &&
        +new Date(s.house.ends_at) > now,
    )
    .map((s) => ({
      id: s.house.id,
      distance: gpsDistance(fix.point, [s.house.longitude, s.house.latitude]),
    }))
    .sort((a, b) => a.distance - b.distance || a.id.localeCompare(b.id));
  const best = eligible[0],
    retained = eligible.find((h) => h.id === previous);
  if (!best) return null;
  return retained &&
    retained.distance - best.distance < Math.max(20, fix.accuracy * 2)
    ? retained.id
    : best.id;
}
export function removeUnvisitedHouse(
  result: RouteResult,
  visited: string[],
  id: string,
): RouteResult {
  // A visited house stays in the selection and the report; its history is never erased.
  if (visited.includes(id)) return result;
  return {
    ...result,
    geometry: [],
    stops: result.stops.filter((s) => s.house.id !== id),
  };
}
