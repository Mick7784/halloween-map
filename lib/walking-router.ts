import { z } from "zod";
export type Point = { latitude: number; longitude: number };
export type WalkingCost = { distanceMeters: number; durationSeconds: number };
export type WalkingMatrix = (WalkingCost | null)[][];
export interface WalkingRouter {
  matrix(points: Point[]): Promise<WalkingMatrix>;
  directions(
    points: Point[],
  ): Promise<{ geometry: number[][]; legs: WalkingCost[] }>;
}
export class RoutingError extends Error {
  constructor(
    public readonly reason:
      "configuration" | "timeout" | "unavailable" | "invalid" | "no_route",
  ) {
    super(
      {
        configuration:
          "Le calcul piéton n’est pas encore configuré. Contactez l’équipe organisatrice.",
        timeout:
          "Le calcul piéton prend trop de temps. Réessayez dans un instant.",
        unavailable:
          "Le service de parcours piéton est indisponible. Réessayez plus tard.",
        invalid:
          "Le service piéton n’a pas fourni un trajet exploitable. Réessayez plus tard.",
        no_route:
          "Aucun parcours piéton compatible. Vérifiez le départ, les filtres et les horaires.",
      }[reason],
    );
  }
}
const coordinate = z.tuple([
  z.number().min(-180).max(180),
  z.number().min(-90).max(90),
]);
const metric = z.number().finite().nonnegative();
const pair = (p: Point) => [p.longitude, p.latitude];
// The profile is fixed here, never taken from client input or configuration.
export function createWalkingRouter(): WalkingRouter {
  const base = process.env.ORS_BASE_URL ?? "https://api.openrouteservice.org",
    key = process.env.ORS_API_KEY;
  let url: URL;
  try {
    url = new URL(base);
  } catch {
    throw new RoutingError("configuration");
  }
  if (
    (url.hostname === "api.openrouteservice.org" && !key) ||
    !["https:", "http:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new RoutingError("configuration");
  const deadline = AbortSignal.timeout(60000);
  async function request(endpoint: string, body: unknown) {
    let response: Response;
    try {
      response = await fetch(`${base.replace(/\/$/, "")}/v2/${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(key ? { Authorization: key } : {}),
        },
        body: JSON.stringify(body),
        cache: "no-store",
        signal: AbortSignal.any([deadline, AbortSignal.timeout(12000)]),
      });
    } catch (e) {
      const timeout =
        deadline.aborted ||
        (e instanceof Error && ["TimeoutError", "AbortError"].includes(e.name));
      console.warn("Walking routing request failed", {
        endpoint,
        reason: timeout ? "timeout" : "network",
      });
      throw new RoutingError(timeout ? "timeout" : "unavailable");
    }
    if (!response.ok) {
      const error = await response.json().catch(() => null),
        code = error?.error?.code;
      console.warn("Walking routing provider rejected request", {
        endpoint,
        status: response.status,
        code,
      });
      throw new RoutingError(
        [2009, 2010].includes(code) ? "no_route" : "unavailable",
      );
    }
    try {
      return await response.json();
    } catch {
      throw new RoutingError("invalid");
    }
  }
  function parse<T>(schema: z.ZodType<T>, data: unknown): T {
    const result = schema.safeParse(data);
    if (!result.success) {
      console.warn("Invalid walking routing response", {
        fields: result.error.issues.map((i) => i.path.join(".")),
      });
      throw new RoutingError("invalid");
    }
    return result.data;
  }
  return {
    async matrix(points) {
      // Explicit resource bound, never silently truncate eligible houses.
      if (points.length > 201)
        throw new Error(
          "Plus de 200 maisons correspondent. Affinez les activités ou les horaires.",
        );
      const snap = parse(
        z.object({
          locations: z.array(
            z
              .object({ location: coordinate, snapped_distance: metric })
              .nullable(),
          ),
        }),
        await request("snap/foot-walking/json", {
          locations: points.map(pair),
          radius: 50,
        }),
      );
      if (snap.locations.length !== points.length)
        throw new RoutingError("invalid");
      if (!snap.locations[0]) throw new RoutingError("no_route");
      const active = snap.locations.flatMap((p, i) => (p ? [i] : [])),
        result: WalkingMatrix = points.map(() => points.map(() => null));
      const blocks: number[][] = [];
      for (let i = 0; i < active.length; i += 50)
        blocks.push(active.slice(i, i + 50));
      // <=2500 pairs/request (hosted limit 3500); no per-candidate directions.
      for (const sources of blocks)
        for (const destinations of blocks) {
          const indexes = [...new Set([...sources, ...destinations])];
          const data = parse(
            z.object({
              distances: z.array(z.array(metric.nullable())),
              durations: z.array(z.array(metric.nullable())),
            }),
            await request("matrix/foot-walking", {
              locations: indexes.map((i) => snap.locations[i]!.location),
              sources: sources.map((i) => String(indexes.indexOf(i))),
              destinations: destinations.map((i) => String(indexes.indexOf(i))),
              metrics: ["distance", "duration"],
              units: "m",
            }),
          );
          if (
            data.distances.length !== sources.length ||
            data.durations.length !== sources.length ||
            data.distances.some((r) => r.length !== destinations.length) ||
            data.durations.some((r) => r.length !== destinations.length)
          )
            throw new RoutingError("invalid");
          sources.forEach((from, r) =>
            destinations.forEach((to, c) => {
              const d = data.distances[r][c],
                t = data.durations[r][c];
              result[from][to] =
                d === null || t === null
                  ? null
                  : { distanceMeters: d, durationSeconds: t };
            }),
          );
        }
      return result;
    },
    async directions(points) {
      const data = parse(
        z.object({
          features: z
            .array(
              z.object({
                geometry: z.object({
                  type: z.literal("LineString"),
                  coordinates: z.array(coordinate).min(2),
                }),
                properties: z.object({
                  segments: z.array(
                    z.object({ distance: metric, duration: metric }),
                  ),
                }),
              }),
            )
            .length(1),
        }),
        await request("directions/foot-walking/geojson", {
          coordinates: points.map(pair),
          radiuses: points.map(() => 50),
          instructions: false,
          units: "m",
        }),
      );
      const feature = data.features[0];
      if (feature.properties.segments.length !== points.length - 1)
        throw new RoutingError("invalid");
      return {
        geometry: feature.geometry.coordinates,
        legs: feature.properties.segments.map((s) => ({
          distanceMeters: s.distance,
          durationSeconds: s.duration,
        })),
      };
    },
  };
}
