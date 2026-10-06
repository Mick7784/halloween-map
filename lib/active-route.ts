import { z } from "zod";
import { routeSchema } from "./validation";
import type { Activity } from "./domain";
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
  geometry: z.array(point).min(2).max(100000),
  disclaimer: z.string(),
  message: z.string().optional(),
});
export const storedRouteSchema = z.object({
  format: z.literal(1),
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
    const value = storedRouteSchema.parse(JSON.parse(raw));
    if (
      value.ownerId !== identity.ownerId ||
      value.instanceId !== identity.instanceId ||
      value.seasonId !== identity.seasonId ||
      +new Date(value.expiresAt) <= now ||
      +new Date(value.parameters.end) <= now
    )
      return null;
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
      house: status.get(s.house.id)?.activities
        ? { ...s.house, activities: status.get(s.house.id)!.activities! }
        : s.house,
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
