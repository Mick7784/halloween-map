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
  year: z.number().int().min(2020).max(2200),
  registrations_open_at: text(40).optional(),
  purge_at: text(40).optional(),
  opens_at: text(40),
  closes_at: text(40),
  registrations_open: z.boolean(),
  activated: z.boolean().default(false),
});
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
  start: text(40),
  end: text(40),
  origin: z.object(coordinates),
  activities: z.array(z.enum(["DECORATION", "CANDY", "ACTING"])).max(3),
  maxFear: z.number().int().min(1).max(5).optional(),
});
