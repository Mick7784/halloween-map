import { randomBytes } from "node:crypto";
import { db, transaction, type Database } from "./db";
import { hashToken, HttpError } from "./auth";
export const setupCookie = "halloween_setup";
export async function ensureBootstrap(rotate = false) {
  return transaction(async (c) => {
    await c.query("SELECT pg_advisory_xact_lock(710031)");
    if ((await c.query("SELECT id FROM instances LIMIT 1")).rows.length)
      return null;
    if (
      !rotate &&
      (await c.query("SELECT singleton FROM bootstrap")).rows.length
    )
      return null;
    const secret =
      process.env.SETUP_TOKEN || randomBytes(32).toString("base64url");
    await c.query(
      "INSERT INTO bootstrap(secret_hash) VALUES($1) ON CONFLICT(singleton) DO UPDATE SET secret_hash=$1,consumed_at=NULL,invalidated_at=NULL",
      [hashToken(secret)],
    );
    await c.query("DELETE FROM setup_sessions");
    return `${(process.env.APP_ORIGIN || "http://localhost:3000").replace(/\/$/, "")}/setup?bootstrap=${encodeURIComponent(secret)}`;
  });
}
export async function exchangeBootstrap(secret: string) {
  return transaction(async (c) => {
    await c.query("SELECT pg_advisory_xact_lock(710031)");
    if ((await c.query("SELECT id FROM instances LIMIT 1")).rows.length)
      throw new HttpError(409, "Configuration terminée");
    const result = await c.query(
      "UPDATE bootstrap SET consumed_at=now() WHERE secret_hash=$1 AND consumed_at IS NULL AND invalidated_at IS NULL RETURNING singleton",
      [hashToken(secret)],
    );
    if (!result.rows.length)
      throw new HttpError(403, "Lien invalide ou déjà utilisé");
    const token = randomBytes(32).toString("base64url");
    await c.query(
      "INSERT INTO setup_sessions(token_hash,expires_at) VALUES($1,now()+interval '2 hours')",
      [hashToken(token)],
    );
    return token;
  });
}
export async function setupAuthorized(token?: string, c: Database = db()) {
  if (!token) return false;
  return !!(
    await c.query(
      "SELECT token_hash FROM setup_sessions WHERE token_hash=$1 AND expires_at>now()",
      [hashToken(token)],
    )
  ).rows.length;
}
export async function finishBootstrap(c: Database) {
  await c.query("UPDATE bootstrap SET invalidated_at=now()");
  await c.query("DELETE FROM setup_sessions");
}
