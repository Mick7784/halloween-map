import { NextRequest, NextResponse } from "next/server";
import { consumeIdentity } from "../../lib/accounts";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  let r: NextResponse;
  try {
    const result = await consumeIdentity(
      req.nextUrl.searchParams.get("token") ?? "",
      "VERIFY",
    );
    r = NextResponse.redirect(
      new URL("/account?verified=1", process.env.APP_ORIGIN || req.url),
    );
    r.cookies.set("halloween_session", result.token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.COOKIE_SECURE === "true",
      path: "/",
      maxAge: 7 * 86400,
    });
  } catch {
    r = NextResponse.redirect(
      new URL("/account?link=expired", process.env.APP_ORIGIN || req.url),
    );
  }
  r.headers.set("Referrer-Policy", "no-referrer");
  r.headers.set("Cache-Control", "no-store, private");
  return r;
}
