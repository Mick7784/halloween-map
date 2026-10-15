import { db, type Database } from "./db";
import { HttpError, requirePermission } from "./auth";
import { type Instance, type Season, type User } from "./domain";
import { z } from "zod";

// The BO may prepare an inactive season; the application never uses it publicly.
export async function selectedSeason(
  user: User | null,
  id?: string,
  client: Database = db(),
): Promise<Season | null> {
  const u = requirePermission(user, "admin.access");
  if (id) z.uuid().parse(id);
  const { rows } = await client.query(
    `SELECT s.*, COALESCE(i.active_season_id=s.id,false) active
     FROM seasons s JOIN instances i ON i.id=s.instance_id
     WHERE s.instance_id=$1 AND NOT s.is_test AND ($2::uuid IS NULL OR s.id=$2)
     ORDER BY CASE WHEN s.id=i.active_season_id THEN 0
                   WHEN NOT s.archived AND s.purged_at IS NULL AND s.closes_at>now() THEN 1
                   ELSE 2 END,
              s.opens_at DESC
     LIMIT 1`,
    [u.instance_id, id ?? null],
  );
  if (id && !rows[0]) throw new HttpError(404, "Saison introuvable");
  return (rows[0] as unknown as Season) ?? null;
}

// Only the manually active real season can be exposed via public APIs.
export async function applicationSeason(
  i: Instance,
  _user: User | null,
  client: Database = db(),
  _now: Date = new Date(),
): Promise<Season | null> {
  void _now;
  const { rows } = await client.query(
    `SELECT s.*, true active FROM seasons s
     WHERE s.id=$1 AND s.instance_id=$2 AND NOT s.is_test
       AND s.archived=false AND s.purged_at IS NULL`,
    [i.active_season_id, i.id],
  );
  return (rows[0] as unknown as Season) ?? null;
}
