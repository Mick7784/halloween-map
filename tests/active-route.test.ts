import { describe, it, expect, vi } from "vitest";
import {
  restoreRoute,
  annotateAvailability,
  type StoredRoute,
} from "../lib/active-route";
import { watchCurrentPosition } from "../lib/geolocation";
const identity = {
  ownerId: "visitor",
  instanceId: "20000000-0000-4000-8000-000000000001",
  seasonId: "30000000-0000-4000-8000-000000000001",
};
const saved: StoredRoute = {
  format: 2,
  phase: "calculated",
  collection: {
    startedAt: null,
    endedAt: null,
    distanceMeters: 0,
    visitedIds: [],
  },
  ...identity,
  createdAt: "2026-10-31T18:00:00Z",
  updatedAt: "2026-10-31T18:00:00Z",
  expiresAt: "2026-10-31T20:00:00Z",
  sheet: "intermediate",
  camera: { center: [-1.67, 48.1], zoom: 14, bearing: 10, pitch: 20 },
  parameters: {
    start: "2026-10-31T18:00:00Z",
    end: "2026-10-31T20:00:00Z",
    origin: { longitude: -1.67, latitude: 48.1 },
    activities: [],
    excludedHouseIds: [],
    acceptance: {
      mode: "GUIDELINES_ONLY",
      guidelines: true,
      guidelines_version: "2026.1",
    },
  },
  result: {
    stops: [
      {
        house: {
          id: "10000000-0000-4000-8000-000000000001",
          name: "Maison",
          address: "Adresse",
          latitude: 48.1,
          longitude: -1.67,
          activities: ["CANDY"],
          starts_at: "2026-10-31T17:00:00Z",
          ends_at: "2026-10-31T22:00:00Z",
          fear: null,
          adaptable: true,
          rp: "",
          practical: "",
        },
        arrival: "2026-10-31T18:10:00Z",
        departure: "2026-10-31T18:15:00Z",
        distanceMeters: 100,
        walkingMinutes: 2,
        walkingSeconds: 120,
      },
    ],
    distanceMeters: 100,
    walkingMinutes: 2,
    walkingSeconds: 120,
    durationMinutes: 15,
    estimatedEnd: "2026-10-31T18:15:00Z",
    geometry: [
      [-1.67, 48.1],
      [-1.68, 48.11],
    ],
    disclaimer: "Piéton",
  },
};
describe("local active route", () => {
  it("restores the complete active route and rejects obsolete identity, expiry, formats and corrupt data", () => {
    const now = +new Date("2026-10-31T18:30Z");
    expect(restoreRoute(JSON.stringify(saved), identity, now)).toEqual(saved);
    for (const value of [
      { ...saved, format: 3 },
      { ...saved, expiresAt: "2026-10-31T18:00:00Z" },
      { ...saved, ownerId: "other" },
      { ...saved, seasonId: "00000000-0000-4000-8000-000000000000" },
      { ...saved, result: { ...saved.result, geometry: [[null, null]] } },
    ])
      expect(restoreRoute(JSON.stringify(value), identity, now)).toBeNull();
    expect(restoreRoute("broken", identity, now)).toBeNull();
  });
  it("preserves optional house presentation metadata while keeping legacy routes valid", () => {
    const enriched = structuredClone(saved);
    Object.assign(enriched.result.stops[0].house, {
      offeredActivities: ["CANDY", "ACTING"],
      candy_available: false,
      referenceFear: 4,
    });
    const now = +new Date("2026-10-31T18:30Z");
    expect(restoreRoute(JSON.stringify(enriched), identity, now)).toEqual(
      enriched,
    );
    expect(restoreRoute(JSON.stringify(saved), identity, now)).toEqual(saved);
  });
  it("marks an unavailable step without changing its schedule, geometry or totals", () => {
    const result = annotateAvailability(saved.result, {
      valid: true,
      checkedAt: saved.updatedAt,
      steps: [
        {
          id: saved.result.stops[0].house.id,
          available: false,
          reason: "unavailable",
        },
      ],
    });
    expect(result.stops[0].unavailable).toBe(true);
    expect(result.geometry).toBe(saved.result.geometry);
    expect(result.distanceMeters).toBe(saved.result.distanceMeters);
    expect(result.stops[0].arrival).toBe(saved.result.stops[0].arrival);
  });
});
it("refreshes remaining activities without changing the pedestrian route", () => {
  const result = annotateAvailability(saved.result, {
    valid: true,
    checkedAt: saved.updatedAt,
    steps: [
      {
        id: saved.result.stops[0].house.id,
        available: true,
        activities: ["ACTING"],
      },
    ],
  });
  expect(result.stops[0].house.activities).toEqual(["ACTING"]);
  expect(result.stops[0].unavailable).toBe(false);
  expect(result.geometry).toBe(saved.result.geometry);
});
describe("continuous GPS using the same position validation", () => {
  it("delivers live positions including low precision, tolerates signal loss, and stops late callbacks", () => {
    let success!: PositionCallback, failure!: PositionErrorCallback;
    const geo = {
      watchPosition: vi.fn(
        (
          ok: PositionCallback,
          fail: PositionErrorCallback,
          _options?: PositionOptions,
        ) => {
          void _options;
          success = ok;
          failure = fail;
          return 7;
        },
      ),
      clearWatch: vi.fn(),
    };
    const position = vi.fn(),
      error = vi.fn();
    const stop = watchCurrentPosition(geo, position, error);
    const sample = (accuracy: number) =>
      ({
        coords: { latitude: 48.1, longitude: -1.67, accuracy },
      }) as GeolocationPosition;
    success(sample(12));
    success(sample(250));
    expect(position.mock.calls.map((c) => c[0].accuracy)).toEqual([12, 250]);
    failure({ code: 2 } as GeolocationPositionError);
    success(sample(10));
    expect(position).toHaveBeenCalledTimes(3);
    stop();
    stop();
    success(sample(5));
    expect(position).toHaveBeenCalledTimes(3);
    expect(geo.clearWatch).toHaveBeenCalledExactlyOnceWith(7);
    expect(geo.watchPosition.mock.calls[0][2]).toMatchObject({
      enableHighAccuracy: true,
    });
  });
  it("cleans up even a synchronous permission refusal and handles missing GPS", () => {
    const geo = {
      watchPosition: vi.fn(
        (_ok: PositionCallback, fail: PositionErrorCallback) => {
          fail({ code: 1 } as GeolocationPositionError);
          return 9;
        },
      ),
      clearWatch: vi.fn(),
    };
    const error = vi.fn();
    watchCurrentPosition(geo, vi.fn(), error)();
    expect(geo.clearWatch).toHaveBeenCalledExactlyOnceWith(9);
    expect(error.mock.calls[0][0].code).toBe(1);
    watchCurrentPosition(undefined, vi.fn(), error)();
    expect(error.mock.calls[1][0].code).toBe(2);
  });
});

