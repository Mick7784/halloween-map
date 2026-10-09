import { db } from "./db";
import { HttpError, rateLimit } from "./auth";
import type { User } from "./domain";
import { DateTime } from "luxon";

export async function presence(user: User | null) {
  if (!user) throw new HttpError(401, "Connexion requise");
  await rateLimit("presence:" + user.id, 30);
  await db().query(
    `INSERT INTO active_presence(user_id,season_id,seen_at)
    SELECT $1,s.id,now() FROM instances i JOIN seasons s ON s.id=i.active_season_id
    WHERE i.id=$2 AND NOT s.archived AND s.purged_at IS NULL AND (s.is_test OR s.closes_at>now())
    ON CONFLICT(user_id) DO UPDATE SET season_id=excluded.season_id,seen_at=excluded.seen_at`,
    [user.id, user.instance_id],
  );
  return { ok: true };
}
export async function measureAttendance(now = new Date()) {
  await db().query("DELETE FROM active_presence WHERE seen_at<$1", [
    new Date(+now - 3 * 60000),
  ]);
  // Only sample close to a real quarter-hour. Never backfill missed intervals.
  const slot = Math.floor(+now / 900000) * 900000;
  if (+now - slot <= 30000)
    await db().query(
      `INSERT INTO attendance_samples(season_id,sample_slot,sampled_at,active_count)
      SELECT s.id,$1,$2,(SELECT count(*)::int FROM active_presence p JOIN users u ON u.id=p.user_id WHERE p.season_id=s.id AND u.account_status='ACTIVE' AND p.seen_at>$2::timestamptz-interval '3 minutes')
      FROM seasons s JOIN instances i ON i.active_season_id=s.id WHERE NOT s.archived AND s.purged_at IS NULL AND (s.is_test OR s.closes_at>$2)
      ON CONFLICT DO NOTHING`,
      [new Date(slot), now],
    );
  await db().query("DELETE FROM participation_history WHERE recorded_at<$1", [
    new Date(new Date(now).setFullYear(now.getFullYear() - 5)),
  ]);
  await db().query("DELETE FROM audit_logs WHERE created_at<$1", [
    new Date(+now - 90 * 86400000),
  ]);
  await db().query("DELETE FROM rate_limits WHERE reset_at<$1", [now]);
}
export type Attendance = {
  activeNow: number;
  peak: { active_count: number; sampled_at: string } | null;
  points: { at: string; average: number; samples: number }[];
};
export async function attendance(
  seasonId: string | undefined,
): Promise<Attendance> {
  if (!seasonId) return { activeNow: 0, peak: null, points: [] };
  const active = (
    await db().query(
      "SELECT count(*)::int n FROM active_presence p JOIN users u ON u.id=p.user_id WHERE p.season_id=$1 AND p.seen_at>now()-interval '3 minutes' AND u.account_status='ACTIVE'",
      [seasonId],
    )
  ).rows[0];
  const peak = (
    await db().query(
      "SELECT active_count,sampled_at FROM attendance_samples WHERE season_id=$1 ORDER BY active_count DESC,sampled_at LIMIT 1",
      [seasonId],
    )
  ).rows[0];
  const samples = (
    await db().query(
      "SELECT a.sample_slot,a.active_count,i.timezone FROM attendance_samples a JOIN seasons s ON s.id=a.season_id JOIN instances i ON i.id=s.instance_id WHERE a.season_id=$1 ORDER BY sample_slot",
      [seasonId],
    )
  ).rows;
  const groups = new Map<number, { total: number; count: number }>();
  for (const sample of samples) {
    const at = +new Date(String(sample.sample_slot)),
      offset =
        DateTime.fromMillis(at).setZone(String(sample.timezone)).offset * 60000;
    const bucket = Math.floor((at + offset) / 1800000) * 1800000 - offset;
    const group = groups.get(bucket) ?? { total: 0, count: 0 };
    group.total += Number(sample.active_count);
    group.count++;
    groups.set(bucket, group);
  }
  return {
    activeNow: Number(active.n),
    peak: peak
      ? {
          active_count: Number(peak.active_count),
          sampled_at: new Date(String(peak.sampled_at)).toISOString(),
        }
      : null,
    points: [...groups].map(([at, g]) => ({
      at: new Date(at).toISOString(),
      average: g.total / g.count,
      samples: g.count,
    })),
  };
}
