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
  format: 1,
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
      { ...saved, format: 2 },
      { ...saved, expiresAt: "2026-10-31T18:00:00Z" },
      { ...saved, ownerId: "other" },
      { ...saved, seasonId: "00000000-0000-4000-8000-000000000000" },
      { ...saved, result: { ...saved.result, geometry: [[null, null]] } },
    ])
      expect(restoreRoute(JSON.stringify(value), identity, now)).toBeNull();
    expect(restoreRoute("broken", identity, now)).toBeNull();
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
