import { db } from "./db";
import { hashToken, HttpError } from "./auth";
import type { User } from "./domain";
export type TimeContext = { now: Date; preview: boolean };
export function realTime(): TimeContext {
  return { now: new Date(), preview: false };
}
export async function effectiveTime(
  preview: boolean,
  user: User | null,
  session?: string,
): Promise<TimeContext> {
  if (!preview) return realTime();
  if (user?.role_name !== "SUPER_ADMIN" || !session)
    throw new HttpError(403, "Mode démo réservé au Super Admin");
  const season = (
    await db().query(
      "SELECT s.* FROM seasons s JOIN instances i ON i.active_season_id=s.id WHERE i.id=$1",
      [user.instance_id],
    )
  ).rows[0];
  if (
    season &&
    season.activated &&
    !season.archived &&
    !season.purged_at &&
    +new Date() >= +new Date(String(season.opens_at)) &&
    +new Date() < +new Date(String(season.closes_at))
  )
    throw new HttpError(
      403,
      "Mode démo indisponible pendant l’ouverture publique",
    );
  const row = (
    await db().query(
      "SELECT preview_at FROM sessions WHERE token_hash=$1 AND user_id=$2 AND expires_at>now()",
      [hashToken(session), user.id],
    )
  ).rows[0];
  if (!row?.preview_at)
    throw new HttpError(403, "Activez le mode démo depuis l’accueil");
  return { now: new Date(String(row.preview_at)), preview: true };
}
