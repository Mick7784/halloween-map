import { DateTime } from "luxon";
export type Activity = "DECORATION" | "CANDY" | "ACTING";
export type Season = {
  id: string;
  instance_id: string;
  year: number;
  activated: boolean;
  registrations_open: boolean;
  registrations_open_at: Date | string;
  purge_at: Date | string;
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
  email_status: string;
  email_verified_at: string | null;
  account_status: string;
  role_name: string | null;
  role_id: string | null;
  permissions: string[];
};
export type Participation = House;
// Capabilities are derived exclusively from the three fixed roles.
export const permissions = [
  "admin.access",
  "communications.read",
  "communications.manage",
  "content.manage",
  "participants.read",
  "participants.edit",
  "participants.delete",
  "users.read",
  "users.manage",
  "season.read",
  "season.manage",
  "season.preview",
  "settings.read",
  "settings.manage",
  "stats.read",
  "audit.read",
  "roles.manage",
] as const;
export const defaultRoles: Record<string, readonly string[]> = {
  USER: [],
  SUPER_ADMIN: permissions,
  ADMIN: permissions.filter(
    (p) =>
      ![
        "roles.manage",
        "settings.manage",
        "settings.read",
        "season.preview",
      ].includes(p),
  ),
};
export function can(user: User | null, permission: string) {
  return (
    !!user && !!defaultRoles[user.role_name ?? "USER"]?.includes(permission)
  );
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
    h.status === "VISIBLE" &&
    h.activity === "ACTIVE" &&
    effectiveActivities(h).length > 0 &&
    +now >= +new Date(h.starts_at) &&
    +now < +new Date(h.ends_at)
  );
}
export function localISO(value: string, zone: string) {
  const d = DateTime.fromISO(value, { zone });
  const explicitOffset = /[zZ]|[+-]\d{2}:\d{2}$/.test(value);
  if (
    !d.isValid ||
    (!explicitOffset &&
      (d.toFormat("yyyy-MM-dd'T'HH:mm") !== value.slice(0, 16) ||
        d.getPossibleOffsets().length > 1))
  )
    throw new Error(
      "Date locale invalide ou ambiguë ; précisez un décalage UTC",
    );
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
