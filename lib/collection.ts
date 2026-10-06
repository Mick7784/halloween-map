import type { RouteResult } from "./routing";
export type Collection = {
  startedAt: string | null;
  endedAt: string | null;
  distanceMeters: number;
  visitedIds: string[];
};
export const emptyCollection = (): Collection => ({
  startedAt: null,
  endedAt: null,
  distanceMeters: 0,
  visitedIds: [],
});
export type GPSFix = {
  point: [number, number];
  accuracy: number;
  timestamp: number;
};
export type CollectionTracker = {
  anchor: GPSFix | null;
  lastTimestamp: number;
  near: Record<string, { since: number; count: number }>;
};
export const emptyTracker = (): CollectionTracker => ({
  anchor: null,
  lastTimestamp: 0,
  near: {},
});
export function gpsDistance(a: [number, number], b: [number, number]) {
  const rad = Math.PI / 180,
    dlat = (b[1] - a[1]) * rad,
    dlon = (b[0] - a[0]) * rad;
  const h =
    Math.sin(dlat / 2) ** 2 +
    Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dlon / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}
// Only an anchor and short presence confirmations live in memory; no GPS trace is stored.
export function collectGPS(
  previous: CollectionTracker,
  fix: GPSFix,
  houses: RouteResult["stops"],
  visitedIds: string[],
  now: number,
) {
  const rejected = {
    tracker: previous,
    accepted: false,
    distanceDelta: 0,
    visitedIds,
  };
  if (
    !Number.isFinite(fix.timestamp) ||
    fix.timestamp <= previous.lastTimestamp ||
    fix.timestamp < now - 15000 ||
    fix.timestamp > now + 5000
  )
    return rejected;
  if (!Number.isFinite(fix.accuracy) || fix.accuracy < 0 || fix.accuracy > 35)
    return {
      ...rejected,
      tracker: { anchor: null, lastTimestamp: fix.timestamp, near: {} },
    };
  let anchor = previous.anchor,
    delta = 0;
  if (anchor) {
    const seconds = (fix.timestamp - anchor.timestamp) / 1000,
      distance = gpsDistance(anchor.point, fix.point);
    if (seconds > 60)
      anchor = null; // Never invent a segment across a GPS/background gap.
    else if (distance > Math.max(15, seconds * 3.5))
      return {
        ...rejected,
        tracker: { ...previous, lastTimestamp: fix.timestamp, near: {} },
      };
    else if (distance >= Math.max(3, (anchor.accuracy + fix.accuracy) * 0.4)) {
      delta = distance;
      anchor = null;
    }
  }
  const near: CollectionTracker["near"] = {},
    visited = new Set(visitedIds);
  if (fix.accuracy <= 20)
    for (const stop of houses) {
      const h = stop.house;
      if (
        visited.has(h.id) ||
        stop.unavailable ||
        +new Date(h.starts_at) > fix.timestamp ||
        +new Date(h.ends_at) <= fix.timestamp ||
        gpsDistance(fix.point, [h.longitude, h.latitude]) > 25
      )
        continue;
      const presence = (fix.timestamp - previous.lastTimestamp <= 15000
        ? previous.near[h.id]
        : undefined) ?? {
        since: fix.timestamp,
        count: 0,
      };
      near[h.id] = { since: presence.since, count: presence.count + 1 };
      if (near[h.id].count >= 3 && fix.timestamp - presence.since >= 6000) {
        visited.add(h.id);
        delete near[h.id];
      }
    }
  return {
    tracker: { anchor: anchor ?? fix, lastTimestamp: fix.timestamp, near },
    accepted: true,
    distanceDelta: delta,
    visitedIds: [...visited],
  };
}
export function remainingHouses(
  stops: RouteResult["stops"],
  visitedIds: string[],
) {
  return stops.filter(
    (s) => !s.unavailable && !visitedIds.includes(s.house.id),
  );
}
export function finishCollection(
  collection: Collection,
  now: number,
): Collection {
  return collection.endedAt
    ? collection
    : { ...collection, endedAt: new Date(now).toISOString() };
}
export function collectionStats(
  collection: Collection,
  selected: number,
  now = Date.now(),
) {
  const visited = collection.visitedIds.length;
  return {
    selected,
    visited,
    completion: selected ? Math.round((visited / selected) * 100) : 0,
    distanceMeters: collection.distanceMeters,
    durationSeconds: collection.startedAt
      ? Math.max(
          0,
          Math.floor(
            ((collection.endedAt ? +new Date(collection.endedAt) : now) -
              +new Date(collection.startedAt)) /
              1000,
          ),
        )
      : 0,
  };
}
