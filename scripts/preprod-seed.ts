import { defaultRoles } from "../lib/domain";
import { pathToFileURL } from "node:url";
import { Pool } from "pg";
import { z } from "zod";
import { db } from "../lib/db";
import { ensureBootstrap, exchangeBootstrap } from "../lib/bootstrap";
import { createSession, getUser } from "../lib/auth";
import { adminUserAction } from "../lib/accounts";
import { legalState } from "../lib/content";
import { adminAction, instance, setup } from "../lib/service";
import type { Activity, User } from "../lib/domain";

const marker = "ux-mobile-preprod-v1";
export async function seedPreproduction(
  environment: Record<string, string | undefined> = process.env,
) {
  if (environment.HALLOWEEN_PREPROD !== "true")
    throw new Error("Préproduction uniquement");
  const database = (await db().query("SELECT current_database() AS name"))
    .rows[0];
  if (database.name !== "halloween_ux_preprod")
    throw new Error("Base préproduction requise");
  const existing = await instance();
  if (existing) {
    if (existing.config.preprodFixture === marker)
      return { initialized: false };
    throw new Error("Base non vide : aucune donnée existante ne sera modifiée");
  }
  const configuration = z
    .object({
      PREPROD_TERRITORY: z.string().trim().min(1),
      PREPROD_POSTAL_CODE: z.string().trim().min(1),
      PREPROD_LATITUDE: z.coerce.number().min(-85).max(85),
      PREPROD_LONGITUDE: z.coerce.number().min(-179).max(179),
      PREPROD_TIMEZONE: z.string().default("Europe/Paris"),
      PREPROD_ADMIN_PASSWORD: z.string().min(12).max(128),
      PREPROD_USER_PASSWORD: z.string().min(12).max(128),
    })
    .parse(environment);
  if (
    !environment.PREPROD_LATITUDE?.trim() ||
    !environment.PREPROD_LONGITUDE?.trim()
  )
    throw new Error("Centre de carte requis");
  const now = Date.now(),
    iso = (hours: number) => new Date(now + hours * 3600000).toISOString();
  const link = await ensureBootstrap(true);
  if (!link) throw new Error("Initialisation indisponible");
  const setupSession = await exchangeBootstrap(
    new URL(link).searchParams.get("bootstrap")!,
  );
  const result = await setup(
    {
      instance: {
        public_name: "Halloween Map — UX préproduction",
        territory: configuration.PREPROD_TERRITORY,
        postal_code: configuration.PREPROD_POSTAL_CODE,
        country: "France",
        timezone: configuration.PREPROD_TIMEZONE,
        latitude: configuration.PREPROD_LATITUDE,
        longitude: configuration.PREPROD_LONGITUDE,
        zoom: 16,
      },
      admin: {
        email: "superadmin-ux@example.invalid",
        display_name: "Super Admin UX",
        password: configuration.PREPROD_ADMIN_PASSWORD,
      },
      season: {
        name: "UX mobile — REAL indépendante",
        year: new Date(now).getUTCFullYear(),
        is_test: false,
        registrations_open: true,
        registrations_open_at: iso(-2),
        opens_at: iso(-1),
        closes_at: iso(168),
        purge_at: iso(192),
      },
    },
    setupSession,
  );
  const admin = (await getUser(result.token))!;
  const roles = (
    await db().query("SELECT id,name FROM roles WHERE instance_id=$1", [
      admin.instance_id,
    ])
  ).rows;
  const userRole = roles.find((r) => r.name === "USER")!;
  async function account(name: string, email?: string): Promise<User> {
    const created = z.object({ id: z.uuid() }).parse(
      await adminUserAction(admin, {
        current_password: configuration.PREPROD_ADMIN_PASSWORD,
        action: "invite",
        without_invitation: true,
        display_name: name,
        email,
        role_id: userRole.id,
        password: configuration.PREPROD_USER_PASSWORD,
      }),
    );
    return (await getUser(await createSession(created.id)))!;
  }
  await account("Visiteur UX", "visiteur-ux@example.invalid");
  const testAdmin = await account("Admin UX", "admin-ux@example.invalid");
  await adminUserAction(admin, {
    current_password: configuration.PREPROD_ADMIN_PASSWORD,
    action: "edit",
    id: testAdmin.id,
    role_id: roles.find((r) => r.name === "ADMIN")!.id,
    permissions: [...defaultRoles.ADMIN],
  });
  const owners: User[] = [];
  for (let n = 0; n < 9; n++)
    owners.push(await account(`Propriétaire fictif ${n + 1}`));
  const real = (
    await db().query("SELECT id FROM seasons WHERE instance_id=$1", [
      admin.instance_id,
    ])
  ).rows[0];
  await adminAction(admin, {
    current_password: configuration.PREPROD_ADMIN_PASSWORD,
    action: "activateSeason",
    id: real.id,
    payload: "ACTIVER",
  });
  const guidelines = (await legalState(admin.instance_id)).GUIDELINES.version;
  async function houses(seasonId: string) {
    for (let n = 0; n < owners.length; n++) {
      const activities: Activity[] =
        n === 8 ? ["DECORATION", "CANDY", "ACTING"] : ["CANDY", "DECORATION"];
      await adminAction(admin, {
        action: "createHouse",
        seasonId,
        payload: {
          userId: owners[n].id,
          participation: {
            house: {
              position_confirmed: true,
              name:
                n === 5
                  ? "La maison adaptable"
                  : n === 6
                    ? "La maison en pause"
                    : n === 7
                      ? "La maison fermée"
                      : n === 8
                        ? "Les bonbons épuisés"
                        : `La maison de frayeur ${n + 1}`,
              address: `Repère fictif ${n + 1} — aucun domicile réel`,
              latitude:
                configuration.PREPROD_LATITUDE +
                Math.sin((n * Math.PI) / 4) * 0.001,
              longitude:
                configuration.PREPROD_LONGITUDE +
                Math.cos((n * Math.PI) / 4) * 0.0015,
              activities,
              fear: n < 5 ? n + 1 : 3,
              adaptable: n === 5,
              starts_at: iso(-0.5),
              ends_at: iso(168),
              rp: "Maison fictive pour validation UX uniquement.",
              practical:
                "Repositionner sur un accès piéton réel pour tester ORS et GPS.",
            },
            acceptance: {
              mode: "GUIDELINES_ONLY",
              guidelines: true,
              guidelines_version: guidelines,
            },
          },
        },
      });
      if (n >= 6) {
        const h = (
          await db().query(
            "SELECT id FROM participations WHERE user_id=$1 AND season_id=$2",
            [owners[n].id, seasonId],
          )
        ).rows[0];
        await adminAction(admin, {
          action: "houseActivity",
          seasonId,
          id: h.id,
          payload:
            n === 6
              ? { action: "pause" }
              : n === 7
                ? { action: "end" }
                : { action: "candy", available: false },
        });
      }
    }
  }
  await houses(String(real.id));
  await adminAction(admin, {
    action: "season",
    payload: { name: "UX mobile — TEST administrateurs", is_test: true },
  });
  const test = (
    await db().query(
      "SELECT id FROM seasons WHERE instance_id=$1 AND is_test",
      [admin.instance_id],
    )
  ).rows[0];
  await adminAction(admin, {
    action: "deactivateSeason",
    current_password: configuration.PREPROD_ADMIN_PASSWORD,
    id: real.id,
    payload: "DÉSACTIVER",
  });
  await adminAction(admin, {
    action: "activateSeason",
    current_password: configuration.PREPROD_ADMIN_PASSWORD,
    id: test.id,
    payload: "ACTIVER",
  });
  await houses(String(test.id));
  await adminAction(admin, {
    action: "deactivateSeason",
    current_password: configuration.PREPROD_ADMIN_PASSWORD,
    id: test.id,
    payload: "DÉSACTIVER",
  });
  await adminAction(admin, {
    action: "activateSeason",
    current_password: configuration.PREPROD_ADMIN_PASSWORD,
    id: real.id,
    payload: "ACTIVER",
  });
  await db().query(
    "UPDATE instances SET config=config || $1::jsonb WHERE id=$2",
    [JSON.stringify({ preprodFixture: marker }), admin.instance_id],
  );
  await db().query(
    "DELETE FROM sessions WHERE user_id IN(SELECT id FROM users WHERE instance_id=$1)",
    [admin.instance_id],
  );
  return { initialized: true };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  seedPreproduction()
    .then((result) =>
      console.log(
        result.initialized
          ? "Préproduction initialisée : REAL active, TEST inactive, maisons fictives. Identifiants dans la procédure ; aucun mot de passe dans les logs."
          : "Préproduction déjà initialisée : aucune modification.",
      ),
    )
    .catch(() => {
      console.error(
        "Initialisation préproduction refusée ou interrompue : vérifier la base dédiée, le centre, les secrets. Aucun réensemencement d’une base non vide.",
      );
      process.exitCode = 1;
    })
    .finally(() => (db() as Pool).end());
}
