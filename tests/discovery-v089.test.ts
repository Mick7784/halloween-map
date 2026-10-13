import { afterEach, expect, it, vi } from "vitest";
import { createWalkingRouter } from "../lib/walking-router";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it("consultation requests distances from one source without creating an itinerary", async () => {
  vi.stubEnv("ORS_BASE_URL", "http://routing.test.invalid");
  vi.stubEnv("ORS_API_KEY", "");
  const fetcher = vi.fn(async (input: string | URL | Request, options?: RequestInit) => {
    const url = String(input);
    const request = JSON.parse(String(options?.body)) as {
      locations?: number[][];
      sources?: string[];
      destinations?: string[];
      metrics?: string[];
    };
    if (url.endsWith("/snap/foot-walking/json"))
      return Response.json({
        locations: (request.locations ?? []).map((location) => ({
          location,
          snapped_distance: 0,
        })),
      });
    if (url.endsWith("/matrix/foot-walking")) {
      expect(request.sources).toEqual(["0"]);
      expect(request.metrics).toEqual(["distance"]);
      return Response.json({ distances: [[0, 240, 690]] });
    }
    throw new Error("Directions must never be requested for discovery");
  });
  vi.stubGlobal("fetch", fetcher);
  const result = await createWalkingRouter().distancesFrom!(
    { latitude: 48.8, longitude: 2.8 },
    [
      { latitude: 48.81, longitude: 2.81 },
      { latitude: 48.82, longitude: 2.82 },
    ],
  );
  expect(result).toEqual([240, 690]);
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(fetcher.mock.calls.every(([input]) => !String(input).includes("/directions/"))).toBe(true);
});

it("empty discovery requests no external routing", async () => {
  vi.stubEnv("ORS_BASE_URL", "http://routing.test.invalid");
  vi.stubEnv("ORS_API_KEY", "");
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  expect(await createWalkingRouter().distancesFrom!(
    { latitude: 48.8, longitude: 2.8 }, [],
  )).toEqual([]);
  expect(fetcher).not.toHaveBeenCalled();
});
