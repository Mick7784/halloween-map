import type { publicHouse } from "./domain";
type RouteHouse = ReturnType<typeof publicHouse>;
export function houseTravelKey(h: RouteHouse) {
  return JSON.stringify([
    h.latitude,
    h.longitude,
    +new Date(h.starts_at),
    +new Date(h.ends_at),
    h.adaptable ? null : h.fear,
    h.adaptable,
  ]);
}
export function houseRouteKey(h: RouteHouse) {
  return JSON.stringify([
    h.id,
    h.name,
    h.address,
    h.latitude,
    h.longitude,
    [...h.activities].sort(),
    +new Date(h.starts_at),
    +new Date(h.ends_at),
    h.fear,
    h.adaptable,
    h.rp,
    h.practical,
  ]);
}
