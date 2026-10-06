import { afterEach, describe, expect, it, vi } from "vitest";
import { planRoute } from "../lib/routing";
import {
  createWalkingRouter,
  RoutingError,
  type WalkingRouter,
} from "../lib/walking-router";
import { locateOrigin } from "../lib/geolocation";
import { routeIsCurrent } from "../lib/route-state";
import { publicHouse, type House, type Season } from "../lib/domain";
import { frameRoute } from "../lib/map-framing";
const season = {
  activated: true,
  opens_at: "2026-10-31T17:00Z",
  closes_at: "2026-10-31T22:00Z",
  archived: false,
  purged_at: null,
} as Season;
const house = (id: string, latitude = 48.1): House =>
  ({
    id,
    name: id,
    address: "adresse",
    latitude,
    longitude: -1.67,
    activities: ["CANDY"],
    candy_available: true,
    status: "VISIBLE",
    activity: "ACTIVE",
    starts_at: "2026-10-31T17:00Z",
    ends_at: "2026-10-31T22:00Z",
    fear: 2,
    adaptable: false,
    rp: "",
    practical: "",
  }) as House;
const input = {
  start: "2026-10-31T18:00Z",
  end: "2026-10-31T21:00Z",
  origin: { latitude: 48.1, longitude: -1.67 },
  activities: [],
};
const now = new Date(input.start);
const cost = (distanceMeters: number, durationSeconds: number) => ({
  distanceMeters,
  durationSeconds,
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
describe("walking plan", () => {
  it("orders by pedestrian costs, skips disconnected houses, and keeps provider geometry and final metrics", async () => {
    const a = house("a", 48.10001),
      b = house("b", 48.11),
      c = house("c", 48.10002);
    const geometry = [
      [-1.67, 48.1],
      [-1.68, 48.105],
      [-1.67, 48.11],
      [-1.66, 48.1],
    ];
    const router: WalkingRouter = {
      matrix: vi.fn(async () => [
        [cost(0, 0), cost(1500, 1200), cost(500, 300), null],
        [cost(1500, 1200), cost(0, 0), cost(400, 240), null],
        [cost(500, 300), cost(600, 360), cost(0, 0), null],
        [null, null, null, cost(0, 0)],
      ]),
      directions: vi.fn(async () => ({
        geometry,
        legs: [cost(510, 310), cost(620, 370)],
      })),
    };
    const r = await planRoute([a, b, c], season, input, now, router);
    expect(r.stops.map((s) => s.house.id)).toEqual(["b", "a"]);
    expect(router.directions).toHaveBeenCalledWith([input.origin, b, a]);
    expect(r.geometry).toEqual(geometry);
    expect(r.distanceMeters).toBe(1130);
    expect(r.walkingSeconds).toBe(680);
    expect(r.durationMinutes).toBe(22);
    expect(r.stops[0]).toMatchObject({
      distanceMeters: 510,
      walkingSeconds: 310,
      arrival: "2026-10-31T18:05:10.000Z",
      departure: "2026-10-31T18:10:10.000Z",
    });
    expect(r.estimatedEnd).toBe("2026-10-31T18:21:20.000Z");
    expect(r.disclaimer).not.toContain("vol d’oiseau");
    expect(routeIsCurrent(r, [a, b].map(publicHouse), +now)).toBe(true);
    expect(routeIsCurrent(r, [a].map(publicHouse), +now)).toBe(false);
    expect(
      routeIsCurrent(r, [a, { ...b, longitude: -1.8 }].map(publicHouse), +now),
    ).toBe(false);
    expect(
      routeIsCurrent(r, [a, { ...b, activities: [] }].map(publicHouse), +now),
    ).toBe(false);
  });
  it("waits for future opening, visits for five minutes, and rejects closing before departure", async () => {
    const router: WalkingRouter = {
      matrix: async () => [
        [cost(0, 0), cost(500, 300)],
        [cost(500, 300), cost(0, 0)],
      ],
      directions: async () => ({
        geometry: [
          [-1.67, 48.1],
          [-1.68, 48.11],
        ],
        legs: [cost(500, 300)],
      }),
    };
    const h = {
      ...house("later"),
      starts_at: "2026-10-31T19:00Z",
      ends_at: "2026-10-31T19:05Z",
    };
    const r = await planRoute([h], season, input, now, router);
    expect(r.durationMinutes).toBe(65);
    expect(r.walkingMinutes).toBe(5);
    expect(r.stops[0].departure).toBe("2026-10-31T19:05:00.000Z");
    expect(
      (
        await planRoute(
          [{ ...h, ends_at: "2026-10-31T19:04Z" }],
          season,
          input,
          now,
          router,
        )
      ).geometry,
    ).toEqual([]);
  });
  it("reroutes and recomputes the whole schedule if final directions make a stop infeasible", async () => {
    const a = { ...house("a"), ends_at: "2026-10-31T18:06Z" },
      b = house("b");
    const directions = vi
      .fn()
      .mockResolvedValueOnce({
        geometry: [
          [0, 0],
          [1, 1],
        ],
        legs: [cost(500, 180), cost(500, 180)],
      })
      .mockResolvedValueOnce({
        geometry: [
          [0, 0],
          [0.5, 0.6],
          [2, 2],
        ],
        legs: [cost(700, 240)],
      });
    const r = await planRoute([a, b], season, input, now, {
      matrix: async () =>
        Array.from({ length: 3 }, () =>
          Array.from({ length: 3 }, () => cost(100, 30)),
        ),
      directions,
    });
    expect(r.stops.map((s) => s.house.id)).toEqual(["b"]);
    expect(r.distanceMeters).toBe(700);
    expect(r.durationMinutes).toBe(9);
    expect(directions).toHaveBeenCalledTimes(2);
  });
  it("never creates a straight-line fallback on provider failure or disconnected graph", async () => {
    const directions = vi.fn();
    const r = await planRoute([house("a")], season, input, now, {
      matrix: async () => [
        [cost(0, 0), null],
        [null, cost(0, 0)],
      ],
      directions,
    });
    expect(r.stops).toEqual([]);
    expect(r.geometry).toEqual([]);
    expect(directions).not.toHaveBeenCalled();
    await expect(
      planRoute([house("a")], season, input, now, {
        matrix: async () => {
          throw new RoutingError("timeout");
        },
        directions,
      }),
    ).rejects.toThrow("trop de temps");
  });
  it("caps visits at thirty without an individual network request for every candidate", async () => {
    const matrix = vi.fn(async (points) =>
      points.map(() => points.map(() => cost(1, 1))),
    );
    const directions = vi.fn(async (points) => ({
      geometry: [
        [0, 0],
        [0.1, 0.1],
      ],
      legs: points.slice(1).map(() => cost(1, 1)),
    }));
    const r = await planRoute(
      Array.from({ length: 40 }, (_, i) => house(String(i))),
      season,
      { ...input, end: "2026-10-31T22:00Z" },
      now,
      { matrix, directions },
    );
    expect(r.stops).toHaveLength(30);
    expect(matrix).toHaveBeenCalledTimes(1);
    expect(directions).toHaveBeenCalledTimes(1);
  });
});
describe("ORS server adapter", () => {
  it("forces foot-walking, batches both metrics, and excludes unsnappable points", async () => {
    vi.stubEnv("ORS_API_KEY", "test-key");
    vi.stubEnv("ORS_BASE_URL", "https://api.heigit.org/openrouteservice");
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          locations: [
            { location: [-1.67, 48.1], snapped_distance: 2 },
            null,
            { location: [-1.66, 48.11], snapped_distance: 1 },
          ],
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          distances: [
            [0, 800],
            [900, 0],
          ],
          durations: [
            [0, 600],
            [700, 0],
          ],
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          features: [
            {
              geometry: {
                type: "LineString",
                coordinates: [
                  [-1.67, 48.1],
                  [-1.665, 48.105],
                  [-1.66, 48.11],
                ],
              },
              properties: { segments: [{ distance: 800, duration: 600 }] },
            },
          ],
        }),
      );
    vi.stubGlobal("fetch", fetcher);
    const router = createWalkingRouter();
    const matrix = await router.matrix([
      input.origin,
      house("a"),
      house("b", 48.11),
    ]);
    expect(matrix[0][1]).toBeNull();
    expect(matrix[0][2]).toEqual(cost(800, 600));
    const route = await router.directions([input.origin, house("b", 48.11)]);
    expect(route.geometry).toHaveLength(3);
    expect(fetcher.mock.calls.map((c) => c[0])).toEqual([
      "https://api.heigit.org/openrouteservice/v2/snap/foot-walking/json",
      "https://api.heigit.org/openrouteservice/v2/matrix/foot-walking",
      "https://api.heigit.org/openrouteservice/v2/directions/foot-walking/geojson",
    ]);
    for (const [url, options] of fetcher.mock.calls) {
      expect(url).toContain("foot-walking");
      expect(options.headers.Authorization).toBe("test-key");
      expect(options.cache).toBe("no-store");
    }
    expect(JSON.parse(fetcher.mock.calls[1][1].body)).toMatchObject({
      metrics: ["distance", "duration"],
      units: "m",
    });
  });
  it("splits matrices above 50 nodes and maps asymmetric block results to original indexes", async () => {
    vi.stubEnv("ORS_API_KEY", "test-key");
    const fetcher = vi.fn(async (url: string, options: RequestInit) => {
      const body = JSON.parse(options.body as string);
      if (url.includes("snap"))
        return Response.json({
          locations: body.locations.map((p: number[]) => ({
            location: p,
            snapped_distance: 0,
          })),
        });
      return Response.json({
        distances: body.sources.map((a: string) =>
          body.destinations.map(
            (b: string) => body.locations[+a][0] * 100 + body.locations[+b][0],
          ),
        ),
        durations: body.sources.map(() => body.destinations.map(() => 60)),
      });
    });
    vi.stubGlobal("fetch", fetcher);
    const r = await createWalkingRouter().matrix(
      Array.from({ length: 51 }, (_, i) => ({ longitude: i, latitude: 48 })),
    );
    expect(fetcher).toHaveBeenCalledTimes(5);
    expect(r[50][2]?.distanceMeters).toBe(5002);
    expect(r[2][50]?.distanceMeters).toBe(250);
  });
  it.each(["bad-json", "bad-dimensions", "negative", "http-error", "timeout"])(
    "rejects %s without raw errors or fallback",
    async (kind) => {
      vi.stubEnv("ORS_API_KEY", "test-key");
      const validSnap = Response.json({
        locations: [
          { location: [-1.67, 48.1], snapped_distance: 0 },
          { location: [-1.67, 48.11], snapped_distance: 0 },
        ],
      });
      const fetcher = vi.fn().mockResolvedValueOnce(validSnap);
      if (kind === "timeout")
        fetcher.mockRejectedValueOnce(
          new DOMException("technical", "TimeoutError"),
        );
      else
        fetcher.mockResolvedValueOnce(
          kind === "bad-json"
            ? new Response("bad")
            : kind === "http-error"
              ? Response.json(
                  { error: { code: 6000, message: "secret details" } },
                  { status: 503 },
                )
              : Response.json({
                  distances:
                    kind === "negative"
                      ? [
                          [-1, 0],
                          [0, 0],
                        ]
                      : [[0]],
                  durations: [
                    [0, 0],
                    [0, 0],
                  ],
                }),
        );
      vi.stubGlobal("fetch", fetcher);
      await expect(
        createWalkingRouter().matrix([input.origin, house("a")]),
      ).rejects.toBeInstanceOf(RoutingError);
    },
  );
  it("requires a server key for hosted routing", () => {
    vi.stubEnv("ORS_API_KEY", "");
    vi.stubEnv("ORS_BASE_URL", "https://api.openrouteservice.org");
    expect(() => createWalkingRouter()).toThrow("configuré");
  });
});
describe("location and framing", () => {
  it("keeps lng/lat and accuracy and asks for a fresh precise position", async () => {
    const getCurrentPosition = vi.fn<Geolocation["getCurrentPosition"]>(
      (success) =>
        success({
          coords: { longitude: -1.67, latitude: 48.1, accuracy: 12 },
        } as GeolocationPosition),
    );
    expect(await locateOrigin({ getCurrentPosition })).toEqual({
      point: [-1.67, 48.1],
      accuracy: 12,
    });
    expect(getCurrentPosition.mock.calls[0][2]).toEqual({
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0,
    });
  });
  it.each([1, 2, 3])("handles geolocation failure %s", async (code) => {
    await expect(
      locateOrigin({
        getCurrentPosition: (_ok, fail) =>
          fail!({ code } as GeolocationPositionError),
      }),
    ).rejects.toThrow(
      code === 1 ? "refusée" : code === 2 ? "indisponible" : "expiré",
    );
  });
  it("handles absent geolocation", async () => {
    await expect(locateOrigin(undefined)).rejects.toThrow("pas disponible");
  });
  it("frames departure, full geometry, and stops with mobile panel padding", () => {
    const map = {
      fitBounds: vi.fn(),
      getContainer: () =>
        ({
          clientHeight: 700,
          getBoundingClientRect: () => ({ height: 700, bottom: 700 }),
        }) as HTMLElement,
    };
    frameRoute(
      map,
      [
        [2, 48],
        [2.1, 48.1],
      ],
      [1.9, 48.05],
      [{ longitude: 2.2, latitude: 48.2 }],
      true,
      true,
      false,
      351,
    );
    expect(map.fitBounds).toHaveBeenCalledWith(
      [
        [1.9, 48],
        [2.2, 48.2],
      ],
      expect.objectContaining({
        maxZoom: 16,
        absolutePadding: true,
        padding: expect.objectContaining({ bottom: 384 }),
      }),
    );
    frameRoute(
      map,
      [
        [2, 48],
        [2.1, 48.1],
      ],
      undefined,
      [],
      false,
      false,
      true,
    );
    expect(map.fitBounds.mock.calls[1][1]).toMatchObject({
      duration: 0,
      padding: { bottom: 45 },
    });
  });
});

