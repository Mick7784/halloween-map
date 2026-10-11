import { expect, it, vi } from "vitest";
import { prepareSelection } from "../lib/house-selection";
import type { House, Season } from "../lib/domain";
const now = new Date("2026-10-31T18:00:00Z");
const season = {
  active: true,
  opens_at: "2026-10-31T17:00Z",
  closes_at: "2026-10-31T22:00Z",
  archived: false,
  purged_at: null,
} as Season;
const input = {
  start: now.toISOString(),
  end: "2026-10-31T20:00:00Z",
  origin: { latitude: 48.1, longitude: -1.67 },
  activities: [],
};
const house = (id: string, extra: Partial<House> = {}) =>
  ({
    id,
    name: id,
    address: "Adresse",
    latitude: 48.1,
    longitude: -1.67,
    status: "VISIBLE",
    review_status: "VALIDATED",
    activity: "ACTIVE",
    activities: ["CANDY"],
    candy_available: true,
    starts_at: "2026-10-31T17:00Z",
    ends_at: "2026-10-31T22:00Z",
    fear: 2,
    adaptable: false,
    rp: "",
    practical: "",
    ...extra,
  }) as House;
it("preserves supplied order regardless of location, makes no network requests, and limits to thirty houses", () => {
  const fetch = vi.fn(() => {
    throw new Error("Aucun fournisseur autorisé");
  });
  vi.stubGlobal("fetch", fetch);
  try {
    const houses = Array.from({ length: 35 }, (_, n) =>
      house(String(35 - n), { latitude: n % 2 ? -48 : 48 }),
    );
    const result = prepareSelection(houses, season, input, now);
    expect(result.stops.map((s) => s.house.id)).toEqual(
      houses.slice(0, 30).map((h) => h.id),
    );
    expect(result).toMatchObject({
      geometry: [],
      distanceMeters: 0,
      walkingMinutes: 0,
      walkingSeconds: 0,
      durationMinutes: 0,
      estimatedEnd: input.start,
    });
    expect(fetch).not.toHaveBeenCalled();
  } finally {
    vi.unstubAllGlobals();
  }
});
it("checks filters and schedule overlap independently without a minimum visit or travel time", () => {
  const houses = [
    house("short", { ends_at: "2026-10-31T18:00:01Z" }),
    house("future", { starts_at: input.end }),
    house("expired", { ends_at: input.start }),
    house("paused", { activity: "PAUSED" }),
    house("hidden", { status: "HIDDEN" }),
    house("review", { review_status: "PENDING" }),
    house("empty", { candy_available: false }),
    house("scary", { fear: 5 }),
    house("adapted", { fear: 5, adaptable: true }),
  ];
  expect(
    prepareSelection(houses, season, { ...input, maxFear: 2 }, now).stops.map(
      (s) => s.house.id,
    ),
  ).toEqual(["short", "adapted"]);
  expect(
    prepareSelection(
      houses,
      season,
      { ...input, activities: ["DECORATION"] },
      now,
    ).stops,
  ).toEqual([]);
});
