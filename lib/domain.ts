import { DateTime } from "luxon";
export type Activity = "DECORATION" | "CANDY" | "ACTING";
export type Season = {
  id: string;
  instance_id: string;
  year: number;
  activated: boolean;
  registrations_open: boolean;
  opens_at: Date | string;
  closes_at: Date | string;
  archived: boolean;
  purged_at: Date | string | null;
  routes_count: number;
  stats: Record<string, number>;
};
export type House = {
  id: string;
  instance_id: string;
  season_id: string;
  user_id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  activities: Activity[];
  starts_at: Date | string;
  ends_at: Date | string;
  fear: number;
  adaptable: boolean;
  rp: string;
  practical: string;
  candy_available: boolean;
  status: string;
  activity: string;
  demo: boolean;
};
export type Instance = {
  id: string;
  public_name: string;
  territory: string;
  postal_code: string;
  country: string;
  timezone: string;
  latitude: number;
  longitude: number;
  zoom: number;
  plan: string;
  config: Record<string, unknown>;
  active_season_id: string;
};
export type User = {
  id: string;
  instance_id: string;
  email: string;
  display_name: string;
  kind: string;
  role_name: string | null;
  role_id: string | null;
  permissions: string[];
};
export const permissions = [
  "participants.read",
  "participants.validate",
  "participants.edit",
  "participants.delete",
  "users.read",
  "users.manage",
  "season.read",
  "season.manage",
  "settings.read",
  "settings.manage",
  "stats.read",
  "audit.read",
  "roles.manage",
] as const;
export const defaultRoles: Record<string, readonly string[]> = {
  SUPER_ADMIN: permissions,
  LOCAL_ADMIN: permissions.filter((p) => p !== "roles.manage"),
  MODERATOR: [
    "participants.read",
    "participants.validate",
    "participants.edit",
    "season.read",
    "audit.read",
  ],
  READ_ONLY: [
    "participants.read",
    "users.read",
    "season.read",
    "settings.read",
    "stats.read",
  ],
};
export function can(user: User | null, permission: string) {
  return !!user?.permissions.includes(permission);
}
export function seasonState(s: Season | null, now = new Date()) {
  if (!s) return "PREPARATION";
  if (s.archived) return "ARCHIVED";
  if (s.purged_at || +now >= +new Date(s.closes_at)) return "CLOSED";
  if (!s.activated) return "PREPARATION";
  if (+now < +new Date(s.opens_at)) return "COUNTDOWN";
  return "MAP_OPEN";
}
export function effectiveActivities(h: House) {
  return h.activities.filter((a) => a !== "CANDY" || h.candy_available);
}
export function visible(h: House, s: Season, now = new Date()) {
  return (
    seasonState(s, now) === "MAP_OPEN" &&
    h.status === "APPROVED" &&
    h.activity === "ACTIVE" &&
    effectiveActivities(h).length > 0 &&
    +now >= +new Date(h.starts_at) &&
    +now < +new Date(h.ends_at)
  );
}
export function localISO(value: string, zone: string) {
  const d = DateTime.fromISO(value, { zone });
  if (!d.isValid) throw new Error("Date ou fuseau horaire invalide");
  return d.toUTC().toISO()!;
}
export function publicHouse(h: House) {
  return {
    id: h.id,
    name: h.name,
    address: h.address,
    latitude: h.latitude,
    longitude: h.longitude,
    activities: effectiveActivities(h),
    starts_at: h.starts_at,
    ends_at: h.ends_at,
    fear: h.adaptable ? null : h.fear,
    adaptable: h.adaptable,
    rp: h.rp,
    practical: h.practical,
  };
}