// Corrective demo discovery: seeds are never returned as house positions.
describe("V0.5.1 demo network discovery", () => {
  it("uses deterministic spaced snapped points and validates a connected itinerary", async () => {
    const { discoverTestPositions } =
      await import("../scripts/test-profile-positions");
    const points = Array.from({ length: 5 }, (_, n) => ({
      latitude: 48.1 + n * 0.001,
      longitude: -1.67,
    }));
    const snap = vi.fn<NonNullable<WalkingRouter["snap"]>>(async () => [
      null,
      ...points,
      ...points,
    ]);
    const matrix = vi.fn(async () =>
      points.map(() => points.map(() => cost(150, 120))),
    );
    const directions = vi.fn(async (p: typeof points) => ({
      geometry: p.flatMap((q) => [
        [q.longitude, q.latitude],
        [q.longitude + 0.0001, q.latitude + 0.0001],
      ]),
      legs: p.slice(1).map(() => cost(150, 120)),
    }));
    const instance = {
      latitude: 48.1,
      longitude: -1.67,
    } as import("../lib/domain").Instance;
    const router = { snap, matrix, directions };
    expect(await discoverTestPositions(instance, router)).toEqual(points);
    expect(await discoverTestPositions(instance, router)).toEqual(points);
    expect(snap.mock.calls[0][1]).toBe(300);
    expect(matrix).toHaveBeenCalledWith(points);
    expect(directions).toHaveBeenCalledWith(points);
  });
  it("rejects insufficient, disconnected and unroutable points without fallback", async () => {
    const { discoverTestPositions } =
      await import("../scripts/test-profile-positions");
    const points = Array.from({ length: 5 }, (_, n) => ({
      latitude: 48.1 + n * 0.001,
      longitude: -1.67,
    }));
    const instance = {
      latitude: 48.1,
      longitude: -1.67,
    } as import("../lib/domain").Instance;
    const directions = vi.fn(async () => {
      throw new RoutingError("no_route");
    });
    const router: WalkingRouter = {
      snap: async () => points,
      matrix: async () => points.map(() => points.map(() => null)),
      directions,
    };
    await expect(discoverTestPositions(instance, router)).rejects.toMatchObject(
      {
        reason: "no_route",
      },
    );
    expect(directions).not.toHaveBeenCalled();
    router.matrix = async () =>
      points.map(() => points.map(() => cost(150, 120)));
    await expect(discoverTestPositions(instance, router)).rejects.toMatchObject(
      {
        reason: "no_route",
      },
    );
    router.snap = async () => [points[0], points[0]];
    await expect(discoverTestPositions(instance, router)).rejects.toMatchObject(
      {
        reason: "no_route",
      },
    );
  });
  it("accepts the requested corrective release and increments dotted patches", async () => {
    const { nextVersion } = await import("../scripts/version.mjs");
    expect(nextVersion("V0.5", "V0.5.1")).toBe("V0.5.1");
    expect(nextVersion("V0.5.1")).toBe("V0.5.2");
  });
});

