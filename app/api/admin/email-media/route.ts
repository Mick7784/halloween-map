import { NextRequest, NextResponse } from "next/server";
import { randomUUID, createHash } from "node:crypto";
import sharp from "sharp";
import { db, transaction } from "../../../../lib/db";
import { getUser, HttpError, rateLimit, requirePermission } from "../../../../lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const cookie = "halloween_session";
const unavailable = (message: string, status: number) =>
  NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });

async function admin(req: NextRequest) {
  const user = requirePermission(await getUser(req.cookies.get(cookie)?.value, true), "admin.access");
  requirePermission(user, "communications.manage");
  return user;
}

export async function GET(req: NextRequest) {
  try {
    const user = await admin(req);
    const rows = (await db().query(
      "SELECT id,filename,size_bytes,created_at FROM email_media WHERE instance_id=$1 AND NOT hidden ORDER BY created_at DESC LIMIT 60",
      [user.instance_id],
    )).rows;
    const origin = process.env.APP_ORIGIN?.replace(/\/$/, "");
    if (!origin) throw new HttpError(503, "URL publique non configurée");
    return NextResponse.json({ capacity: { used: rows.length, limit: 60 }, images: rows.map((row) => ({
      id: row.id, filename: row.filename, size_bytes: row.size_bytes,
      created_at: row.created_at,
      url: origin + "/api/email-media/" + row.id,
    })) }, { headers: { "Cache-Control": "no-store, private" } });
  } catch (e) {
    if (e instanceof HttpError) return unavailable(e.message, e.status);
    return unavailable("Bibliothèque d’images indisponible", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const origin = process.env.APP_ORIGIN;
    if (!origin || req.headers.get("origin") !== new URL(origin).origin)
      throw new HttpError(403, "Origine interdite");
    if (!origin.startsWith("https://") && process.env.NODE_ENV === "production")
      throw new HttpError(503, "APP_ORIGIN doit être HTTPS pour les images d'emails");
    const user = await admin(req);
    await rateLimit("email-image-upload:" + user.id, 25);
    if (Number(req.headers.get("content-length") ?? 0) > 2_200_000)
      throw new HttpError(413, "Image trop volumineuse (2 Mo maximum)");
    const form = await req.formData();
    const file = form.get("image");
    if (!(file instanceof File) || file.size < 1 || file.size > 2_000_000)
      throw new HttpError(400, "Image invalide (2 Mo maximum)");
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type))
      throw new HttpError(400, "Format autorisé : PNG, JPEG ou WebP");
    const raw = Buffer.from(await file.arrayBuffer());
    const pipeline = sharp(raw, { limitInputPixels: 32_000_000, animated: false });
    const meta = await pipeline.metadata();
    if (!["png", "jpeg", "webp"].includes(meta.format ?? "") ||
      !meta.width || !meta.height || meta.width > 8000 || meta.height > 8000 ||
      (meta.pages ?? 1) > 1)
      throw new HttpError(400, "Image non prise en charge");
    const compressed = await pipeline.rotate().resize(1200, 1200, {
      fit: "inside", withoutEnlargement: true,
    }).webp({ quality: 80, effort: 4 }).toBuffer();
    if (compressed.byteLength > 600000)
      throw new HttpError(413, "Image optimisée trop volumineuse");
    const hash = createHash("sha256").update(compressed).digest("hex");
    // Lock the parent instance so concurrent uploads cannot both pass the quota.
    // Archiving only affects the editor library: previously sent URLs remain live.
    const id = await transaction(async (client) => {
      await client.query("SELECT id FROM instances WHERE id=$1 FOR UPDATE", [user.instance_id]);
      const previous = (await client.query(
        "SELECT id,hidden FROM email_media WHERE instance_id=$1 AND sha256=$2",
        [user.instance_id, hash],
      )).rows[0];
      if (previous && !previous.hidden) return String(previous.id);
      const count = (await client.query(
        "SELECT count(*)::int count FROM email_media WHERE instance_id=$1 AND NOT hidden",
        [user.instance_id],
      )).rows[0];
      if (Number(count?.count ?? 0) >= 60)
        throw new HttpError(409, "Bibliothèque pleine (60 images actives maximum). Archivez une image inutilisée.");
      if (previous) {
        await client.query("UPDATE email_media SET hidden=false WHERE id=$1 AND instance_id=$2",
          [previous.id, user.instance_id]);
        return String(previous.id);
      }
      const nextId = randomUUID();
      await client.query(
        "INSERT INTO email_media(id,instance_id,filename,mime_type,sha256,size_bytes,data) VALUES($1,$2,$3,'image/webp',$4,$5,$6)",
        [nextId, user.instance_id, file.name.slice(0, 180), hash, compressed.byteLength, compressed],
      );
      return nextId;
    });
    if (!id) throw new HttpError(500, "Impossible de sauvegarder l'image");
    return NextResponse.json({
      url: origin.replace(/\/$/, "") + "/api/email-media/" + id,
      id, filename: file.name, size_bytes: compressed.byteLength,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof HttpError) return unavailable(e.message, e.status);
    if (e instanceof Error && /Input|image|buffer|decode|pixel|sharp/i.test(e.message))
      return unavailable("Impossible de décoder cette image", 400);
    return unavailable("Import d’image indisponible", 500);
  }
}

/** Remove an asset from the editor library, never from already-sent emails. */
export async function PATCH(req: NextRequest) {
  try {
    const origin = process.env.APP_ORIGIN;
    if (!origin || req.headers.get("origin") !== new URL(origin).origin)
      throw new HttpError(403, "Origine interdite");
    const user = await admin(req);
    await rateLimit("email-image-archive:" + user.id, 25);
    const payload = await req.json() as { id?: unknown };
    if (typeof payload?.id !== "string" ||
        !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(payload.id))
      throw new HttpError(400, "Identifiant d'image invalide");
    const row = (await db().query(
      "UPDATE email_media SET hidden=true WHERE id=$1 AND instance_id=$2 RETURNING id",
      [payload.id, user.instance_id],
    )).rows[0];
    if (!row) throw new HttpError(404, "Image introuvable");
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof HttpError) return unavailable(e.message, e.status);
    return unavailable("Archivage d'image indisponible", 500);
  }
}
