import { db, type Database } from "./db";
import { HttpError, requirePermission } from "./auth";
import { adminAccount, type Instance, type Season, type User } from "./domain";
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
): Promise<Season | null> {
  const { rows } = await client.query(
    "SELECT s.*,true active FROM seasons s WHERE id=$1 AND instance_id=$2",
    [i.active_season_id, i.id],
  );
  const s = (rows[0] as unknown as Season) ?? null;
  return s?.is_test && !adminAccount(user) ? null : s;
}