import {
  collectGPS,
  emptyTracker,
  emptyCollection,
  collectionStats,
  finishCollection,
  remainingHouses,
} from "../lib/collection";
describe("free collection GPS and persistence", () => {
  const now = +new Date("2026-10-31T18:30Z"),
    first = saved.result.stops[0],
    second = {
      ...first,
      house: {
        ...first.house,
        id: "10000000-0000-4000-8000-000000000002",
        longitude: -1.668,
      },
    };
  const fix = (timestamp: number, longitude = -1.668, accuracy = 8) => ({
    point: [longitude, 48.1] as [number, number],
    accuracy,
    timestamp,
  });
  it("visits any selected house after three accurate positions over six seconds, without duplicates", () => {
    let tracker = emptyTracker(),
      visited: string[] = [];
    for (const delta of [0, 3000, 6000]) {
      const next = collectGPS(
        tracker,
        fix(now + delta),
        [first, second],
        visited,
        now + delta,
      );
      tracker = next.tracker;
      visited = next.visitedIds;
      if (delta < 6000) expect(visited).toEqual([]);
    }
    expect(visited).toEqual([second.house.id]);
    expect(remainingHouses([first, second], visited)).toEqual([first]);
    expect(
      collectGPS(tracker, fix(now + 9000), [first, second], visited, now + 9000)
        .visitedIds,
    ).toEqual(visited);
  });
  it("ignores inaccurate, duplicate, stale and jumping fixes and never bridges a background gap", () => {
    const initial = collectGPS(
      emptyTracker(),
      fix(now),
      [first, second],
      [],
      now,
    );
    expect(
      collectGPS(
        initial.tracker,
        fix(now + 3000, -1.668, 100),
        [first, second],
        [],
        now + 3000,
      ),
    ).toMatchObject({ accepted: false, distanceDelta: 0, visitedIds: [] });
    expect(collectGPS(initial.tracker, fix(now), [], [], now).accepted).toBe(
      false,
    );
    expect(
      collectGPS(initial.tracker, fix(now + 1000, 10), [], [], now + 1000),
    ).toMatchObject({ accepted: false, distanceDelta: 0 });
    expect(
      collectGPS(initial.tracker, fix(now + 3000), [], [], now + 30000)
        .accepted,
    ).toBe(false);
    expect(
      collectGPS(
        initial.tracker,
        fix(now + 70000, -1.67),
        [first, second],
        [],
        now + 70000,
      ),
    ).toMatchObject({ distanceDelta: 0, visitedIds: [] });
  });
  it("accumulates observed walking distance only and freezes the real duration and aggregate statistics", () => {
    const initial = collectGPS(emptyTracker(), fix(now, -1.67), [], [], now),
      next = collectGPS(
        initial.tracker,
        fix(now + 10000, -1.6698),
        [],
        [],
        now + 10000,
      );
    expect(next.distanceDelta).toBeGreaterThan(10);
    expect(next.distanceDelta).toBeLessThan(20);
    const collection = finishCollection(
      {
        ...emptyCollection(),
        startedAt: new Date(now).toISOString(),
        distanceMeters: next.distanceDelta,
        visitedIds: [second.house.id],
      },
      now + 72000,
    );
    expect(collectionStats(collection, 2, now + 999999)).toMatchObject({
      selected: 2,
      visited: 1,
      completion: 50,
      durationSeconds: 72,
      distanceMeters: next.distanceDelta,
    });
    expect(finishCollection(collection, now + 999999)).toEqual(collection);
  });
  it("restores saved, active and finished collections; legacy routes require confirmation and no GPS trace is persisted", () => {
    expect(
      restoreRoute(JSON.stringify({ ...saved, format: 1 }), identity, now)
        ?.phase,
    ).toBe("calculated");
    const active = {
      ...saved,
      phase: "active",
      collection: {
        startedAt: "2026-10-31T18:00:00Z",
        endedAt: null,
        distanceMeters: 22,
        visitedIds: [first.house.id],
      },
      result: { ...saved.result, geometry: [] },
    };
    expect(restoreRoute(JSON.stringify(active), identity, now)).toMatchObject({
      phase: "active",
      collection: active.collection,
    });
    expect(
      restoreRoute(
        JSON.stringify(active),
        identity,
        +new Date("2026-10-31T21:00Z"),
      ),
    ).toMatchObject({
      phase: "completed",
      collection: { distanceMeters: 22, endedAt: "2026-10-31T20:00:00.000Z" },
    });
    expect(Object.keys(active.collection).sort()).toEqual([
      "distanceMeters",
      "endedAt",
      "startedAt",
      "visitedIds",
    ]);
  });
});
