// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, createElement, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import useActiveRoute from "../components/useActiveRoute";
import {
  ACTIVE_ROUTE_KEY,
  restoreRoute,
  type StoredRoute,
} from "../lib/active-route";
import { emptyCollection } from "../lib/collection";
const fixtures = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("../components/common", () => ({ api: fixtures.api }));
const identity = {
  ownerId: "visitor",
  instanceId: "20000000-0000-4000-8000-000000000001",
  seasonId: "30000000-0000-4000-8000-000000000001",
};
const now = +new Date("2026-10-31T18:00:00Z");
const iso = (seconds: number) => new Date(now + seconds * 1000).toISOString();
function house(n: number) {
  return {
    id: `10000000-0000-4000-8000-00000000000${n}`,
    name: `Maison ${n}`,
    address: "Rue",
    latitude: 48.8,
    longitude: 2.8 + n * 0.002,
    activities: ["CANDY" as const],
    fear: 2,
    adaptable: false,
    starts_at: iso(-3600),
    ends_at: iso(7200),
    rp: "",
    practical: "",
  };
}
function saved(): StoredRoute {
  return {
    ...identity,
    format: 2,
    phase: "active",
    collectionId: "40000000-0000-4000-8000-000000000001",
    collection: { ...emptyCollection(), startedAt: iso(0) },
    parameters: {
      origin: { latitude: 48.8, longitude: 2.8 },
      start: iso(0),
      end: iso(3600),
      activities: [],
      maxFear: 3,
      excludedHouseIds: [],
      acceptance: {
        mode: "GUIDELINES_ONLY",
        guidelines: true,
        guidelines_version: "2026.1",
      },
    },
    result: {
      stops: [1, 2].map((n) => ({
        house: house(n),
        arrival: iso(300 * n),
        departure: iso(300 * n + 300),
        walkingMinutes: 2,
        walkingSeconds: 120,
        distanceMeters: 100,
      })),
      geometry: [],
      distanceMeters: 200,
      walkingMinutes: 4,
      walkingSeconds: 240,
      durationMinutes: 10,
      estimatedEnd: iso(900),
      disclaimer: "Estimation",
    },
    createdAt: iso(0),
    updatedAt: iso(0),
    expiresAt: iso(3600),
    sheet: "collapsed",
    camera: null,
  };
}
let controller: ReturnType<typeof useActiveRoute>,
  root: Root,
  host: HTMLDivElement,
  success: PositionCallback;
