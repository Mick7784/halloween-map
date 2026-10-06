import { randomBytes } from "node:crypto";
import { instance } from "../lib/service";
import { db, transaction } from "../lib/db";
import { hashPassword } from "../lib/auth";
import { legalState } from "../lib/content";
import { frenchAddressReverse } from "../lib/french-address";
import { createWalkingRouter, type WalkingRouter } from "../lib/walking-router";
import { discoverTestPositions } from "./test-profile-positions";
import type { AddressSuggestion } from "../lib/participation-settings";
// Explicit provisioning only. Public services never generate or select test data.
export async function seed(
  mode = "on",
  options: {
    router?: WalkingRouter;
    address?: (lat: number, lng: number) => Promise<AddressSuggestion>;
    now?: Date;
  } = {},
) {
  const i = await instance();
  if (!i)
    throw new Error(
      "Configurez l’instance avant de créer les profils de test.",
    );
  if (mode !== "on" && mode !== "restore")
    throw new Error("Utilisez seed on ou seed restore.");
  if (mode === "restore") {
    const saved = i.config.testProvisioning as
      { previousSeasonId?: string } | undefined;
    if (!saved?.previousSeasonId)
      throw new Error("Saison précédente non enregistrée.");
    await db().query("UPDATE instances SET active_season_id=$1 WHERE id=$2", [
      saved.previousSeasonId,
      i.id,
    ]);
    return { restored: true };
  }
  const now = options.now ?? new Date(),
    router = options.router ?? createWalkingRouter();
  const existing = (
    await db().query(
      "SELECT h.*,u.email FROM participations h JOIN users u ON u.id=h.user_id WHERE h.instance_id=$1 AND u.email=ANY($2) AND h.season_id=(SELECT (config->'testProvisioning'->>'seasonId')::uuid FROM instances WHERE id=$1) ORDER BY u.email",
      [
        i.id,
        Array.from(
          { length: 5 },
          (_, n) => "mr-test-" + (n + 1) + "@example.invalid",
        ),
      ],
    )
  ).rows;
  const discovered =
    existing.length === 5 ? [] : await discoverTestPositions(i, router);
  const points = Array.from({ length: 5 }, (_, n) => {
    const h = existing.find(
      (h) => h.email === "mr-test-" + (n + 1) + "@example.invalid",
    );
    return h
      ? { latitude: Number(h.latitude), longitude: Number(h.longitude) }
      : discovered[n];
  });
  const matrix = await router.matrix(points);
  if (matrix.some((row) => row.some((cost) => !cost)))
    throw new Error("Les cinq positions ne sont pas reliées à pied.");
  await router.directions(points);
  const lookup = options.address ?? frenchAddressReverse;
  const addresses = await Promise.all(
    points.map((p, n) =>
      existing.some(
        (h) => h.email === "mr-test-" + (n + 1) + "@example.invalid",
      )
        ? Promise.resolve(null)
        : lookup(p.latitude, p.longitude),
    ),
  );
  const password =
    process.env.TEST_PROFILE_PASSWORD ?? randomBytes(32).toString("hex");
  if (password.length < 12)
    throw new Error(
      "TEST_PROFILE_PASSWORD doit contenir au moins 12 caractères.",
    );
  const hash = await hashPassword(password),
    docs = await legalState(i.id);
  return transaction(async (c) => {
    const locked = (
      await c.query(
        "SELECT config,active_season_id FROM instances WHERE id=$1 FOR UPDATE",
        [i.id],
      )
    ).rows[0];
    const provisioned = (locked.config as typeof i.config).testProvisioning as
      { seasonId?: string; previousSeasonId?: string } | undefined;
    let s = provisioned?.seasonId
      ? (
          await c.query(
            "SELECT * FROM seasons WHERE id=$1 AND instance_id=$2",
            [provisioned.seasonId, i.id],
          )
        ).rows[0]
      : undefined;
    if (!s) {
      const years = (
        await c.query("SELECT year FROM seasons WHERE instance_id=$1", [i.id])
      ).rows.map((s) => Number(s.year));
      let year = now.getFullYear();
      while (years.includes(year)) year++;
      s = (
        await c.query(
          "INSERT INTO seasons(instance_id,year,activated,registrations_open,registrations_open_at,opens_at,closes_at,purge_at) VALUES($1,$2,true,true,$3,$4,$5,$6) RETURNING *",
          [
            i.id,
            year,
            new Date(+now - 7200000),
            new Date(+now - 3600000),
            new Date(+now + 14 * 86400000),
            new Date(+now + 16 * 86400000),
          ],
        )
      ).rows[0];
      await c.query(
        "UPDATE instances SET config=jsonb_set(config,'{testProvisioning}',$1::jsonb),active_season_id=$2 WHERE id=$3",
        [
          JSON.stringify({
            seasonId: s.id,
            previousSeasonId: locked.active_season_id,
          }),
          s.id,
          i.id,
        ],
      );
    } else {
      if (s.purged_at || +new Date(s.closes_at as string) <= +now)
        throw new Error(
          "La saison de test est terminée : ne pas réinitialiser ses états automatiquement.",
        );
      await c.query("UPDATE instances SET active_season_id=$1 WHERE id=$2", [
        s.id,
        i.id,
      ]);
    }
    // Remove only the twelve known legacy synthetic accounts, never other flagged accounts.
    await c.query(
      "DELETE FROM audit_logs WHERE instance_id=$1 AND target_id IN(SELECT h.id FROM participations h JOIN users u ON u.id=h.user_id WHERE u.instance_id=$1 AND u.is_test AND u.email=ANY($2))",
      [
        i.id,
        Array.from(
          { length: 12 },
          (_, n) => "maison" + (n + 1) + "@example.invalid",
        ),
      ],
    );
    await c.query(
      "DELETE FROM users WHERE instance_id=$1 AND is_test AND email=ANY($2)",
      [
        i.id,
        Array.from(
          { length: 12 },
          (_, n) => "maison" + (n + 1) + "@example.invalid",
        ),
      ],
    );
    for (let n = 0; n < 5; n++) {
      const email = "mr-test-" + (n + 1) + "@example.invalid",
        name = "Mr Test " + (n + 1);
      const collision = (
        await c.query(
          "SELECT id FROM users WHERE instance_id=$1 AND email=$2 AND NOT is_test",
          [i.id, email],
        )
      ).rows[0];
      if (collision)
        throw new Error(
          "Un compte réel utilise déjà cette adresse réservée : aucune modification effectuée.",
        );
      const u = (
        await c.query(
          "INSERT INTO users(instance_id,email,display_name,password_hash,kind,is_test,email_status,email_verified_at,role_id) SELECT $1,$2,$3,$4,'PARTICIPANT',true,'VERIFIED',now(),id FROM roles WHERE instance_id=$1 AND name='USER' ON CONFLICT(instance_id,email) DO UPDATE SET is_test=true RETURNING id",
          [i.id, email, name, hash],
        )
      ).rows[0];
      if (!u) throw new Error("Rôle USER absent.");
      if (
        (
          await c.query(
            "SELECT id FROM participations WHERE user_id=$1 AND season_id=$2",
            [u.id, s.id],
          )
        ).rows.length
      )
        continue;
      const a = addresses[n];
      if (!a) throw new Error("Adresse manquante pour la participation.");
      await c.query(
        "INSERT INTO participations(instance_id,season_id,user_id,name,address,address_parts,latitude,longitude,activities,starts_at,ends_at,fear,adaptable,rp,practical,status,activity,candy_available,is_test,review_status,terms_version,terms_accepted_at,guidelines_version,guidelines_accepted_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'','Entrée au point GPS confirmé.','VISIBLE','ACTIVE',true,true,'VALIDATED',$14,now(),$15,now())",
        [
          i.id,
          s.id,
          u.id,
          name,
          a.label,
          JSON.stringify({
            postalCode: a.postalCode,
            city: a.city,
            cityCode: a.cityCode,
            number: a.number,
            street: a.street,
          }),
          points[n].latitude,
          points[n].longitude,
          n === 2 ? ["CANDY", "ACTING"] : ["DECORATION", "CANDY"],
          s.opens_at,
          s.closes_at,
          n + 1,
          n === 4,
          docs.TERMS.version,
          docs.GUIDELINES.version,
        ],
      );
    }
    return {
      seasonId: s.id,
      profiles: 5,
      previousSeasonId:
        provisioned?.previousSeasonId ?? locked.active_season_id,
    };
  });
}
if (process.argv[1]?.endsWith("seed.ts"))
  seed(process.argv[2])
    .then((r) => {
      console.log("Profils de test réels prêts", r);
      process.exit(0);
    })
    .catch((e) => {
      console.error(e.message);
      process.exit(1);
    });
