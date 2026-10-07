import { z } from "zod";
import { routeSchema } from "./validation";
import type { Activity } from "./domain";
import { emptyCollection } from "./collection";
import type { RouteResult } from "./routing";

export const ACTIVE_ROUTE_KEY = "halloween.active-route";
export const ROUTE_POLL_MS = 60000;
export type RouteParameters = z.infer<typeof routeSchema>;
export type SheetPosition = "collapsed" | "intermediate" | "expanded";
export type MapCamera = {
  center: [number, number];
  zoom: number;
  bearing: number;
  pitch: number;
};
export type AvailabilityReason =
  "unavailable" | "paused" | "ended" | "expired" | "activities" | "changed";
export type RouteAvailability = {
  valid: boolean;
  checkedAt: string;
  steps: {
    id: string;
    available: boolean;
    reason?: AvailabilityReason;
    activities?: Activity[];
    house?: RouteResult["stops"][number]["house"];
  }[];
};
const point = z.tuple([
  z.number().min(-180).max(180),
  z.number().min(-90).max(90),
]);
const metric = z.number().finite().nonnegative();
const date = z.iso.datetime({ offset: true });
const house = z.object({
  id: z.string().uuid(),
  name: z.string().max(100),
  address: z.string().max(200),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  activities: z.array(z.enum(["DECORATION", "CANDY", "ACTING"])).max(3),
  offeredActivities: z
    .array(z.enum(["DECORATION", "CANDY", "ACTING"]))
    .max(3)
    .optional(),
  candy_available: z.boolean().optional(),
  referenceFear: z.number().int().min(1).max(5).optional(),
  starts_at: date,
  ends_at: date,
  fear: z.number().int().min(1).max(5).nullable(),
  adaptable: z.boolean(),
  rp: z.string().max(300),
  practical: z.string().max(300),
});
const result = z.object({
  stops: z
    .array(
      z.object({
        house,
        arrival: date,
        departure: date,
        walkingMinutes: metric,
        walkingSeconds: metric,
        distanceMeters: metric,
        unavailable: z.boolean().optional(),
      }),
    )
    .min(1)
    .max(30),
  distanceMeters: metric,
  walkingMinutes: metric,
  walkingSeconds: metric,
  durationMinutes: metric,
  estimatedEnd: date,
  geometry: z.array(point).max(100000),
  disclaimer: z.string(),
  message: z.string().optional(),
});
export const storedRouteSchema = z.object({
  format: z.literal(2),
  collectionId: z.uuid().nullable().optional(),
  phase: z.enum(["calculated", "active", "completed"]),
  collection: z.object({
    startedAt: date.nullable(),
    endedAt: date.nullable(),
    distanceMeters: metric,
    visitedIds: z.array(z.string().uuid()).max(30),
  }),
  ownerId: z.string(),
  instanceId: z.string().uuid(),
  seasonId: z.string().uuid(),
  parameters: routeSchema,
  result,
  createdAt: date,
  updatedAt: date,
  expiresAt: date,
  sheet: z.enum(["collapsed", "intermediate", "expanded"]),
  camera: z
    .object({
      center: point,
      zoom: z.number().min(0).max(24),
      bearing: z.number().finite(),
      pitch: z.number().min(0).max(85),
    })
    .nullable(),
});
export type StoredRoute = Omit<z.infer<typeof storedRouteSchema>, "result"> & {
  result: RouteResult;
};
export function restoreRoute(
  raw: string | null,
  identity: { ownerId: string; instanceId: string; seasonId: string },
  now: number,
): StoredRoute | null {
  try {
    if (!raw || raw.length > 5000000) return null;
    const parsed = JSON.parse(raw);
    if (parsed.format === 1) {
      parsed.format = 2;
      parsed.phase = "calculated";
      parsed.collection = emptyCollection();
    }
    const value = storedRouteSchema.parse(parsed);
    if (
      value.ownerId !== identity.ownerId ||
      value.instanceId !== identity.instanceId ||
      value.seasonId !== identity.seasonId ||
      (value.phase === "calculated" &&
        (+new Date(value.expiresAt) <= now ||
          +new Date(value.parameters.end) <= now)) ||
      value.collection.visitedIds.some(
        (id) => !value.result.stops.some((s) => s.house.id === id),
      ) ||
      new Set(value.collection.visitedIds).size !==
        value.collection.visitedIds.length ||
      (value.phase === "active" &&
        (!value.collection.startedAt || !!value.collection.endedAt)) ||
      (value.phase === "completed" &&
        (!value.collection.startedAt || !value.collection.endedAt)) ||
      (value.phase === "calculated" &&
        (value.collection.startedAt !== null ||
          value.collection.visitedIds.length > 0 ||
          value.collection.distanceMeters !== 0))
    )
      return null;
    if (
      value.phase === "active" &&
      Math.min(+new Date(value.expiresAt), +new Date(value.parameters.end)) <=
        now
    ) {
      value.phase = "completed";
      value.collection.endedAt = new Date(
        Math.max(
          +new Date(value.collection.startedAt!),
          Math.min(+new Date(value.expiresAt), +new Date(value.parameters.end)),
        ),
      ).toISOString();
    }
    return value;
  } catch {
    return null;
  }
}
export function annotateAvailability(
  route: RouteResult,
  availability: RouteAvailability,
): RouteResult {
  const status = new Map(availability.steps.map((s) => [s.id, s]));
  return {
    ...route,
    stops: route.stops.map((s) => ({
      ...s,
      unavailable: status.get(s.house.id)?.available !== true,
      house:
        status.get(s.house.id)?.house ??
        (status.get(s.house.id)?.activities
          ? { ...s.house, activities: status.get(s.house.id)!.activities! }
          : s.house),
    })),
  };
}
export function clearStoredRoute() {
  try {
    localStorage.removeItem(ACTIVE_ROUTE_KEY);
  } catch {
    /* Storage can be unavailable in private mode. */
  }
}
