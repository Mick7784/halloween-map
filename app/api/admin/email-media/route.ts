import { NextRequest, NextResponse } from "next/server";
import { randomUUID, createHash } from "node:crypto";
import sharp from "sharp";
import { db } from "../../../../lib/db";
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
    return NextResponse.json({ images: rows.map((row) => ({
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
    const existing = (await db().query(
      "SELECT id FROM email_media WHERE instance_id=$1 AND sha256=$2",
      [user.instance_id, hash],
    )).rows[0];
    let id = existing?.id;
    if (!id) {
      const count = (await db().query(
        "SELECT count(*)::int count FROM email_media WHERE instance_id=$1",
        [user.instance_id],
      )).rows[0];
      if (Number(count?.count ?? 0) >= 60)
        throw new HttpError(409, "Bibliothèque pleine (60 images maximum)");
      id = randomUUID();
      await db().query(
        "INSERT INTO email_media(id,instance_id,filename,mime_type,sha256,size_bytes,data) VALUES($1,$2,$3,'image/webp',$4,$5,$6) ON CONFLICT(instance_id,sha256) DO NOTHING",
        [id, user.instance_id, file.name.slice(0, 180), hash, compressed.byteLength, compressed],
      );
      id = (await db().query(
        "SELECT id FROM email_media WHERE instance_id=$1 AND sha256=$2",
        [user.instance_id, hash],
      )).rows[0]?.id;
    }
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
