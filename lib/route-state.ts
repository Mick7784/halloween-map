import type { publicHouse } from "./domain";
import type { RouteResult } from "./routing";
type RouteHouse = ReturnType<typeof publicHouse>;
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
// Never remove individual stops while retaining the old geometry or totals.
export function routeIsCurrent(
  route: RouteResult,
  houses: RouteHouse[],
  now: number,
) {
  return route.stops.every(
    (s) =>
      +new Date(s.house.ends_at) > now &&
      houses.some(
        (h) =>
          h.id === s.house.id && houseRouteKey(h) === houseRouteKey(s.house),
      ),
  );
}
