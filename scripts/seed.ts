import { instance, activeSeason, setup } from "../lib/service";
import { db, transaction } from "../lib/db";
import { hashPassword } from "../lib/auth";
import { DateTime } from "luxon";
import type { Activity } from "../lib/domain";
import { ensureBootstrap, exchangeBootstrap } from "../lib/bootstrap";
export async function seed(mode = "on") {
  let i = await instance();
  if (mode === "off") {
    if (i)
      await transaction(async (c) => {
        await c.query(
          "DELETE FROM audit_logs WHERE instance_id=$1 AND target_id IN(SELECT id FROM houses WHERE demo=true)",
          [i!.id],
        );
        await c.query("DELETE FROM users WHERE instance_id=$1 AND demo=true", [
          i!.id,
        ]);
      });
    console.log("Données de démonstration supprimées");
    return;
  }
  const password = process.env.DEMO_PASSWORD;
  if (!password || password.length < 12)
    throw new Error("DEMO_PASSWORD (12 caractères minimum) est requis.");
  if (!i) {
    const link = await ensureBootstrap(true);
    const setupSession = await exchangeBootstrap(
      new URL(link!).searchParams.get("bootstrap")!,
    );
    const year = DateTime.now().setZone("Europe/Paris").year;
    await setup(
      {
        instance: {
          public_name: "Halloween · Démonstration",
          territory: "Commune de démonstration",
          postal_code: "00000",
          country: "France",
          timezone: "Europe/Paris",
          latitude: 48.1,
          longitude: -1.67,
          zoom: 14,
        },
        admin: {
          display_name: "Équipe démo",
          email: "admin@example.invalid",
          password,
        },
        season: {
          year,
          opens_at: `${year}-10-31T12:00`,
          closes_at: `${year}-11-01T00:00`,
          registrations_open: true,
          activated: false,
        },
      },
      setupSession,
    );
    i = (await instance())!;
  }
  const s = await activeSeason(i);
  if (!s || s.purged_at)
    throw new Error("Créez une saison non purgée avant le seed");
  if (
    (
      await db().query(
        "SELECT id FROM users WHERE instance_id=$1 AND demo=true LIMIT 1",
        [i.id],
      )
    ).rows.length
  ) {
    console.log("Seed déjà présent");
    return;
  }
  const hash = await hashPassword(password),
    names = [
      "La maison des petits fantômes",
      "Le jardin des brumes",
      "Le manoir de minuit",
      "Les lanternes oubliées",
      "Le refuge des sorcières",
      "La cour des ombres",
      "Le portail mystérieux",
      "Le théâtre des revenants",
      "Les bonbons du crépuscule",
      "Le jardin endormi",
      "Le passage des lucioles",
      "La demeure des murmures",
    ];
  await transaction(async (c) => {
    for (let n = 0; n < 12; n++) {
      const { rows } = await c.query(
        "INSERT INTO users(instance_id,email,display_name,password_hash,kind,demo) VALUES($1,$2,'Participant démo',$3,'PARTICIPANT',true) RETURNING id",
        [i!.id, `maison${n + 1}@example.invalid`, hash],
      );
      const combos: Activity[][] = [
        ["DECORATION", "CANDY"],
        ["DECORATION"],
        ["CANDY"],
        ["DECORATION", "ACTING"],
        ["CANDY", "ACTING"],
        ["DECORATION", "CANDY", "ACTING"],
      ];
      const start = DateTime.fromJSDate(new Date(s.opens_at)).plus({
        hours: Math.min(n % 4, 2),
      });
      const end = DateTime.fromJSDate(new Date(s.closes_at)).minus({
        minutes: (n % 3) * 30,
      });
      await c.query(
        "INSERT INTO houses(instance_id,season_id,user_id,name,address,latitude,longitude,activities,starts_at,ends_at,fear,adaptable,rp,practical,status,activity,candy_available,demo) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,true)",
        [
          i!.id,
          s.id,
          rows[0].id,
          names[n],
          `${n + 1} allée fictive des Lanternes`,
          i!.latitude + ((n % 4) - 1.5) * 0.002,
          i!.longitude + (Math.floor(n / 4) - 1) * 0.003,
          combos[n % 6],
          start.toISO(),
          end.toISO(),
          (n % 5) + 1,
          n % 4 === 0,
          "Une ambiance fictive et quelques surprises vous attendent.",
          "Données de démonstration : cette adresse n’existe pas.",
          n === 6 ? "PENDING" : n === 10 ? "REJECTED" : "APPROVED",
          n === 9 ? "PAUSED" : "ACTIVE",
          n !== 8,
        ],
      );
    }
  });
  console.log(
    "12 maisons synthétiques créées. Aucun mot de passe n’est affiché.",
  );
}
if (process.argv[1]?.endsWith("seed.ts"))
  seed(process.argv[2])
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e.message);
      process.exit(1);
    });
