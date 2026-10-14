import { NextRequest, NextResponse } from "next/server";
import { db } from "../../../../lib/db";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!/^[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(id))
    return new NextResponse(null, { status: 404 });
  try {
    const row = (await db().query(
      "SELECT data FROM email_media WHERE id=$1",
      [id],
    )).rows[0];
    if (!row?.data) return new NextResponse(null, { status: 404 });
    const buffer = Buffer.from(row.data as Uint8Array);
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "image/webp",
        "Content-Length": String(buffer.byteLength),
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
        "Cross-Origin-Resource-Policy": "cross-origin",
      },
    });
  } catch {
    return new NextResponse(null, { status: 503 });
  }
}