let available = true;
function Harness() {
  const value = useActiveRoute({ ...identity, closesAt: iso(7200) });
  useEffect(() => {
    controller = value;
  }, [value]);
  return null;
}
async function mount(value = saved()) {
  localStorage.setItem(ACTIVE_ROUTE_KEY, JSON.stringify(value));
  await act(async () => root.render(createElement(Harness)));
}
async function emit(seconds: number, n = 1, accuracy = 8) {
  vi.setSystemTime(now + seconds * 1000);
  await act(async () =>
    success({
      timestamp: Date.now(),
      coords: { latitude: 48.8, longitude: house(n).longitude, accuracy },
    } as GeolocationPosition),
  );
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
  available = true;
  Object.defineProperty(document, "visibilityState", {
    value: "visible",
    configurable: true,
  });
  Object.defineProperty(navigator, "geolocation", {
    value: {
      watchPosition: (ok: PositionCallback) => {
        success = ok;
        return 1;
      },
      clearWatch: vi.fn(),
    },
    configurable: true,
  });
  fixtures.api.mockImplementation(
    async (_endpoint: string, input: { steps: { id: string }[] }) => ({
      valid: true,
      checkedAt: new Date().toISOString(),
      steps: input.steps.map((s) => ({
        id: s.id,
        available,
        house: house(Number(s.id.at(-1))),
        activities: ["CANDY"],
      })),
    }),
  );
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
it("requires consecutive reliable fixes for the halo, records visits once and leaves stopping to the visitor", async () => {
  await mount();
  expect(controller.verified).toBe(true);
  await emit(0);
  expect(controller.nearestHouseId).toBeNull();
  await emit(3);
  expect(controller.nearestHouseId).toBe(house(1).id);
  await emit(6);
  expect(controller.collection.visitedIds).toEqual([house(1).id]);
  expect(controller.collection.gpsObservedSeconds).toBe(6);
  await act(async () => controller.markVisited(house(2).id));
  expect(controller.collection.visitedIds).toHaveLength(2);
  expect(controller.phase).toBe("active");
  expect(controller.finishSuggested).toBe(true);
  await act(async () => controller.stopActiveRoute());
  expect(controller.phase).toBe("completed");
});
it("adds through session-scoped availability, preserves visits, and persists even an empty selection", async () => {
  await mount();
  await act(async () => controller.markVisited(house(1).id));
  await act(async () => controller.removeHouse(house(1).id));
  expect(controller.result!.stops).toHaveLength(2);
  await act(async () => controller.addHouse(house(3)));
  expect(controller.result!.stops).toHaveLength(3);
  expect(fixtures.api.mock.lastCall?.[1]).toMatchObject({
    instanceId: identity.instanceId,
    seasonId: identity.seasonId,
    mode: "COLLECTION",
  });
  expect(controller.collection.visitedIds).toEqual([house(1).id]);
  await act(async () => root.unmount());
  root = createRoot(host);
  await mount();
  await act(async () => controller.removeHouse(house(1).id));
  await act(async () => controller.removeHouse(house(2).id));
  expect(controller.result!.stops).toHaveLength(0);
  expect(controller.phase).toBe("active");
  expect(
    restoreRoute(localStorage.getItem(ACTIVE_ROUTE_KEY), identity, now)?.result
      .stops,
  ).toHaveLength(0);
  await act(async () => controller.addHouse(house(3)));
  expect(controller.result!.stops).toHaveLength(1);
});
it("refreshes BO availability without erasing visits or stopping, and rejects additions that became unavailable", async () => {
  await mount();
  await act(async () => controller.markVisited(house(1).id));
  available = false;
  await act(async () => controller.checkAvailability());
  expect(controller.result!.stops.every((s) => s.unavailable)).toBe(true);
  expect(controller.collection.visitedIds).toEqual([house(1).id]);
  expect(controller.phase).toBe("active");
  await expect(act(async () => controller.addHouse(house(3)))).rejects.toThrow(
    "plus disponible",
  );
  await emit(0, 2);
  await emit(3, 2);
  await emit(6, 2);
  expect(controller.collection.visitedIds).toEqual([house(1).id]);
});
it("keeps expired collections recoverable but blocks further automatic and manual visits", async () => {
  await mount();
  vi.setSystemTime(now + 3601000);
  await act(async () => controller.checkAvailability());
  expect(controller.phase).toBe("active");
  expect(controller.verified).toBe(false);
  await emit(3602);
  await emit(3605);
  await emit(3608);
  await act(async () => controller.markVisited(house(1).id));
  expect(controller.collection.visitedIds).toEqual([]);
  expect(
    restoreRoute(localStorage.getItem(ACTIVE_ROUTE_KEY), identity, Date.now())
      ?.phase,
  ).toBe("active");
});
it("clears the halo on inaccurate samples and does not count overlapping stationary intervals twice", async () => {
  await mount();
  await emit(0);
  await emit(3);
  await emit(6);
  expect(controller.collection.gpsObservedSeconds).toBe(6);
  await emit(9, 1, 80);
  expect(controller.nearestHouseId).toBeNull();
  expect(controller.collection.distancePartial).toBe(true);
  await emit(12, 2);
  expect(controller.nearestHouseId).toBeNull();
  await emit(15, 2);
  expect(controller.nearestHouseId).toBe(house(2).id);
});
