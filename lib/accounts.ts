import { selectedSeason } from "./season-context";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { db, transaction, type Database } from "./db";
import {
  createSession,
  hashPassword,
  hashToken,
  HttpError,
  rateLimit,
  requirePermission,
  verifyPassword,
} from "./auth";
import { credentials } from "./validation";
import { defaultRoles, type User } from "./domain";
export async function queueIdentity(
  client: Database,
  userId: string,
  kind: "VERIFY" | "INVITE" | "RESET",
) {
  await client.query(
    "DELETE FROM email_tokens WHERE user_id=$1 AND (kind=$2 OR ($2<>'RESET' AND kind IN('VERIFY','INVITE','ACTIVATE')))",
    [userId, kind],
  );
  await client.query(
    "UPDATE email_outbox SET status='CANCELLED' WHERE user_id=$1 AND kind=$2 AND status='PENDING'",
    [userId, kind],
  );
  await client.query(
    "INSERT INTO email_outbox(user_id,kind,idempotency_key) VALUES($1,$2,$3)",
    [userId, kind, randomBytes(24).toString("hex")],
  );
}
export async function requestPasswordReset(input: unknown) {
  const p = z.object({ email: credentials.shape.email }).parse(input);
  await rateLimit("password-reset:" + p.email, 3);
  await transaction(async (c) => {
    const u = (
      await c.query(
        "SELECT id FROM users WHERE email=$1 AND account_status='ACTIVE' AND password_hash IS NOT NULL FOR UPDATE",
        [p.email],
      )
    ).rows[0];
    if (u) await queueIdentity(c, String(u.id), "RESET");
  });
  return {
    ok: true,
    message:
      "Si un compte correspond à cette adresse, un lien de récupération vous sera envoyé.",
  };
}
export async function resetPassword(input: unknown) {
  const p = z
    .object({
      token: z.string().regex(/^[a-f0-9]{64}$/),
      password: credentials.shape.password,
    })
    .parse(input);
  await rateLimit("reset-token:" + hashToken(p.token), 5);
  const hash = await hashPassword(p.password);
  return transaction(async (c) => {
    const t = (
      await c.query(
        "SELECT t.*,u.email FROM email_tokens t JOIN users u ON u.id=t.user_id WHERE t.token_hash=$1 AND t.kind='RESET' AND t.expires_at>now() AND u.account_status='ACTIVE' FOR UPDATE OF t,u",
        [hashToken(p.token)],
      )
    ).rows[0];
    if (!t || t.email_hash !== hashToken(String(t.email)))
      throw new HttpError(400, "Lien invalide ou expiré");
    await c.query("UPDATE users SET password_hash=$1 WHERE id=$2", [
      hash,
      t.user_id,
    ]);
    await c.query(
      "DELETE FROM email_tokens WHERE user_id=$1 AND kind='RESET'",
      [t.user_id],
    );
    await c.query(
      "UPDATE email_outbox SET status='CANCELLED' WHERE user_id=$1 AND kind='RESET' AND status='PENDING'",
      [t.user_id],
    );
    await c.query("DELETE FROM sessions WHERE user_id=$1", [t.user_id]);
    return { ok: true };
  });
}
export async function createAccount(input: unknown) {
  const p = credentials
    .extend({ display_name: z.string().trim().min(1).max(80) })
    .parse(input);
  await rateLimit("register:" + p.email, 5);
  const hash = await hashPassword(p.password);
  return transaction(async (c) => {
    const i = (await c.query("SELECT id FROM instances LIMIT 1")).rows[0];
    if (!i) throw new HttpError(409, "Instance non configurée");
    const r = (
      await c.query(
        "SELECT id FROM roles WHERE instance_id=$1 AND name='USER'",
        [i.id],
      )
    ).rows[0];
    const u = (
      await c.query(
        "INSERT INTO users(instance_id,email,display_name,password_hash,kind,role_id) VALUES($1,$2,$3,$4,'PARTICIPANT',$5) RETURNING id",
        [i.id, p.email, p.display_name, hash, r.id],
      )
    ).rows[0];
    await queueIdentity(c, String(u.id), "VERIFY");
    return { token: await createSession(String(u.id), c) };
  });
}
export async function resendIdentity(user: User | null, id?: string) {
  if (!user) throw new HttpError(401, "Connexion requise");
  if (id) {
    requirePermission(user, "admin.access");
    requirePermission(user, "users.manage");
  }
  const target = id ?? user.id;
  await rateLimit("identity:" + target, 1);
  return transaction(async (c) => {
    const u = (
      await c.query(
        "SELECT * FROM users WHERE id=$1 AND instance_id=$2 FOR UPDATE",
        [target, user.instance_id],
      )
    ).rows[0];
    if (!u || u.account_status === "DISABLED")
      throw new HttpError(400, "Compte indisponible");
    if (
      u.email_status === "VERIFIED" &&
      u.account_status !== "PENDING_ACTIVATION"
    )
      throw new HttpError(400, "Email déjà vérifié");
    await queueIdentity(
      c,
      target,
      u.account_status === "PENDING_ACTIVATION" ? "INVITE" : "VERIFY",
    );
    return { ok: true };
  });
}
export async function consumeIdentity(
  token: string,
  kind: "VERIFY" | "INVITE",
) {
  if (!/^[a-f0-9]{64}$/.test(token))
    throw new HttpError(400, "Lien invalide ou expiré");
  await rateLimit("email-link:" + hashToken(token), 10);
  return transaction(async (c) => {
    const t = (
      await c.query(
        "SELECT t.*,u.email,u.account_status FROM email_tokens t JOIN users u ON u.id=t.user_id WHERE token_hash=$1 AND t.kind=$2 AND expires_at>now() FOR UPDATE OF t,u",
        [hashToken(token), kind],
      )
    ).rows[0];
    if (
      !t ||
      t.account_status === "DISABLED" ||
      t.email_hash !== hashToken(String(t.email))
    )
      throw new HttpError(400, "Lien invalide ou expiré");
    await c.query("DELETE FROM email_tokens WHERE user_id=$1", [t.user_id]);
    await c.query(
      "UPDATE users SET email_status='VERIFIED',email_verified_at=now() WHERE id=$1",
      [t.user_id],
    );
    if (kind === "VERIFY")
      return {
        token: await createSession(String(t.user_id), c),
        activation: false,
      };
    const activation = randomBytes(32).toString("hex");
    await c.query(
      "INSERT INTO email_tokens(token_hash,user_id,kind,email_hash,expires_at) VALUES($1,$2,'ACTIVATE',$3,now()+interval '30 minutes')",
      [hashToken(activation), t.user_id, t.email_hash],
    );
    return { token: activation, activation: true };
  });
}
export async function activateAccount(
  token: string | undefined,
  input: unknown,
) {
  const p = z.object({ password: credentials.shape.password }).parse(input);
  await rateLimit("activation:" + hashToken(token ?? ""), 10);
  const hash = await hashPassword(p.password);
  return transaction(async (c) => {
    const t = (
      await c.query(
        "SELECT t.*,u.email FROM email_tokens t JOIN users u ON u.id=t.user_id WHERE token_hash=$1 AND t.kind='ACTIVATE' AND expires_at>now() AND u.account_status='PENDING_ACTIVATION' FOR UPDATE OF t,u",
        [hashToken(token ?? "")],
      )
    ).rows[0];
    if (!t || t.email_hash !== hashToken(String(t.email)))
      throw new HttpError(400, "Invitation invalide ou expirée");
    await c.query("DELETE FROM email_tokens WHERE user_id=$1", [t.user_id]);
    await c.query(
      "UPDATE users SET password_hash=$1,account_status='ACTIVE' WHERE id=$2",
      [hash, t.user_id],
    );
    return { token: await createSession(String(t.user_id), c) };
  });
}
async function protectedAccount(
  c: Database,
  id: string,
  instanceId: string,
  actor: User | null,
) {
  await c.query("SELECT id FROM instances WHERE id=$1 FOR UPDATE", [
    instanceId,
  ]);
  const old = (
    await c.query(
      "SELECT u.*,r.name role_name FROM users u LEFT JOIN roles r ON r.id=u.role_id WHERE u.id=$1 AND u.instance_id=$2 FOR UPDATE OF u",
      [id, instanceId],
    )
  ).rows[0];
  if (!old) throw new HttpError(404, "Compte introuvable");
  if (actor && actor.role_name !== "SUPER_ADMIN" && old.role_name !== "USER")
    throw new HttpError(403, "Compte protégé");
  if (old.role_name === "SUPER_ADMIN") {
    const n = (
      await c.query(
        "SELECT count(*)::int n FROM users u JOIN roles r ON r.id=u.role_id WHERE u.instance_id=$1 AND r.name='SUPER_ADMIN' AND u.account_status='ACTIVE' AND u.id<>$2",
        [instanceId, id],
      )
    ).rows[0];
    if (!Number(n.n))
      throw new HttpError(403, "Conservez au moins un Super Admin actif");
  }
  return old;
}
export async function accountAction(user: User | null, input: unknown) {
  if (!user) throw new HttpError(401, "Connexion requise");
  const p = z
    .object({
      action: z.enum(["name", "email", "password", "delete", "resend"]),
      display_name: z.string().trim().min(1).max(80).optional(),
      email: credentials.shape.email.optional(),
      current_password: z.string().max(128).optional(),
      password: credentials.shape.password.optional(),
      confirm: z.string().optional(),
    })
    .parse(input);
  if (p.action === "resend") return resendIdentity(user);
  if (["email", "password"].includes(p.action))
    await rateLimit("account-change:" + user.id, 5);
  return transaction(async (c) => {
    const old = (
      await c.query("SELECT * FROM users WHERE id=$1 FOR UPDATE", [user.id])
    ).rows[0];
    if (p.action === "name") {
      if (!p.display_name) throw new HttpError(400, "Nom requis");
      await c.query("UPDATE users SET display_name=$1 WHERE id=$2", [
        p.display_name,
        user.id,
      ]);
    } else {
      if (
        !(await verifyPassword(
          p.current_password ?? "",
          String(old.password_hash ?? ""),
        ))
      )
        throw new HttpError(403, "Mot de passe actuel incorrect");
      if (p.action === "email") {
        if (!p.email) throw new HttpError(400, "Email requis");
        await c.query(
          "UPDATE users SET email=$1,email_status='UNVERIFIED',email_verified_at=NULL WHERE id=$2",
          [p.email, user.id],
        );
        await c.query(
          "UPDATE participations SET legacy_imported=false WHERE user_id=$1",
          [user.id],
        );
        await c.query("DELETE FROM sessions WHERE user_id=$1", [user.id]);
        await queueIdentity(c, user.id, "VERIFY");
        return { token: await createSession(user.id, c) };
      }
      if (p.action === "password") {
        if (!p.password) throw new HttpError(400, "Mot de passe requis");
        await c.query("UPDATE users SET password_hash=$1 WHERE id=$2", [
          await hashPassword(p.password),
          user.id,
        ]);
        await c.query("DELETE FROM sessions WHERE user_id=$1", [user.id]);
        return { token: await createSession(user.id, c) };
      }
      if (p.action === "delete") {
        if (p.confirm !== "SUPPRIMER MON COMPTE")
          throw new HttpError(400, "Confirmation requise");
        await protectedAccount(c, user.id, user.instance_id, null);
        await c.query(
          "DELETE FROM audit_logs WHERE instance_id=$1 AND (actor_id=$2 OR target_id=$2 OR target_id IN(SELECT id FROM participations WHERE user_id=$2))",
          [user.instance_id, user.id],
        );
        await c.query("DELETE FROM users WHERE id=$1", [user.id]);
        return { deleted: true };
      }
    }
    return { ok: true };
  });
}
export async function adminUsers(
  user: User | null,
  seasonId?: string,
  eligible = false,
): Promise<Record<string, unknown>[]> {
  const u = requirePermission(user, "admin.access");
  requirePermission(u, "users.read");
  const context = await selectedSeason(u, seasonId);
  return (
    await db().query(
      `SELECT u.id,u.email,u.display_name,u.email_status,u.email_verified_at,u.account_status,u.created_at,u.last_login_at,u.role_id,u.created_for_season_id,COALESCE(r.name,'USER') role_name,
 (SELECT row_to_json(p) FROM participations p WHERE p.season_id=$2 AND p.user_id=u.id) participation,
 (SELECT COALESCE(json_agg(x),'[]'::json) FROM (SELECT kind,status,scheduled_at,sent_at,last_error FROM email_outbox WHERE user_id=u.id AND (season_id=$2 OR (season_id IS NULL AND (u.created_for_season_id=$2 OR u.created_for_season_id IS NULL))) ORDER BY created_at DESC LIMIT 50) x) communications
 FROM users u LEFT JOIN roles r ON r.id=u.role_id WHERE u.instance_id=$1 AND (CASE WHEN $3::boolean THEN u.created_for_season_id=$2 ELSE u.created_for_season_id IS NULL AND ($4::boolean OR EXISTS(SELECT 1 FROM participations p WHERE p.user_id=u.id AND p.season_id=$2) OR NOT EXISTS(SELECT 1 FROM participations p WHERE p.user_id=u.id)) END) ORDER BY u.created_at`,
      [u.instance_id, context?.id ?? null, !!context?.is_test, eligible],
    )
  ).rows.map((row) => ({
    ...row,
    permissions: [...(defaultRoles[String(row.role_name)] ?? [])],
  }));
}
export async function adminUserAction(user: User | null, input: unknown) {
  const u = requirePermission(user, "admin.access");
  requirePermission(u, "users.manage");
  const p = z
    .object({
      action: z.enum([
        "invite",
        "edit",
        "disable",
        "enable",
        "delete",
        "resend",
      ]),
      id: z.uuid().optional(),
      email: credentials.shape.email.optional(),
      display_name: z.string().trim().min(1).max(80).optional(),
      role_id: z.uuid().optional(),
      confirm: z.string().optional(),
      seasonId: z.uuid().optional(),
      without_invitation: z.boolean().default(false),
      password: credentials.shape.password.optional(),
    })
    .parse(input);
  const context = await selectedSeason(u, p.seasonId);
  if (
    p.without_invitation &&
    (p.action !== "invite" ||
      !context?.is_test ||
      u.role_name !== "SUPER_ADMIN")
  )
    throw new HttpError(
      403,
      "Création sans invitation réservée au Super Admin en saison TEST",
    );
  if (p.id) {
    const allowed = (await adminUsers(u, p.seasonId)).some(
      (row) => row.id === p.id,
    );
    if (!allowed)
      throw new HttpError(404, "Utilisateur absent de cette saison");
  }
  if (p.action === "resend") {
    if (!p.id) throw new HttpError(400, "Compte requis");
    return resendIdentity(u, p.id);
  }
  if (p.action === "invite") await rateLimit("invite:" + u.id, 20);
  if (p.id === u.id)
    throw new HttpError(
      400,
      "Utilisez Mon compte pour votre identité ; vos accès sont protégés",
    );
  return transaction(async (c) => {
    if (p.id) await protectedAccount(c, p.id, u.instance_id, u);
    let role: Record<string, unknown> | undefined;
    if (p.role_id) {
      role = (
        await c.query("SELECT * FROM roles WHERE id=$1 AND instance_id=$2", [
          p.role_id,
          u.instance_id,
        ])
      ).rows[0];
      if (!role) throw new HttpError(400, "Profil invalide");
    }
    if (u.role_name !== "SUPER_ADMIN" && role && role.name !== "USER")
      throw new HttpError(
        403,
        "Seul le Super Admin peut attribuer un rôle administrateur",
      );
    if (p.action === "delete" && u.role_name !== "SUPER_ADMIN")
      throw new HttpError(403, "Super Admin requis");
    if (p.action === "invite") {
      if (!p.email || !p.display_name || !p.role_id)
        throw new HttpError(400, "Nom, email et profil requis");
      if (context?.is_test && role?.name !== "USER")
        throw new HttpError(
          403,
          "Les comptes de saison TEST utilisent le profil Utilisateur",
        );
      if (p.without_invitation && !p.password)
        throw new HttpError(400, "Mot de passe requis");
      const target = (
        await c.query(
          "INSERT INTO users(instance_id,email,display_name,role_id,kind,account_status,email_status,email_verified_at,password_hash,created_for_season_id) VALUES($1,$2,$3,$4,'PARTICIPANT',$5,$6,CASE WHEN $7 THEN now() ELSE NULL END,$8,$9) RETURNING id",
          [
            u.instance_id,
            p.email,
            p.display_name,
            p.role_id,
            p.without_invitation ? "ACTIVE" : "PENDING_ACTIVATION",
            p.without_invitation ? "VERIFIED" : "UNVERIFIED",
            p.without_invitation,
            p.without_invitation ? await hashPassword(p.password!) : null,
            context?.is_test ? context.id : null,
          ],
        )
      ).rows[0];
      if (!p.without_invitation)
        await queueIdentity(c, String(target.id), "INVITE");
      await c.query(
        "INSERT INTO audit_logs(instance_id,actor_id,action,target_id,season_id) VALUES($1,$2,$3,$4,$5)",
        [
          u.instance_id,
          u.id,
          p.without_invitation ? "user.created" : "user.invite",
          target.id,
          context?.id ?? null,
        ],
      );
      return { ok: true, id: target.id };
    } else {
      if (!p.id) throw new HttpError(400, "Compte requis");
      if (p.action === "edit") {
        const old = (
          await c.query("SELECT email FROM users WHERE id=$1", [p.id])
        ).rows[0];
        await c.query(
          "UPDATE users SET display_name=COALESCE($1,display_name),email=COALESCE($2,email),role_id=COALESCE($3,role_id) WHERE id=$4",
          [p.display_name, p.email, p.role_id, p.id],
        );
        if (p.email && p.email !== old.email) {
          await c.query(
            "UPDATE users SET email_status='UNVERIFIED',email_verified_at=NULL WHERE id=$1",
            [p.id],
          );
          await c.query(
            "UPDATE participations SET legacy_imported=false WHERE user_id=$1",
            [p.id],
          );
          await queueIdentity(c, p.id, "VERIFY");
        }
        await c.query("DELETE FROM sessions WHERE user_id=$1", [p.id]);
      } else if (p.action === "delete") {
        if (p.confirm !== "SUPPRIMER CE COMPTE")
          throw new HttpError(400, "Confirmation requise");
        await c.query(
          "DELETE FROM audit_logs WHERE actor_id=$1 OR target_id=$1 OR target_id IN(SELECT id FROM participations WHERE user_id=$1)",
          [p.id],
        );
        await c.query("DELETE FROM users WHERE id=$1", [p.id]);
      } else {
        await c.query(
          "UPDATE users SET account_status=CASE WHEN $1='disable' THEN 'DISABLED' WHEN password_hash IS NULL THEN 'PENDING_ACTIVATION' ELSE 'ACTIVE' END WHERE id=$2",
          [p.action, p.id],
        );
        await c.query("DELETE FROM sessions WHERE user_id=$1", [p.id]);
      }
    }
    await c.query(
      "INSERT INTO audit_logs(instance_id,actor_id,action,target_id,season_id) VALUES($1,$2,$3,$4,$5)",
      [
        u.instance_id,
        u.id,
        "user." + p.action,
        p.id ?? null,
        context?.id ?? null,
      ],
    );
    return { ok: true };
  });
}
