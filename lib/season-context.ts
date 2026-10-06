import { db, type Database } from "./db";
import { HttpError, requirePermission } from "./auth";
import type { Instance, Season, User } from "./domain";
import { z } from "zod";
export async function selectedSeason(
  user: User | null,
  id?: string,
  client: Database = db(),
): Promise<Season | null> {
  const u = requirePermission(user, "admin.access");
  if (id) z.uuid().parse(id);
  const rows = (
    await client.query(
      "SELECT s.* FROM seasons s JOIN instances i ON i.id=s.instance_id WHERE s.instance_id=$1 AND s.id=COALESCE($2::uuid,i.active_season_id)",
      [u.instance_id, id ?? null],
    )
  ).rows;
  if (id && !rows[0]) throw new HttpError(404, "Saison introuvable");
  return (rows[0] as unknown as Season) ?? null;
}
export async function applicationSeason(
  i: Instance,
  user: User | null,
  earlyAccess = false,
  client: Database = db(),
): Promise<Season | null> {
  const id =
    earlyAccess && user?.role_name === "SUPER_ADMIN" && i.test_season_id
      ? i.test_season_id
      : i.active_season_id;
  return (
    ((
      await client.query(
        "SELECT * FROM seasons WHERE id=$1 AND instance_id=$2",
        [id, i.id],
      )
    ).rows[0] as unknown as Season) ?? null
  );
}
export function eligibleOwner(origin: string | null | undefined, s: Season) {
  return s.is_test ? origin === s.id : !origin;
}
