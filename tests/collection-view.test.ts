import { describe, expect, it } from "vitest";
import {
  acceptsFear,
  nearestHouse,
  removeUnvisitedHouse,
  selectableHouses,
} from "../lib/collection-view";
import type { RouteResult } from "../lib/routing";
const now = Date.now();
const house = (
  id: string,
  longitude = 2.8,
): RouteResult["stops"][number]["house"] => ({
  id,
  name: id,
  address: "Rue",
  latitude: 48.8,
  longitude,
  activities: ["CANDY"],
  fear: 3,
  adaptable: false,
  rp: "",
  practical: "",
  starts_at: new Date(now - 3600000).toISOString(),
  ends_at: new Date(now + 3600000).toISOString(),
});
const stop = (id: string, longitude = 2.8) => ({
  house: house(id, longitude),
  arrival: new Date(now).toISOString(),
  departure: new Date(now + 300000).toISOString(),
  walkingMinutes: 0,
  walkingSeconds: 0,
  distanceMeters: 0,
});
const fix = {
  point: [2.8, 48.8] as [number, number],
  accuracy: 8,
  timestamp: now,
};
describe("mobile free collection selection", () => {
  it("includes all lower fear levels and adaptable houses, respecting hours and effective activities", () => {
    for (let maximum = 1; maximum <= 5; maximum++) {
      for (let fear = 1; fear <= 5; fear++)
        expect(acceptsFear({ ...house("h"), fear }, maximum)).toBe(
          fear <= maximum,
        );
      expect(
        acceptsFear({ ...house("h"), fear: null, adaptable: true }, maximum),
      ).toBe(true);
    }
    const expired = { ...house("ended"), ends_at: new Date(now).toISOString() };
    const depleted = {
      ...house("depleted"),
      activities: ["DECORATION"] as const,
    };
    expect(
      selectableHouses(
        [
          house("open"),
          expired,
          { ...depleted, activities: [...depleted.activities] },
        ],
        3,
        ["CANDY"],
        now,
        now + 600000,
      ).map((h) => h.id),
    ).toEqual(["open"]);
  });
  it("requires a fresh accurate finite GPS position and excludes visited or unavailable houses", () => {
    const stops = [stop("nearest"), stop("other", 2.802)];
    expect(nearestHouse(stops, [], fix, null, now)).toBe("nearest");
    for (const invalid of [
      { ...fix, accuracy: 21 },
      { ...fix, timestamp: now - 15001 },
      { ...fix, timestamp: now + 5001 },
      { ...fix, point: [NaN, 48.8] as [number, number] },
    ])
      expect(nearestHouse(stops, [], invalid, null, now)).toBeNull();
    expect(nearestHouse(stops, ["nearest"], fix, null, now)).toBe("other");
    expect(
      nearestHouse(
        stops.map((s) => ({ ...s, unavailable: true })),
        [],
        fix,
        null,
        now,
      ),
    ).toBeNull();
    expect(
      nearestHouse(
        [
          {
            ...stops[0],
            house: { ...stops[0].house, ends_at: new Date(now).toISOString() },
          },
        ],
        [],
        fix,
        null,
        now,
      ),
    ).toBeNull();
  });
  it("stabilizes the highlight against GPS noise but changes for a decisively closer house", () => {
    expect(
      nearestHouse(
        [stop("best"), stop("retained", 2.8001)],
        [],
        fix,
        "retained",
        now,
      ),
    ).toBe("retained");
    expect(
      nearestHouse(
        [stop("best"), stop("retained", 2.801)],
        [],
        fix,
        "retained",
        now,
      ),
    ).toBe("best");
  });
  it("can empty the selection without erasing visited houses or retaining a route line", () => {
    const result = {
      stops: [stop("only")],
      geometry: [[2.8, 48.8]],
    } as RouteResult;
    expect(removeUnvisitedHouse(result, ["only"], "only")).toBe(result);
    expect(removeUnvisitedHouse(result, [], "only")).toMatchObject({
      stops: [],
      geometry: [],
    });
  });
});
