import { NextRequest, NextResponse } from "next/server";
import { consumeIdentity } from "../../lib/accounts";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  let r: NextResponse;
  try {
    const result = await consumeIdentity(
      req.nextUrl.searchParams.get("token") ?? "",
      "INVITE",
    );
    r = NextResponse.redirect(
      new URL("/activation", process.env.APP_ORIGIN || req.url),
    );
    r.cookies.set("halloween_activation", result.token, {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.COOKIE_SECURE === "true",
      path: "/",
      maxAge: 1800,
    });
  } catch {
    r = NextResponse.redirect(
      new URL("/activation?link=expired", process.env.APP_ORIGIN || req.url),
    );
  }
  r.headers.set("Referrer-Policy", "no-referrer");
  r.headers.set("Cache-Control", "no-store, private");
  return r;
}
