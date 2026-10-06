import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { db, type Database } from "./db";
import { can, defaultRoles, type User } from "./domain";
const scrypt = (password: string, salt: string) =>
  new Promise<Buffer>((resolve, reject) =>
    scryptCallback(
      password,
      salt,
      64,
      { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 },
      (error, key) => (error ? reject(error) : resolve(key)),
    ),
  );
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
    "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '7 days')",
    [hashToken(token), userId],
  );
  return token;
}
export async function getUser(token?: string): Promise<User | null> {
  if (!token) return null;
  const { rows } = await db().query(
    `SELECT u.id,u.instance_id,u.email,u.display_name,u.kind,u.role_id,u.email_status,u.email_verified_at,u.account_status,u.created_for_season_id,r.name role_name
    FROM sessions s JOIN users u ON u.id=s.user_id LEFT JOIN roles r ON r.id=u.role_id AND r.instance_id=u.instance_id
    WHERE s.token_hash=$1 AND s.expires_at>now() AND u.account_status='ACTIVE'`,
    [hashToken(token)],
  );
  if (!rows[0]) return null;
  return {
    ...rows[0],
    permissions: [...(defaultRoles[String(rows[0].role_name ?? "USER")] ?? [])],
  } as unknown as User;
}
export async function rateLimit(key: string, max = 10) {
  const result = await db().query(
    `INSERT INTO rate_limits(key,hits,reset_at) VALUES($1,1,now()+interval '15 minutes')
    ON CONFLICT(key) DO UPDATE SET hits=CASE WHEN rate_limits.reset_at<now() THEN 1 ELSE rate_limits.hits+1 END,
    reset_at=CASE WHEN rate_limits.reset_at<now() THEN now()+interval '15 minutes' ELSE rate_limits.reset_at END RETURNING hits`,
    [hashToken(key)],
  );
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
  if (!can(user, permission)) throw new HttpError(403, "Accès non autorisé");
  return user;
}
