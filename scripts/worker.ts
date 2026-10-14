import { tick } from "../lib/service";
import { dispatchEmails } from "../lib/mail";
import { measureAttendance } from "../lib/attendance";
import { db } from "../lib/db";

async function heartbeat(success: boolean) {
  // Outbox counts contain no personal information or message bodies.
  const result = await db().query(
    "SELECT count(*)::int AS overdue, min(scheduled_at) AS oldest " +
    "FROM email_outbox WHERE status='PENDING' AND scheduled_at < now()-interval '10 minutes'",
  );
  const overdue = Number(result.rows[0]?.overdue ?? 0);
  const oldest = result.rows[0]?.oldest ?? null;
  await db().query(
    `INSERT INTO worker_health(worker_name,last_attempt_at,last_success_at,last_error_at,
         consecutive_failures,overdue_outbox,oldest_overdue_at)
       VALUES('season_worker',now(),CASE WHEN $1 THEN now() ELSE NULL END,
         CASE WHEN $1 THEN NULL ELSE now() END,CASE WHEN $1 THEN 0 ELSE 1 END,$2,$3)
       ON CONFLICT(worker_name) DO UPDATE SET
         last_attempt_at=now(),
         last_success_at=CASE WHEN $1 THEN now() ELSE worker_health.last_success_at END,
         last_error_at=CASE WHEN $1 THEN worker_health.last_error_at ELSE now() END,
         consecutive_failures=CASE WHEN $1 THEN 0 ELSE worker_health.consecutive_failures+1 END,
         overdue_outbox=$2,oldest_overdue_at=$3`,
    [success, overdue, oldest],
  );
  if (overdue > 0) console.warn("Season worker: messages en attente au-delà de 10 min :", overdue);
}
async function run() {
  let success = false;
  try {
    await tick();
    await measureAttendance();
    await dispatchEmails();
    success = true;
  } catch {
    // Do not log email addresses, message contents, tokens or private records.
    console.error("Season worker: cycle interrompu ; reprise au prochain passage");
  } finally {
    try {
      await heartbeat(success);
    } catch {
      console.error("Season worker: impossible de mettre à jour la supervision");
    }
    setTimeout(() => void run(), 30000);
  }
}
await run();
