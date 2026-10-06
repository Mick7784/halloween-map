import { db } from "./db";
import { hashToken, HttpError } from "./auth";
import type { User } from "./domain";
export type TimeContext = { now: Date; earlyAccess: boolean };
export function realTime(): TimeContext {
  return { now: new Date(), earlyAccess: false };
}
// A URL can request access, but only the signed-in Super Admin's live session can grant it.
export async function effectiveTime(
  requested: boolean,
  user: User | null,
  session?: string,
): Promise<TimeContext> {
  if (requested && (user?.role_name !== "SUPER_ADMIN" || !session))
    throw new HttpError(403, "Mode démo réservé au Super Admin");
  if (user?.role_name !== "SUPER_ADMIN" || !session) return realTime();
  const row = (
    await db().query(
      "SELECT early_access FROM sessions WHERE token_hash=$1 AND user_id=$2 AND expires_at>now()",
      [hashToken(session), user.id],
    )
  ).rows[0];
  if (requested && !row?.early_access)
    throw new HttpError(403, "Activez le mode démo depuis l’accueil");
  return { now: new Date(), earlyAccess: row?.early_access === true };
}
