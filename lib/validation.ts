import { z } from "zod";
import { DateTime } from "luxon";
const text = (max: number) => z.string().trim().min(1).max(max);
export const credentials = z.object({
  email: z
    .email()
    .max(254)
    .transform((v) => v.toLowerCase()),
  password: z.string().min(12).max(128),
});
export const coordinates = {
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
};
export const instanceSchema = z.object({
  public_name: text(100),
  territory: text(100),
  postal_code: text(20),
  country: text(80),
  timezone: text(80).refine(
    (v) => DateTime.now().setZone(v).isValid,
    "Fuseau invalide",
  ),
  ...coordinates,
  zoom: z.number().int().min(2).max(18),
});
export const seasonSchema = z.object({
  name: text(100).optional(),
  is_test: z.boolean().default(false),
  year: z.number().int().min(2020).max(2200),
  registrations_open_at: text(40).optional(),
  purge_at: text(40).optional(),
  opens_at: text(40),
  closes_at: text(40),
  registrations_open: z.boolean(),
});
export function testSeasonDefinition(input: unknown) {
  if (!input || typeof input !== "object" || !(input as { is_test?: boolean }).is_test) return input;
  return { ...input, year: (input as { year?: number }).year ?? new Date().getUTCFullYear(),
    registrations_open_at: "2000-01-01T00:00:00Z", opens_at: "2000-01-01T00:00:00Z",
    closes_at: "2201-01-01T00:00:00Z", purge_at: "2201-01-02T00:00:00Z", registrations_open: true };
}
export const setupSchema = z.object({
  token: text(200).optional(),
  instance: instanceSchema,
  admin: credentials.extend({ display_name: text(80) }),
  season: seasonSchema,
});
export const houseSchema = z.object({
  position_confirmed: z.boolean().optional(),
  name: text(100),
  address: text(200),
  address_parts: z
    .object({
      postalCode: z.string().regex(/^\d{5}$/),
      city: text(100),
      cityCode: z.string().regex(/^(?:\d{5}|2[AB]\d{3})$/),
      number: z
        .string()
        .trim()
        .regex(
          /^\d+\s*(?:(?:bis|ter|quater)|[A-Za-z])?$/i,
          "Numéro invalide (ex. 12 bis ou 12 A)",
        ),
      street: text(120),
    })
    .optional(),
  ...coordinates,
  activities: z
    .array(z.enum(["DECORATION", "CANDY", "ACTING"]))
    .min(1)
    .max(3)
    .transform((v) => Array.from(new Set(v))),
  starts_at: text(40),
  ends_at: text(40),
  fear: z.number().int().min(1).max(5),
  adaptable: z.boolean(),
  rp: z.string().trim().max(300),
  practical: z.string().trim().max(300),
});
export const registrationSchema = z.object({
  account: credentials,
  house: houseSchema,
});
export const routeSchema = z.object({
  acceptance: z.object({
    mode: z.literal("GUIDELINES_ONLY"),
    guidelines: z.literal(true),
    guidelines_version: z.string().min(1).max(100),
  }),
  excludedHouseIds: z.array(z.string().uuid()).max(200).default([]),
  start: text(40),
  end: text(40),
  origin: z.object(coordinates),
  activities: z.array(z.enum(["DECORATION", "CANDY", "ACTING"])).max(3),
  maxFear: z.number().int().min(1).max(5).optional(),
});
export const routeAvailabilitySchema = z.object({
  mode: z.literal("COLLECTION").optional(),
  end: z.iso.datetime({ offset: true }).optional(),
  instanceId: z.string().uuid(),
  seasonId: z.string().uuid(),
  activities: z.array(z.enum(["DECORATION", "CANDY", "ACTING"])).max(3),
  maxFear: z.number().int().min(1).max(5).optional(),
  steps: z
    .array(
      z.object({
        id: z.string().uuid(),
        arrival: z.iso.datetime({ offset: true }),
        departure: z.iso.datetime({ offset: true }),
        key: z.string().max(3000),
      }),
    )
    .min(1)
    .max(30)
    .refine((steps) => new Set(steps.map((s) => s.id)).size === steps.length),
});
