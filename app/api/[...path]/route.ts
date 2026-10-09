import { setupCookie, setupAuthorized } from "../../../lib/bootstrap";
import { reportCollection } from "../../../lib/season-statistics";
import { realTime } from "../../../lib/time";
import { presence } from "../../../lib/attendance";
import {
  smtpAvailable,
  campaignAction,
  campaignAdmin,
  smtpSender,
} from "../../../lib/mail";
import {
  templatesAdmin,
  templateAction,
  refusalPreview,
} from "../../../lib/mail-templates";
import {
  accountAction,
  adminUserAction,
  activateAccount,
  requestPasswordReset,
  resetPassword,
} from "../../../lib/accounts";
import { contentAction, contentAdmin } from "../../../lib/content";
import {
  frenchCommunes,
  frenchAddressSearch,
  frenchAddressReverse,
} from "../../../lib/french-address";
import { NextRequest, NextResponse } from "next/server";
import {
  getUser,
  HttpError,
  hashToken,
  rateLimit,
  SESSION_SECONDS,
} from "../../../lib/auth";
import { db } from "../../../lib/db";
import * as service from "../../../lib/service";
import { ZodError } from "zod";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const cookie = "halloween_session";
function response(data: unknown) {
  return NextResponse.json(data, {
    headers: { "Cache-Control": "no-store, private" },
  });
}
function withSession(token: string) {
  const r = response({ ok: true });
  r.cookies.set(cookie, token, {
    httpOnly: true,
    sameSite: "lax",
    secure:
      process.env.COOKIE_SECURE === "true" ||
      process.env.APP_ORIGIN?.startsWith("https://") === true,
    path: "/",
    maxAge: SESSION_SECONDS,
  });
  return r;
}
async function handle(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  try {
    const path = (await params).path.join("/");
    const sessionUser = () =>
      getUser(
        req.cookies.get(cookie)?.value,
        path.startsWith("admin") || path === "geocode",
      );
    if (req.method === "GET") {
      if (path === "health") {
        await db().query("SELECT 1");
        return response({ status: "ok" });
      }
      if (path === "setup-access")
        return response({
          authorized: await setupAuthorized(
            req.cookies.get(setupCookie)?.value,
          ),
        });
      if (path === "public")
        return response(
          await service.publicState(realTime(), await sessionUser()),
        );
      if (path === "me") return response(await sessionUser());
      if (path === "history") {
        const u = await sessionUser();
        if (!u) throw new HttpError(401, "Connexion requise");
        return response(
          (
            await db().query(
              "SELECT year FROM participation_history WHERE user_id=$1 ORDER BY year DESC",
              [u.id],
            )
          ).rows,
        );
      }
      if (path === "location") {
        const u = await sessionUser();
        if (!u) throw new HttpError(401, "Connexion requise");
        await rateLimit("address:" + u.id, 120);
        const q = req.nextUrl.searchParams;
        if (q.get("mode") === "communes")
          return response(await frenchCommunes(q.get("postalCode") ?? ""));
        if (q.get("mode") === "search")
          return response(
            await frenchAddressSearch(
              q.get("q") ?? "",
              q.get("postalCode") ?? "",
              q.get("cityCode") ?? "",
            ),
          );
        if (q.get("mode") === "reverse")
          return response(
            await frenchAddressReverse(
              Number(q.get("lat")),
              Number(q.get("lon")),
            ),
          );
        throw new HttpError(400, "Recherche inconnue");
      }
      if (path === "house")
        return response(await service.ownHouse(await sessionUser()));
      if (path === "admin/content")
        return response(await contentAdmin(await sessionUser()));
      if (path === "admin/templates")
        return response(await templatesAdmin(await sessionUser()));
      if (path === "admin/refusal-preview")
        return response(
          await refusalPreview(
            await sessionUser(),
            req.nextUrl.searchParams.get("id") ?? "",
            req.nextUrl.searchParams.get("reason") ?? "",
          ),
        );
      if (path === "admin/communications")
        return response(
          await campaignAdmin(
            await sessionUser(),
            req.nextUrl.searchParams.get("seasonId") ?? undefined,
          ),
        );
      if (path === "admin/mail") {
        const u = await sessionUser();
        if (
          !u?.permissions.includes("communications.manage") ||
          !u.permissions.includes("admin.access")
        )
          throw new HttpError(403, "Accès interdit");
        return response({ smtpAvailable: smtpAvailable() });
      }
      if (path.startsWith("admin/")) {
        await service.tick();
        return response(
          await service.adminRead(
            await sessionUser(),
            path.slice(6),
            req.nextUrl.searchParams.get("seasonId") ?? undefined,
            req.nextUrl.searchParams.get("scope") ?? "season",
            Object.fromEntries(
              ["q", "category", "from", "to", "page"]
                .filter((k) => req.nextUrl.searchParams.has(k))
                .map((k) => [k, req.nextUrl.searchParams.get(k)!]),
            ),
          ),
        );
      }
      throw new HttpError(404, "Page introuvable");
    }
    if (req.method !== "POST") throw new HttpError(405, "Méthode interdite");
    const origin = req.headers.get("origin");
    if (
      !process.env.APP_ORIGIN ||
      origin !== new URL(process.env.APP_ORIGIN).origin
    )
      throw new HttpError(403, "Origine de requête interdite");
    if (Number(req.headers.get("content-length") ?? 0) > 20000)
      throw new HttpError(413, "Requête trop volumineuse");
    const raw = await req.text();
    if (raw.length > 20000)
      throw new HttpError(413, "Requête trop volumineuse");
    const input = JSON.parse(raw);
    // Persistent limits are scoped to accounts/tokens in the service layer.
    // Never use an untrusted forwarded address or a collective auth lockout.
    if (path === "setup") {
      const r = withSession(
        (await service.setup(input, req.cookies.get(setupCookie)?.value)).token,
      );
      r.cookies.delete(setupCookie);
      return r;
    }
    if (path === "forgot-password")
      return response(await requestPasswordReset(input));
    if (path === "reset-password") return response(await resetPassword(input));
    if (path === "login")
      return withSession((await service.login(input)).token);
    if (path === "register")
      return withSession((await service.register(input)).token);
    if (path === "activation") {
      const r = withSession(
        (
          await activateAccount(
            req.cookies.get("halloween_activation")?.value,
            input,
          )
        ).token,
      );
      r.cookies.delete("halloween_activation");
      return r;
    }
    if (path === "geocode") {
      const configured = await service.instance();
      const user = await sessionUser();
      if (
        !configured &&
        !(await setupAuthorized(req.cookies.get(setupCookie)?.value))
      ) {
        if (input.token) service.verifySetupToken(String(input.token));
        else throw new HttpError(403, "Session de configuration requise");
      } else if (!user?.permissions.includes("settings.manage"))
        throw new HttpError(403, "Accès interdit");
      await rateLimit("geocode", 30);
      const query = String(input.query ?? "").trim();
      if (query.length < 3 || query.length > 200)
        throw new HttpError(400, "Territoire invalide");
      const res = await fetch(
        "https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=1&q=" +
          encodeURIComponent(query),
        {
          headers: {
            "User-Agent": "HalloweenMap/0.1 (self-hosted locality setup)",
          },
          signal: AbortSignal.timeout(8000),
        },
      );
      if (!res.ok)
        throw new HttpError(
          503,
          "Géocodage indisponible. Saisissez le centre manuellement.",
        );
      const data = await res.json();
      if (!data.length)
        throw new HttpError(
          404,
          "Territoire introuvable. Saisissez le centre manuellement.",
        );
      return response({
        latitude: Number(data[0].lat),
        longitude: Number(data[0].lon),
        zoom: 13,
        place: String(data[0].display_name),
        timezone:
          (
            {
              fr: "Europe/Paris",
              be: "Europe/Brussels",
              ch: "Europe/Zurich",
              lu: "Europe/Luxembourg",
              gb: "Europe/London",
              de: "Europe/Berlin",
            } as Record<string, string>
          )[data[0].address?.country_code] ?? null,
      });
    }
    const user = await sessionUser();
    if (path === "presence") return response(await presence(user));
    if (path === "admin/templates")
      return response(
        await templateAction(
          user,
          input,
          smtpAvailable() ? smtpSender() : undefined,
        ),
      );
    if (path === "account") {
      const result = await accountAction(user, input);
      if ("token" in result && result.token) return withSession(result.token);
      const r = response(result);
      if ("deleted" in result) r.cookies.delete(cookie);
      return r;
    }
    if (path === "participation")
      return response(await service.createParticipation(user, input));
    if (path === "admin/users")
      return response(await adminUserAction(user, input));
    if (path === "admin/content")
      return response(await contentAction(user, input));
    if (path === "admin/communications")
      return response(await campaignAction(user, input));
    if (path === "logout") {
      if (req.cookies.has(cookie))
        await db().query("DELETE FROM sessions WHERE token_hash=$1", [
          hashToken(req.cookies.get(cookie)!.value),
        ]);
      const r = response({ ok: true });
      r.cookies.delete(cookie);
      return r;
    }
    if (path === "house") {
      const own = await service.ownHouse(user);
      if (!own) throw new HttpError(404, "Maison introuvable");
      return response(await service.updateHouse(user, String(own.id), input));
    }
    if (path === "participant") {
      const data = await service.participantAction(user, input);
      const r = response(data);

      return r;
    }
    if (path === "collection/report") {
      if (!user) throw new HttpError(401, "Connexion requise");
      await rateLimit("collection-report:" + user.id, 120);
      return response(
        await reportCollection(
          user,
          input,
          req.cookies.get(cookie)?.value ?? "",
        ),
      );
    }
    if (path === "route/availability") {
      if (!user) throw new HttpError(401, "Connexion requise");
      await rateLimit("route-availability:" + user.id, 120);
      const context = realTime();
      return response(await service.routeAvailability(user, input, context));
    }
    if (path === "route") {
      await rateLimit("routes-global", 300);
      const context = realTime();
      await service.tick();
      return response(await service.route(input, context, user));
    }
    if (path === "admin") {
      await service.tick();
      return response(await service.adminAction(user, input));
    }
    throw new HttpError(404, "Page introuvable");
  } catch (e) {
    if (e instanceof ZodError)
      return NextResponse.json(
        {
          error: e.issues
            .map((i) => `${i.path.join(".")} : ${i.message}`)
            .join(" · "),
        },
        { status: 400 },
      );
    if (e instanceof HttpError)
      return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof SyntaxError)
      return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
    if ((e as { code?: string })?.code === "23505")
      return NextResponse.json(
        { error: "Cet email, rôle ou année existe déjà" },
        { status: 409 },
      );
    console.error(
      "Request failed",
      (e as { code?: string })?.code ?? "unknown",
    );
    return NextResponse.json(
      { error: "Service temporairement indisponible" },
      { status: 500 },
    );
  }
}
export const GET = handle;
export const POST = handle;
