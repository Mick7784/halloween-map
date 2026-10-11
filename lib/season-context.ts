import { db, type Database } from "./db";
import { HttpError, requirePermission } from "./auth";
import { can, type Instance, type Season, type User } from "./domain";
import { z } from "zod";
export async function selectedSeason(
  user: User | null,
  id?: string,
  client: Database = db(),
): Promise<Season | null> {
  const u = requirePermission(user, "admin.access");
  if (id) z.uuid().parse(id);
  const { rows } = await client.query(
    "SELECT s.*,COALESCE(i.active_season_id=s.id,false) active FROM seasons s JOIN instances i ON i.id=s.instance_id WHERE s.instance_id=$1 AND s.id=COALESCE($2::uuid,i.active_season_id)",
    [u.instance_id, id ?? null],
  );
  if (id && !rows[0]) throw new HttpError(404, "Saison introuvable");
  return (rows[0] as unknown as Season) ?? null;
}
export async function applicationSeason(
  i: Instance,
  user: User | null,
  client: Database = db(),
  now: Date = new Date(),
): Promise<Season | null> {
  // An inactive real season is still visible as a countdown to members and
  // a preview map to staff. Never expose a TEST season to ordinary accounts.
  // Recently finished seasons take precedence over next year's draft so the
  // thank-you screen survives the automatic deactivation of the active pointer.
  const staff = can(user, "admin.access");
  const { rows } = await client.query(
    `SELECT s.*, (s.id=i.active_season_id) active
     FROM seasons s JOIN instances i ON i.id=s.instance_id
     WHERE s.instance_id=$1
       AND (NOT s.is_test OR (s.id=i.active_season_id AND $2))
       AND ($2 OR NOT EXISTS(
         SELECT 1 FROM seasons currently_active
         WHERE currently_active.id=i.active_season_id AND currently_active.is_test
       ))
     ORDER BY
       CASE WHEN s.id=i.active_season_id THEN 0
            WHEN s.closes_at<=$3::timestamptz AND s.closes_at>$3::timestamptz-interval '14 days' THEN 1
            WHEN NOT s.archived AND s.opens_at>$3::timestamptz THEN 2
            WHEN NOT s.archived AND s.closes_at>$3::timestamptz THEN 3
            ELSE 4 END,
       CASE WHEN s.opens_at>$3::timestamptz THEN s.opens_at END ASC NULLS LAST,
       s.opens_at DESC
     LIMIT 1`,
    [i.id, staff, now],
  );
  return (rows[0] as unknown as Season) ?? null;
}
