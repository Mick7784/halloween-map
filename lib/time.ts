import { db } from "./db";
import { hashToken, requirePermission, HttpError } from "./auth";
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
  requirePermission(user, "season.preview");
  if (user?.kind !== "STAFF" || !session)
    throw new HttpError(403, "Prévisualisation réservée au staff");
  const row = (
    await db().query(
      "SELECT preview_at FROM sessions WHERE token_hash=$1 AND user_id=$2 AND expires_at>now()",
      [hashToken(session), user.id],
    )
  ).rows[0];
  if (!row?.preview_at)
    throw new HttpError(403, "Activez le mode démonstration dans Saison");
  return { now: new Date(String(row.preview_at)), preview: true };
}
