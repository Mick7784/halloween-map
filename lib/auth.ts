import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { db, type Database } from "./db";
import { can, defaultRoles, type User } from "./domain";
export const SESSION_SECONDS = 12 * 3600;
let pendingPasswordChecks = 0;
const scrypt = (password: string, salt: string) => {
  if (pendingPasswordChecks >= 12)
    throw new HttpError(
      429,
      "Serveur occupé. Réessayez dans quelques instants.",
    );
  pendingPasswordChecks++;
  return new Promise<Buffer>((resolve, reject) =>
    scryptCallback(
      password,
      salt,
      64,
      { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 },
      (error, key) => {
        pendingPasswordChecks--;
        return error ? reject(error) : resolve(key);
      },
    ),
  );
};
export const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = await scrypt(password, salt);
  return `scrypt:${salt}:${hash.toString("hex")}`;
}
export async function verifyPassword(password: string, stored: string) {
  const [, salt, digest] = stored.split(":");
  if (!salt || !digest) return false;
  const candidate = await scrypt(password, salt);
  const expected = Buffer.from(digest, "hex");
  return (
    expected.length === candidate.length && timingSafeEqual(candidate, expected)
  );
}
export async function createSession(userId: string, client: Database = db()) {
  const token = randomBytes(32).toString("hex");
  await client.query(
    "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '12 hours')",
    [hashToken(token), userId],
  );
  return token;
}
export async function getUser(
  token?: string,
  adminActivity = false,
): Promise<User | null> {
  if (!token) return null;
  const { rows } = await db().query(
    `SELECT u.id,u.instance_id,u.email,u.display_name,u.kind,u.role_id,u.email_status,u.email_verified_at,u.account_status,u.admin_permissions,r.name role_name,
    (s.admin_last_activity_at>now()-interval '60 minutes') admin_fresh
    FROM sessions s JOIN users u ON u.id=s.user_id LEFT JOIN roles r ON r.id=u.role_id AND r.instance_id=u.instance_id
    WHERE s.token_hash=$1 AND s.expires_at>now() AND s.created_at>now()-interval '12 hours' AND u.account_status='ACTIVE'`,
    [hashToken(token)],
  );
  if (!rows[0]) return null;
  const row = rows[0];
  const grants =
    row.role_name === "SUPER_ADMIN"
      ? [...defaultRoles.SUPER_ADMIN]
      : row.role_name === "ADMIN"
        ? [
            "admin.access",
            ...((row.admin_permissions as string[] | null) ?? []),
          ].filter(
            (p) =>
              !["roles.manage", "settings.manage", "settings.read"].includes(p),
          )
        : [];
  let fresh = !!row.admin_fresh;
  if (adminActivity && fresh && grants.length) {
    const refreshed = await db().query(
      "UPDATE sessions SET admin_last_activity_at=now() WHERE token_hash=$1 AND admin_last_activity_at>now()-interval '60 minutes' AND expires_at>now() AND created_at>now()-interval '12 hours' RETURNING token_hash",
      [hashToken(token)],
    );
    fresh = refreshed.rows.length > 0;
  }
  return {
    ...row,
    admin_permissions: undefined,
    permissions: fresh ? grants : [],
  } as unknown as User;
}
export async function confirmAdminPassword(user: User, password: unknown) {
  requirePermission(user, "admin.access");
  await rateLimit("admin-confirm:" + user.id, 5);
  const row = (
    await db().query(
      "SELECT password_hash FROM users WHERE id=$1 AND instance_id=$2 AND account_status='ACTIVE'",
      [user.id, user.instance_id],
    )
  ).rows[0];
  if (
    typeof password !== "string" ||
    password.length > 128 ||
    !row ||
    !(await verifyPassword(password, String(row.password_hash ?? "")))
  )
    throw new HttpError(
      403,
      "Reconfirmez votre mot de passe pour cette action sensible",
    );
  await db().query("DELETE FROM rate_limits WHERE key=$1", [
    hashToken("admin-confirm:" + user.id),
  ]);
}
export async function rateLimit(key: string, max = 10) {
  const result = await db().query(
    `INSERT INTO rate_limits(key,hits,reset_at) VALUES($1,1,now()+interval '15 minutes')
    ON CONFLICT(key) DO UPDATE SET hits=CASE WHEN rate_limits.reset_at<now() THEN 1 ELSE rate_limits.hits+1 END,
    reset_at=CASE WHEN rate_limits.reset_at<now() THEN now()+interval '15 minutes' ELSE rate_limits.reset_at END RETURNING hits`,
    [hashToken(key)],
  );
  if (Number(result.rows[0].hits) === max + 1) {
    const identifier = key.startsWith("login:")
      ? key.slice(6)
      : key.startsWith("admin-confirm:")
        ? key.slice(14)
        : null;
    if (identifier)
      await db().query(
        `INSERT INTO audit_logs(instance_id,action,target_id) SELECT u.instance_id,'security.rate_limited',u.id FROM users u WHERE ${key.startsWith("login:") ? "u.email=$1" : "u.id::text=$1"} AND NOT EXISTS(SELECT 1 FROM audit_logs a WHERE a.target_id=u.id AND a.action='security.rate_limited' AND a.created_at>now()-interval '15 minutes')`,
        [identifier],
      );
  }
  if (Number(result.rows[0].hits) > max)
    throw new HttpError(429, "Trop de tentatives. Réessayez dans 15 minutes.");
}
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function requirePermission(user: User | null, permission: string) {
  if (!user) throw new HttpError(401, "Connexion requise");
  if (
    permission === "admin.access" &&
    ["ADMIN", "SUPER_ADMIN"].includes(user.role_name ?? "") &&
    !user.permissions.includes("admin.access")
  )
    throw new HttpError(
      403,
      "Accès administrateur expiré après 60 minutes d’inactivité. Reconnectez-vous.",
    );
  if (!can(user, permission)) throw new HttpError(403, "Accès non autorisé");
  return user;
}
