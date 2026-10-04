import nodemailer from "nodemailer";
import { z } from "zod";
import { db, transaction } from "./db";
import { HttpError, requirePermission } from "./auth";
import { localISO, type User } from "./domain";
export function smtpAvailable() {
  return !!process.env.SMTP_HOST && !!process.env.SMTP_FROM;
}
export type Sender = (mail: {
  to: string;
  subject: string;
  text: string;
  messageId: string;
}) => Promise<void>;
function smtpSender(): Sender {
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    requireTLS: process.env.SMTP_SECURE !== "true",
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
      : undefined,
    connectionTimeout: 10000,
    socketTimeout: 15000,
    logger: false,
    debug: false,
  });
  return async (mail) => {
    await transport.sendMail({ ...mail, from: process.env.SMTP_FROM });
  };
}
export async function configureReminder(
  user: User | null,
  id: string,
  input: unknown,
) {
  z.uuid().parse(id);
  const u = requirePermission(user, "season.manage");
  const p = z
    .object({
      enabled: z.boolean(),
      at: z.string().max(40).optional(),
      subject: z
        .string()
        .trim()
        .max(150)
        .refine((v) => !/[\r\n]/.test(v)),
      body: z.string().trim().max(5000),
    })
    .parse(input);
  return transaction(async (c) => {
    const s = (
      await c.query(
        "SELECT s.*,i.timezone FROM seasons s JOIN instances i ON i.id=s.instance_id WHERE s.id=$1 AND s.instance_id=$2 FOR UPDATE OF s",
        [id, u.instance_id],
      )
    ).rows[0];
    if (!s || s.purged_at || s.archived)
      throw new HttpError(400, "Saison indisponible");
    if (["SENDING", "SENT", "ERROR"].includes(String(s.reminder_status)))
      throw new HttpError(
        409,
        "L’envoi a commencé : modification impossible pour éviter un doublon",
      );
    let at: string | null = null;
    if (p.enabled) {
      if (!p.subject || !p.body || !p.at)
        throw new HttpError(400, "Date, sujet et message requis");
      try {
        at = localISO(p.at, String(s.timezone));
      } catch {
        throw new HttpError(400, "Date invalide ou ambiguë");
      }
      if (+new Date(at) >= +new Date(String(s.purge_at)))
        throw new HttpError(400, "Programmez le rappel avant la purge");
    }
    await c.query(
      "UPDATE seasons SET reminder_enabled=$1,reminder_at=$2,reminder_subject=$3,reminder_body=$4,reminder_status=$5 WHERE id=$6",
      [p.enabled, at, p.subject, p.body, p.enabled ? "SCHEDULED" : "NONE", id],
    );
    await c.query(
      "INSERT INTO audit_logs(instance_id,actor_id,action,target_id) VALUES($1,$2,'season.reminder.updated',$3)",
      [u.instance_id, u.id, id],
    );
    return { ok: true };
  });
}
// Claim before SMTP: an ambiguous transport outcome is never automatically retried.
// Generic SMTP cannot guarantee exactly once delivery after a process/network failure.
export async function dispatchReminders(now = new Date(), send?: Sender) {
  if (!send && !smtpAvailable()) return;
  const sender = send || smtpSender();
  const due = (
    await db().query(
      "SELECT id FROM seasons WHERE purged_at IS NULL AND reminder_enabled=true AND ((reminder_status='SCHEDULED' AND reminder_at<=$1) OR reminder_status='SENDING')",
      [now],
    )
  ).rows;
  for (const dueSeason of due) {
    await transaction(async (c) => {
      const s = (
        await c.query("SELECT * FROM seasons WHERE id=$1 FOR UPDATE", [
          dueSeason.id,
        ])
      ).rows[0];
      if (!s || s.purged_at || s.reminder_status !== "SCHEDULED") return;
      await c.query(
        "INSERT INTO reminder_deliveries(season_id,user_id) SELECT DISTINCT h.season_id,u.id FROM houses h JOIN users u ON u.id=h.user_id WHERE h.season_id=$1 AND u.kind='PARTICIPANT' AND u.demo=false ON CONFLICT DO NOTHING",
        [s.id],
      );
      await c.query(
        "UPDATE seasons SET reminder_status='SENDING',reminder_recipients=(SELECT count(*) FROM reminder_deliveries WHERE season_id=$1) WHERE id=$1",
        [s.id],
      );
    });
    const queued = (
      await db().query(
        "SELECT user_id FROM reminder_deliveries WHERE season_id=$1 AND status='QUEUED'",
        [dueSeason.id],
      )
    ).rows;
    for (const q of queued) {
      const claimed = await transaction(async (c) => {
        const s = (
          await c.query("SELECT * FROM seasons WHERE id=$1 FOR UPDATE", [
            dueSeason.id,
          ])
        ).rows[0];
        if (!s || s.purged_at || s.reminder_status !== "SENDING") return null;
        const d = (
          await c.query(
            "UPDATE reminder_deliveries SET status='CLAIMED',claimed_at=$3 WHERE season_id=$1 AND user_id=$2 AND status='QUEUED' RETURNING user_id",
            [s.id, q.user_id, now],
          )
        ).rows[0];
        if (!d) return null;
        const u = (
          await c.query("SELECT email FROM users WHERE id=$1", [q.user_id])
        ).rows[0];
        return u
          ? {
              to: String(u.email),
              subject: String(s.reminder_subject),
              text: String(s.reminder_body),
              messageId: `<${s.id}.${q.user_id}@halloween-map.local>`,
            }
          : null;
      });
      if (!claimed) continue;
      let status = "SENT";
      try {
        await sender(claimed);
      } catch {
        status = "ERROR";
      }
      await db().query(
        "UPDATE reminder_deliveries SET status=$3 WHERE season_id=$1 AND user_id=$2 AND status='CLAIMED'",
        [dueSeason.id, q.user_id, status],
      );
    }
    await transaction(async (c) => {
      await c.query("SELECT id FROM seasons WHERE id=$1 FOR UPDATE", [
        dueSeason.id,
      ]);
      await c.query(
        "UPDATE reminder_deliveries SET status='ERROR' WHERE season_id=$1 AND status='CLAIMED' AND claimed_at<$2",
        [dueSeason.id, new Date(+now - 10 * 60000)],
      );
      const stats = (
        await c.query(
          "SELECT count(*) FILTER(WHERE status='SENT')::int sent,count(*) FILTER(WHERE status='ERROR')::int errors,count(*) FILTER(WHERE status IN('QUEUED','CLAIMED'))::int pending FROM reminder_deliveries WHERE season_id=$1",
          [dueSeason.id],
        )
      ).rows[0];
      if (!Number(stats.pending))
        await c.query(
          "UPDATE seasons SET reminder_status=$2,reminder_sent=$3,reminder_sent_at=$4 WHERE id=$1 AND purged_at IS NULL AND reminder_status='SENDING'",
          [
            dueSeason.id,
            Number(stats.errors) ? "ERROR" : "SENT",
            stats.sent,
            now,
          ],
        );
    });
  }
}
