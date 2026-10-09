import { db, type Database, transaction } from "./db";
import { z } from "zod";
import { HttpError, rateLimit, requirePermission } from "./auth";
import type { User } from "./domain";
import { sanitizeContent } from "./content";
import {
  messageKinds,
  messageDefaults,
  messageVariables,
  renderMessage,
  templateExamples,
  type MessageKind,
  type MessageTemplate,
} from "./message-templates";
export async function messageTemplate(
  instanceId: string,
  kind: MessageKind,
  c: Database = db(),
): Promise<MessageTemplate> {
  const row = (
    await c.query(
      "SELECT subject,body FROM message_templates WHERE instance_id=$1 AND kind=$2",
      [instanceId, kind],
    )
  ).rows[0];
  return row
    ? { subject: String(row.subject), body: String(row.body) }
    : messageDefaults[kind];
}
export async function refusalPreview(
  user: User | null,
  id: string,
  reason: string,
) {
  const u = requirePermission(user, "admin.access");
  requirePermission(u, "participants.edit");
  z.uuid().parse(id);
  z.string().max(500).parse(reason);
  const h = (
    await db().query(
      "SELECT p.*,s.year,s.opens_at,s.closes_at,s.registrations_open_at,i.timezone,i.public_name,i.territory,u.display_name FROM participations p JOIN seasons s ON s.id=p.season_id JOIN instances i ON i.id=p.instance_id JOIN users u ON u.id=p.user_id WHERE p.id=$1 AND p.instance_id=$2",
      [id, u.instance_id],
    )
  ).rows[0];
  if (!h) throw new HttpError(404, "Maison introuvable");
  const fmt = (value: unknown) =>
    new Intl.DateTimeFormat("fr-FR", {
      dateStyle: "long",
      timeStyle: "short",
      timeZone: String(h.timezone),
    }).format(new Date(String(value)));
  return renderMessage(await messageTemplate(u.instance_id, "HOUSE_REFUSED"), {
    ...templateExamples,
    name: String(h.display_name),
    house_name: String(h.name),
    event_name: String(h.public_name),
    territory: String(h.territory),
    season_year: String(h.year),
    map_open_date: fmt(h.opens_at),
    map_close_date: fmt(h.closes_at),
    registration_date: fmt(h.registrations_open_at),
    house_start_time: fmt(h.starts_at),
    refusal_reason: reason,
  });
}
export async function templatesAdmin(user: User | null) {
  const u = requirePermission(user, "admin.access");
  requirePermission(u, "communications.read");
  return Object.fromEntries(
    await Promise.all(
      messageKinds.map(async (kind) => [
        kind,
        await messageTemplate(u.instance_id, kind),
      ]),
    ),
  );
}
export async function templateAction(
  user: User | null,
  input: unknown,
  send?: (mail: {
    to: string;
    subject: string;
    text: string;
    html: string;
    messageId: string;
  }) => Promise<void>,
) {
  const u = requirePermission(user, "admin.access");
  requirePermission(u, "communications.manage");
  const p = z
    .object({
      action: z.enum(["save", "reset", "test"]),
      kind: z.enum(messageKinds),
      template: z
        .object({
          subject: z
            .string()
            .trim()
            .min(1)
            .max(150)
            .refine((v) => !/[\r\n]/.test(v)),
          body: z.string().trim().min(1).max(5000),
        })
        .optional(),
    })
    .parse(input);
  const template = p.template ?? (await messageTemplate(u.instance_id, p.kind));
  sanitizeContent(template.subject, messageVariables);
  sanitizeContent(template.body, messageVariables);
  if (p.action === "test") {
    if (u.role_name !== "SUPER_ADMIN")
      throw new HttpError(403, "Super Admin requis");
    const recipient = (
      await db().query(
        "SELECT email FROM users WHERE id=$1 AND instance_id=$2 AND email_status='VERIFIED' AND account_status='ACTIVE'",
        [u.id, u.instance_id],
      )
    ).rows[0];
    if (
      !recipient ||
      /^test-[a-f0-9]{32}@example\.invalid$/.test(String(recipient.email))
    )
      throw new HttpError(403, "Adresse de compte vérifiée requise");
    await rateLimit("template-test:" + u.id, 3);
    if (!send) throw new HttpError(503, "SMTP non configuré");
    const mail = renderMessage(
      template,
      templateExamples,
      ["VERIFY", "INVITE", "RESET"].includes(p.kind)
        ? { label: "Exemple inactif", url: "https://example.invalid/preview" }
        : undefined,
    );
    await send({
      ...mail,
      to: String(recipient.email),
      subject: "[TEST] " + mail.subject,
      messageId: `<test-${crypto.randomUUID()}@halloween-map.local>`,
    });
    await db().query(
      "INSERT INTO audit_logs(instance_id,actor_id,action) VALUES($1,$2,'email.test.sent')",
      [u.instance_id, u.id],
    );
    return {
      ok: true,
      message:
        "Message accepté par SMTP. La livraison en boîte n’est pas confirmée.",
    };
  }
  return transaction(async (c) => {
    if (p.action === "reset")
      await c.query(
        "DELETE FROM message_templates WHERE instance_id=$1 AND kind=$2",
        [u.instance_id, p.kind],
      );
    else {
      if (!p.template) throw new HttpError(400, "Modèle requis");
      await c.query(
        "INSERT INTO message_templates(instance_id,kind,subject,body) VALUES($1,$2,$3,$4) ON CONFLICT(instance_id,kind) DO UPDATE SET subject=excluded.subject,body=excluded.body,updated_at=now()",
        [u.instance_id, p.kind, template.subject, template.body],
      );
    }
    await c.query(
      "INSERT INTO audit_logs(instance_id,actor_id,action) VALUES($1,$2,$3)",
      [u.instance_id, u.id, "email.template." + p.action],
    );
    return { ok: true };
  });
}
