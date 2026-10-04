import { NextRequest, NextResponse } from "next/server";
import { exchangeBootstrap, setupCookie } from "../../lib/bootstrap";
import { rateLimit } from "../../lib/auth";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("bootstrap");
  const target = new URL("/setup/wizard", process.env.APP_ORIGIN || req.url);
  let token: string | undefined;
  if (secret) {
    try {
      await rateLimit("bootstrap-link", 30);
      token = await exchangeBootstrap(secret);
    } catch {
      target.pathname = "/setup/invalid";
    }
  }
  const res = NextResponse.redirect(target, 303);
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("Referrer-Policy", "no-referrer");
  if (token)
    res.cookies.set(setupCookie, token, {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.COOKIE_SECURE === "true",
      path: "/",
      maxAge: 7200,
    });
  return res;
}
