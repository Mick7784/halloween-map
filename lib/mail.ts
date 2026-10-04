import { randomBytes } from "node:crypto";
import nodemailer from "nodemailer";
import { DateTime } from "luxon";
import { z } from "zod";
import { db, transaction, type Database } from "./db";
import { HttpError, hashToken, requirePermission, rateLimit } from "./auth";
import { localISO, type User } from "./domain";
import { interpolate, sanitizeContent } from "./content";
export const mailVariables = [
  "name",
  "territory",
  "event_name",
  "season_year",
  "registration_date",
  "map_open_date",
  "map_close_date",
  "house_name",
  "house_start_time",
] as const;
export type Sender = (mail: {
  to: string;
  subject: string;
  text: string;
  messageId: string;
}) => Promise<void>;
export function smtpAvailable() {
  return !!process.env.SMTP_HOST && !!process.env.SMTP_FROM;
}
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
export async function recomputeCampaigns(c: Database, seasonId: string) {
  return (
    await c.query(
      `UPDATE email_campaigns ec SET scheduled_at=((CASE ec.anchor WHEN 'opens_at' THEN s.opens_at WHEN 'closes_at' THEN s.closes_at WHEN 'purge_at' THEN s.purge_at ELSE s.registrations_open_at END AT TIME ZONE i.timezone) + ec.offset_days*interval '1 day') AT TIME ZONE i.timezone
 FROM seasons s JOIN instances i ON i.id=s.instance_id WHERE s.id=ec.season_id AND ec.season_id=$1 AND ec.schedule_mode='RELATIVE' AND ec.status IN('DRAFT','SCHEDULED') RETURNING ec.id`,
      [seasonId],
    )
  ).rows.length;
}
export async function campaignAdmin(user: User | null) {
  const u = requirePermission(user, "admin.access");
  requirePermission(u, "communications.read");
  return {
    smtpAvailable: smtpAvailable(),
    variables: mailVariables,
    campaigns: (
      await db().query(
        `SELECT c.*,(SELECT count(*)::int FROM email_outbox o WHERE o.campaign_id=c.id AND o.kind='CAMPAIGN' AND o.status IN('PENDING','CLAIMED')) pending FROM email_campaigns c WHERE instance_id=$1 ORDER BY scheduled_at`,
        [u.instance_id],
      )
    ).rows,
  };
}
export async function campaignAction(user: User | null, input: unknown) {
  const u = requirePermission(user, "admin.access");
  requirePermission(u, "communications.manage");
  const p = z
    .object({
      action: z.enum(["save", "test", "retry"]),
      id: z.uuid().optional(),
      campaign: z
        .object({
          season_id: z.uuid(),
          name: z.string().trim().min(1).max(100),
          subject: z
            .string()
            .trim()
            .min(1)
            .max(150)
            .refine((v) => !/[\r\n]/.test(v)),
          body: z.string().trim().min(1).max(5000),
          audience: z.enum(["ALL", "APPROVED", "PENDING", "ACTIVE"]),
          active: z.boolean(),
          schedule_mode: z.enum(["ABSOLUTE", "RELATIVE"]),
          anchor: z.enum([
            "opens_at",
            "closes_at",
            "registrations_open_at",
            "purge_at",
          ]),
          offset_days: z.number().int().min(-365).max(365),
          scheduled_at: z.string().max(40),
        })
        .optional(),
    })
    .parse(input);
  if (p.action !== "save") {
    if (!p.id) throw new HttpError(400, "Campagne requise");
    await rateLimit("campaign:" + p.action + ":" + u.id, 10);
    return transaction(async (c) => {
      const campaign = (
        await c.query(
          "SELECT * FROM email_campaigns WHERE id=$1 AND instance_id=$2 FOR UPDATE",
          [p.id, u.instance_id],
        )
      ).rows[0];
      if (!campaign) throw new HttpError(404, "Campagne introuvable");
      const season = (
        await c.query("SELECT purged_at FROM seasons WHERE id=$1", [
          campaign.season_id,
        ])
      ).rows[0];
      if (season.purged_at) throw new HttpError(400, "Saison purgée");
      if (p.action === "test") {
        if (u.email_status !== "VERIFIED")
          throw new HttpError(
            400,
            "Vérifiez votre email avant de recevoir un test",
          );
        await c.query(
          "INSERT INTO email_outbox(user_id,campaign_id,season_id,kind,idempotency_key) VALUES($1,$2,$3,'TEST',$4)",
          [u.id, p.id, campaign.season_id, randomBytes(24).toString("hex")],
        );
      } else {
        await c.query(
          "UPDATE email_outbox SET status='PENDING',scheduled_at=now(),last_error=NULL WHERE campaign_id=$1 AND status='FAILED' AND retry_safe=true AND attempts<3",
          [p.id],
        );
        await c.query(
          "UPDATE email_campaigns SET status='SENDING' WHERE id=$1 AND EXISTS(SELECT 1 FROM email_outbox WHERE campaign_id=$1 AND status='PENDING')",
          [p.id],
        );
      }
      return { ok: true };
    });
  }
  if (!p.campaign) throw new HttpError(400, "Campagne requise");
  const v = p.campaign;
  sanitizeContent(v.subject, mailVariables);
  sanitizeContent(v.body, mailVariables);
  return transaction(async (c) => {
    const s = (
      await c.query(
        "SELECT s.*,i.timezone FROM seasons s JOIN instances i ON i.id=s.instance_id WHERE s.id=$1 AND s.instance_id=$2 FOR UPDATE OF s",
        [v.season_id, u.instance_id],
      )
    ).rows[0];
    if (!s || s.purged_at) throw new HttpError(400, "Saison indisponible");
    let at: string;
    try {
      at =
        v.schedule_mode === "RELATIVE"
          ? DateTime.fromJSDate(new Date(String(s[v.anchor])))
              .setZone(String(s.timezone))
              .plus({ days: v.offset_days })
              .toISO()!
          : localISO(v.scheduled_at, String(s.timezone));
    } catch {
      throw new HttpError(400, "Date invalide");
    }
    if (v.active && +new Date(at) >= +new Date(String(s.purge_at)))
      throw new HttpError(400, "Programmez la communication avant la purge");
    const args = [
      v.name,
      v.subject,
      v.body,
      v.audience,
      v.active,
      v.schedule_mode,
      v.anchor,
      v.offset_days,
      at,
      v.active ? "SCHEDULED" : "DRAFT",
    ];
    if (p.id) {
      const old = (
        await c.query(
          "SELECT * FROM email_campaigns WHERE id=$1 AND instance_id=$2 FOR UPDATE",
          [p.id, u.instance_id],
        )
      ).rows[0];
      if (!old || !["DRAFT", "SCHEDULED"].includes(String(old.status)))
        throw new HttpError(409, "Envoi commencé : campagne verrouillée");
      if (old.season_id !== v.season_id)
        throw new HttpError(400, "Saison de la campagne immuable");
      await c.query(
        "UPDATE email_campaigns SET name=$1,subject=$2,body=$3,audience=$4,active=$5,schedule_mode=$6,anchor=$7,offset_days=$8,scheduled_at=$9,status=$10 WHERE id=$11",
        [...args, p.id],
      );
    } else
      await c.query(
        "INSERT INTO email_campaigns(name,subject,body,audience,active,schedule_mode,anchor,offset_days,scheduled_at,status,instance_id,season_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)",
        [...args, u.instance_id, v.season_id],
      );
    return { ok: true };
  });
}
async function prepareCampaigns(now: Date) {
  const due = (
    await db().query(
      "SELECT id FROM email_campaigns WHERE active=true AND status='SCHEDULED' AND scheduled_at<=$1",
      [now],
    )
  ).rows;
  for (const row of due)
    await transaction(async (c) => {
      const campaign = (
        await c.query(
          "SELECT ec.* FROM email_campaigns ec JOIN seasons s ON s.id=ec.season_id WHERE ec.id=$1 AND ec.status='SCHEDULED' AND s.purged_at IS NULL AND s.purge_at>$2 FOR UPDATE OF ec,s",
          [row.id, now],
        )
      ).rows[0];
      if (!campaign) return;
      await c.query(
        `INSERT INTO email_outbox(user_id,season_id,campaign_id,kind,scheduled_at,idempotency_key)
 SELECT u.id,p.season_id,$1::uuid,'CAMPAIGN',$3,($1::uuid)::text||':'||u.id::text FROM participations p JOIN users u ON u.id=p.user_id WHERE p.season_id=$2 AND NOT u.demo AND NOT p.demo AND u.account_status='ACTIVE' AND u.email_status='VERIFIED'
 AND ($4='ALL' OR ($4='ACTIVE' AND p.activity='ACTIVE') OR p.status=$4) ON CONFLICT DO NOTHING`,
        [campaign.id, campaign.season_id, now, campaign.audience],
      );
      await c.query(
        "UPDATE email_campaigns SET status='SENDING',recipients=(SELECT count(*) FROM email_outbox WHERE campaign_id=$1 AND kind='CAMPAIGN') WHERE id=$1",
        [campaign.id],
      );
    });
}
async function claimJob(now: Date) {
  return transaction(async (c) => {
    const job = (
      await c.query(
        "SELECT * FROM email_outbox WHERE status='PENDING' AND scheduled_at<=$1 ORDER BY scheduled_at,id FOR UPDATE SKIP LOCKED LIMIT 1",
        [now],
      )
    ).rows[0];
    if (!job) return null;
    const u = (
      await c.query("SELECT * FROM users WHERE id=$1 FOR UPDATE", [job.user_id])
    ).rows[0];
    const campaign = job.campaign_id
      ? (
          await c.query(
            "SELECT ec.*,s.purged_at,s.purge_at,s.year,s.opens_at,s.closes_at,s.registrations_open_at,i.public_name,i.territory,i.timezone FROM email_campaigns ec JOIN seasons s ON s.id=ec.season_id JOIN instances i ON i.id=ec.instance_id WHERE ec.id=$1 FOR UPDATE OF ec,s",
            [job.campaign_id],
          )
        ).rows[0]
      : null;
    if (
      !u ||
      u.account_status === "DISABLED" ||
      (job.kind === "INVITE" && u.account_status !== "PENDING_ACTIVATION") ||
      (job.kind === "VERIFY" && u.email_status === "VERIFIED") ||
      (campaign &&
        (u.email_status !== "VERIFIED" ||
          u.demo ||
          campaign.purged_at ||
          +new Date(String(campaign.purge_at)) <= +now))
    ) {
      await c.query("UPDATE email_outbox SET status='CANCELLED' WHERE id=$1", [
        job.id,
      ]);
      return { skip: true };
    }
    await c.query(
      "UPDATE email_outbox SET status='CLAIMED',attempts=attempts+1,claimed_at=$2,retry_safe=false WHERE id=$1",
      [job.id, now],
    );
    let subject = "",
      text = "";
    if (job.kind === "VERIFY" || job.kind === "INVITE") {
      const token = randomBytes(32).toString("hex");
      await c.query(
        "DELETE FROM email_tokens WHERE user_id=$1 AND kind IN('VERIFY','INVITE')",
        [u.id],
      );
      await c.query(
        "INSERT INTO email_tokens(token_hash,user_id,kind,email_hash,expires_at) VALUES($1,$2,$3,$4,$5)",
        [
          hashToken(token),
          u.id,
          job.kind,
          hashToken(String(u.email)),
          new Date(+now + 48 * 3600000),
        ],
      );
      const base = new URL(process.env.APP_ORIGIN ?? "http://localhost:3000");
      base.pathname = job.kind === "VERIFY" ? "/verify" : "/activate";
      base.searchParams.set("token", token);
      subject =
        job.kind === "VERIFY"
          ? "Vérifiez votre email — Halloween Map"
          : "Votre invitation — Halloween Map";
      text = `Bonjour ${u.display_name},\n\n${job.kind === "VERIFY" ? "Vérifiez votre email" : "Activez votre compte et choisissez votre mot de passe"} :\n${base.href}\n\nLien à usage unique, valable 48 heures. Si vous n’êtes pas à l’origine de cette demande, ignorez ce message.`;
    } else if (campaign) {
      const h = (
        await c.query(
          "SELECT name,starts_at FROM participations WHERE user_id=$1 AND season_id=$2",
          [u.id, campaign.season_id],
        )
      ).rows[0];
      if (job.kind === "CAMPAIGN" && !h) {
        await c.query(
          "UPDATE email_outbox SET status='CANCELLED' WHERE id=$1",
          [job.id],
        );
        return { skip: true };
      }
      const fmt = (value: unknown) =>
        DateTime.fromJSDate(new Date(String(value)))
          .setZone(String(campaign.timezone))
          .setLocale("fr")
          .toFormat("dd LLLL yyyy à HH:mm");
      const vars = {
        name: String(u.display_name),
        territory: String(campaign.territory),
        event_name: String(campaign.public_name),
        season_year: String(campaign.year),
        registration_date: fmt(campaign.registrations_open_at),
        map_open_date: fmt(campaign.opens_at),
        map_close_date: fmt(campaign.closes_at),
        house_name: String(h?.name ?? "Maison de test"),
        house_start_time: h ? fmt(h.starts_at) : fmt(campaign.opens_at),
      };
      subject = interpolate(String(campaign.subject), vars).replace(
        /[\r\n]/g,
        " ",
      );
      text = interpolate(String(campaign.body), vars);
    }
    return {
      skip: false,
      id: String(job.id),
      mail: {
        to: String(u.email),
        subject,
        text,
        messageId: `<${job.id}@halloween-map.local>`,
      },
    };
  });
}
// Persist a claim before SMTP. An unknown outcome is never automatically retried.
export async function dispatchEmails(now = new Date(), send?: Sender) {
  if (!send && !smtpAvailable()) return;
  const sender = send ?? smtpSender();
  await prepareCampaigns(now);
  await db().query(
    "UPDATE email_outbox SET status='FAILED',last_error='SMTP_UNCERTAIN',retry_safe=false WHERE status='CLAIMED' AND claimed_at<$1",
    [new Date(+now - 10 * 60000)],
  );
  for (let n = 0; n < 20; n++) {
    const job = await claimJob(now);
    if (!job) break;
    if (job.skip) continue;
    try {
      await sender(job.mail!);
      await db().query(
        "UPDATE email_outbox SET status='SENT',sent_at=$2,last_error=NULL WHERE id=$1 AND status='CLAIMED'",
        [job.id, now],
      );
    } catch (error) {
      const code = (error as { code?: string }).code;
      const safe =
        code === "ECONNREFUSED" || code === "ENOTFOUND" || code === "EAI_AGAIN";
      await db().query(
        "UPDATE email_outbox SET status=CASE WHEN $2 AND attempts<3 THEN 'PENDING' ELSE 'FAILED' END,scheduled_at=$3,retry_safe=$2,last_error=$4 WHERE id=$1 AND status='CLAIMED'",
        [
          job.id,
          safe,
          new Date(+now + 5 * 60000),
          safe ? "SMTP_CONNECT_FAILED" : "SMTP_UNCERTAIN",
        ],
      );
    }
    if (!send) await new Promise((resolve) => setTimeout(resolve, 250));
  }
  await db()
    .query(`UPDATE email_campaigns ec SET sent=x.sent,errors=x.errors,status=CASE WHEN x.pending>0 THEN 'SENDING' WHEN x.errors>0 THEN 'FAILED' ELSE 'SENT' END FROM
 (SELECT campaign_id,count(*) FILTER(WHERE status='SENT')::int sent,count(*) FILTER(WHERE status='FAILED')::int errors,count(*) FILTER(WHERE status IN('PENDING','CLAIMED'))::int pending FROM email_outbox WHERE kind='CAMPAIGN' GROUP BY campaign_id) x WHERE ec.id=x.campaign_id AND ec.status IN('SENDING','FAILED')`);
  await db().query(
    "UPDATE email_campaigns SET status='SENT' WHERE status='SENDING' AND recipients=0",
  );
}