it("logs ignored Snap entries without key or raw response", async () => {
  vi.stubEnv("ORS_API_KEY", "never-print-key");
  vi.stubEnv("ORS_BASE_URL", "https://api.heigit.org/openrouteservice");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({
        locations: [
          {
            location: [-1.67, 48.1],
            snapped_distance: "invalid",
            secret: "never-print-body",
          },
        ],
      }),
    ),
  );
  const warning = vi.spyOn(console, "info").mockImplementation(() => {});
  await expect(createWalkingRouter().snap!([input.origin])).resolves.toEqual([
    null,
  ]);
  expect(warning).toHaveBeenCalledWith("Walking snap entries ignored", {
    endpoint: "snap/foot-walking/json",
    entries: [{ index: 0, fields: ["snapped_distance"] }],
  });
  expect(JSON.stringify(warning.mock.calls)).not.toMatch(/never-print/);
});

describe("V0.5.2 independent Snap entries", () => {
  const points = Array.from({ length: 7 }, (_, n) => ({
    latitude: 48.1 + n * 0.001,
    longitude: -1.67,
  }));
  const locations = points.map((p, n) => ({
    location: [p.longitude, p.latitude],
    snapped_distance: n === 2 ? null : n === 3 ? "invalid" : 0,
  }));
  it("keeps all valid entries when two snapped distances are invalid", async () => {
    vi.stubEnv("ORS_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ locations })),
    );
    const result = await createWalkingRouter().snap!(points);
    expect(result).toEqual(
      points.map((p, n) => (n === 2 || n === 3 ? null : p)),
    );
  });
  it.each([undefined, null, -1, "invalid"])(
    "ignores missing or invalid distance %s",
    async (distance) => {
      vi.stubEnv("ORS_API_KEY", "test-key");
      vi.stubGlobal(
        "fetch",
        vi.fn(async () =>
          Response.json({
            locations: [
              { location: [-1.67, 48.1], snapped_distance: distance },
            ],
          }),
        ),
      );
      expect(await createWalkingRouter().snap!([input.origin])).toEqual([null]);
    },
  );
  it.each([
    {},
    { locations: null },
    { locations: [] },
    { locations: "invalid" },
  ])("rejects malformed global structure %j", async (body) => {
    vi.stubEnv("ORS_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json(body)),
    );
    await expect(
      createWalkingRouter().snap!([input.origin]),
    ).rejects.toMatchObject({ reason: "invalid" });
  });
  it("rejects an unsnappable origin before Matrix and invites another departure", async () => {
    vi.stubEnv("ORS_API_KEY", "test-key");
    const fetcher = vi.fn(async () =>
      Response.json({ locations: [locations[2], locations[1]] }),
    );
    vi.stubGlobal("fetch", fetcher);
    await expect(
      createWalkingRouter().matrix(points.slice(0, 2)),
    ).rejects.toMatchObject({
      reason: "no_route",
      message: expect.stringContaining("Choisissez un autre départ"),
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("excludes only invalid houses from the matrix, leaving all valid houses usable", async () => {
    vi.stubEnv("ORS_API_KEY", "test-key");
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ locations }))
      .mockResolvedValueOnce(
        Response.json({
          distances: Array.from({ length: 5 }, () => Array(5).fill(140)),
          durations: Array.from({ length: 5 }, () => Array(5).fill(120)),
        }),
      );
    vi.stubGlobal("fetch", fetcher);
    const matrix = await createWalkingRouter().matrix(points);
    expect(matrix[0].map((v) => v === null)).toEqual([
      false,
      false,
      true,
      true,
      false,
      false,
      false,
    ]);
    expect(JSON.parse(fetcher.mock.calls[1][1].body).locations).toHaveLength(5);
  });
  it("discovers five test profile points despite two invalid seeds and keeps provider street geometry", async () => {
    const { discoverTestPositions } =
      await import("../scripts/test-profile-positions");
    vi.stubEnv("ORS_API_KEY", "test-key");
    let geometry: number[][] = [];
    const fetcher = vi.fn(async (url: string, options: RequestInit) => {
      const body = JSON.parse(options.body as string);
      if (url.includes("snap"))
        return Response.json({
          locations: body.locations.map((location: number[], n: number) => ({
            location,
            snapped_distance:
              body.radius === 300 && n === 2
                ? null
                : body.radius === 300 && n === 3
                  ? "invalid"
                  : 0,
          })),
        });
      if (url.includes("matrix"))
        return Response.json({
          distances: body.sources.map(() => body.destinations.map(() => 150)),
          durations: body.sources.map(() => body.destinations.map(() => 120)),
        });
      expect(body).not.toHaveProperty("instructions");
      geometry = body.coordinates.flatMap((p: number[]) => [
        p,
        [p[0] + 0.0001, p[1] + 0.0001],
      ]);
      return Response.json({
        features: [
          {
            geometry: { type: "LineString", coordinates: geometry },
            properties: {
              segments: body.coordinates
                .slice(1)
                .map(() => ({ distance: 150, duration: 120 })),
            },
          },
        ],
      });
    });
    vi.stubGlobal("fetch", fetcher);
    const router = createWalkingRouter();
    const result = await discoverTestPositions(
      { latitude: 48.1, longitude: -1.67 } as import("../lib/domain").Instance,
      router,
    );
    expect(result).toHaveLength(5);
    expect(
      JSON.parse(fetcher.mock.calls[0][1].body as string).locations,
    ).toHaveLength(25);
    expect((await router.directions(result)).geometry).toEqual(geometry);
    expect(geometry).toHaveLength(10);
    const finalRoute = await planRoute(
      result.map((point, n) => ({ ...house(`10000000-0000-4000-8000-00000000000${n}`), ...point })),
      season,
      input,
      now,
      router,
    );
    expect(finalRoute.stops).toHaveLength(5);
    expect(finalRoute.distanceMeters).toBe(750);
    expect(finalRoute.walkingSeconds).toBe(600);
    expect(finalRoute.walkingMinutes).toBe(10);
    expect(finalRoute.durationMinutes).toBe(35);
    expect(finalRoute.geometry).toEqual(geometry);
    expect(
      fetcher.mock.calls.every(([url]) => url.includes("foot-walking")),
    ).toBe(true);
  });
});

describe("V0.5.3 ORS Directions default instructions", () => {
  it("requests default segments for multiple waypoints and ignores turn instructions", async () => {
    vi.stubEnv("ORS_API_KEY", "test-key");
    vi.stubEnv("ORS_BASE_URL", "https://api.heigit.org/openrouteservice");
    const points = [
      input.origin,
      { latitude: 48.102, longitude: -1.668 },
      { latitude: 48.104, longitude: -1.665 },
    ];
    const geometry = [
      [-1.67, 48.1],
      [-1.669, 48.1005],
      [-1.668, 48.102],
      [-1.666, 48.103],
      [-1.665, 48.104],
    ];
    const segments = [
      {
        distance: 321.5,
        duration: 240,
        steps: [
          { instruction: "Tournez à gauche", distance: 321.5, duration: 240 },
        ],
      },
      {
        distance: 456.7,
        duration: 360,
        steps: [{ instruction: "Continuez", distance: 456.7, duration: 360 }],
      },
    ];
    const fetcher = vi.fn(async (url: string, options: RequestInit) => {
      expect(url).toContain("foot-walking/geojson");
      const body = JSON.parse(options.body as string);
      expect(body).toEqual({
        coordinates: points.map((p) => [p.longitude, p.latitude]),
        radiuses: [50, 50, 50],
        units: "m",
      });
      return Response.json({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            geometry: { type: "LineString", coordinates: geometry },
            properties: body.instructions === false ? {} : { segments },
          },
        ],
      });
    });
    vi.stubGlobal("fetch", fetcher);
    const result = await createWalkingRouter().directions(points);
    expect(fetcher.mock.calls[0][0]).toBe(
      "https://api.heigit.org/openrouteservice/v2/directions/foot-walking/geojson",
    );
    expect(result).toEqual({
      geometry,
      legs: [cost(321.5, 240), cost(456.7, 360)],
    });
    expect(result.legs).toHaveLength(points.length - 1);
    expect(JSON.stringify(result)).not.toMatch(/instruction|steps|Tournez/);
  });
  it("still rejects a segment count inconsistent with the waypoints", async () => {
    vi.stubEnv("ORS_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          features: [
            {
              geometry: {
                type: "LineString",
                coordinates: [
                  [-1.67, 48.1],
                  [-1.66, 48.11],
                ],
              },
              properties: { segments: [{ distance: 300, duration: 250 }] },
            },
          ],
        }),
      ),
    );
    await expect(
      createWalkingRouter().directions([
        input.origin,
        input.origin,
        input.origin,
      ]),
    ).rejects.toMatchObject({ reason: "invalid" });
  });
});
