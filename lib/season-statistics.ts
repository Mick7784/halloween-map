import { reportSchema } from "./collection-reports";
import { transaction } from "./db";
import { HttpError } from "./auth";
import {
  adminAccount,
  mapAccessible,
  type User,
  type Instance,
  type Season,
} from "./domain";

// These totals are reported by the client, not independently measured by the server.

export async function reportCollection(
  user: User | null,
  input: unknown,
  session: string,
) {
  if (!user || !session) throw new HttpError(401, "Connexion requise");
  const p = reportSchema.parse(input);
  return transaction(async (c) => {
    const i = (
      await c.query("SELECT * FROM instances WHERE id=$1 FOR UPDATE", [
        user.instance_id,
      ])
    ).rows[0] as unknown as Instance;
    const s = (
      await c.query(
        "SELECT * FROM seasons WHERE id=$1 AND instance_id=$2 FOR UPDATE",
        [p.seasonId, user.instance_id],
      )
    ).rows[0] as unknown as Season;
    const previous = (
      await c.query("SELECT * FROM collection_reports WHERE id=$1 FOR UPDATE", [
        p.id,
      ])
    ).rows[0];
    if (!s || s.purged_at || s.archived || (s.is_test && !adminAccount(user)))
      throw new HttpError(409, "La saison n’est plus accessible");
    const accessible =
      i?.active_season_id === s.id && mapAccessible({ ...s, active: true });
    // A collection already started may finish after closing, until the privacy purge.
    // Only its numerical totals can change; house/configuration snapshots stay read-only.
    if (
      !accessible &&
      !(
        p.event === "finish" &&
        previous?.started &&
        previous.season_id === s.id
      )
    )
      throw new HttpError(409, "La saison n’est plus accessible");
    await c.query(
      "INSERT INTO collection_reports(id,season_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
      [p.id, s.id],
    );
    const receipt = (
      await c.query("SELECT * FROM collection_reports WHERE id=$1 FOR UPDATE", [
        p.id,
      ])
    ).rows[0];
    if (receipt.season_id !== s.id)
      throw new HttpError(403, "Collecte incompatible");
    // A start increments only once; finish includes start for offline or very short collections.
    const started = (
      await c.query("SELECT stats FROM seasons WHERE id=$1 FOR UPDATE", [s.id])
    ).rows[0].stats as Record<string, number>;
    // finished=true makes all later reports harmless; use a separate recorded flag for start.
    const recorded = (
      await c.query(
        "UPDATE collection_reports SET started=true WHERE id=$1 AND NOT started RETURNING id",
        [p.id],
      )
    ).rows.length;
    const stats = { ...started };
    if (recorded)
      stats.collections_started = (stats.collections_started ?? 0) + 1;
    if (p.event === "finish" && !receipt.finished) {
      await c.query("UPDATE collection_reports SET finished=true WHERE id=$1", [
        p.id,
      ]);
      stats.collections_finished = (stats.collections_finished ?? 0) + 1;
      stats.visited = (stats.visited ?? 0) + p.visited;
      stats.distance_meters = (stats.distance_meters ?? 0) + p.distanceMeters;
      stats.duration_seconds =
        (stats.duration_seconds ?? 0) + p.durationSeconds;
      stats.completion_sum =
        (stats.completion_sum ?? 0) + (p.planned ? p.visited / p.planned : 0);
    }
    await c.query("UPDATE seasons SET stats=$1 WHERE id=$2", [
      JSON.stringify(stats),
      s.id,
    ]);
    return { ok: true };
  });
}
