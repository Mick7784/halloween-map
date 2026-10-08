import { afterAll, beforeAll, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
import { seedPreproduction } from "../scripts/preprod-seed";
import { preprodEnvironment } from "../scripts/preprod-runtime.mjs";
import { db, type Database } from "../lib/db";
import { createSession, getUser } from "../lib/auth";
import { adminAction, login, publicState } from "../lib/service";
const globals = globalThis as unknown as { testDb?: Database };
let engine: PGlite;
let databaseName = "halloween";
const env = {
  HALLOWEEN_PREPROD: "true",
  APP_ORIGIN: "https://ux.example.invalid",
  PREPROD_TERRITORY: "Zone fictive",
  PREPROD_POSTAL_CODE: "00000",
  PREPROD_LATITUDE: "48.8",
  PREPROD_LONGITUDE: "2.8",
  PREPROD_TIMEZONE: "Europe/Paris",
  PREPROD_ADMIN_PASSWORD: "fixture-admin-password-only",
  PREPROD_USER_PASSWORD: "fixture-user-password-only",
};
beforeAll(async () => {
  engine = await PGlite.create();
  globals.testDb = {
    query: async (sql, values) => {
      // PGlite has a single embedded database; test the name guard separately below.
      if (sql === "SELECT current_database() AS name")
        return { rows: [{ name: databaseName }] } as never;
      return engine.query(sql, values) as never;
    },
  };
  for (const name of (await readdir("migrations"))
    .filter((n) => n.endsWith(".sql"))
    .sort())
    await engine.exec(await readFile("migrations/" + name, "utf8"));
});
afterAll(async () => {
  delete globals.testDb;
  await engine.close();
});
it("forces isolated database credentials, HTTPS cookies and suppresses all SMTP configuration", () => {
  const result = preprodEnvironment(
    {
      ...env,
      DATABASE_URL: "postgresql://production.invalid/real",
      SMTP_HOST: "real-mail.invalid",
      SMTP_PASSWORD: "do-not-retain",
      SETUP_TOKEN: "real-token",
      COOKIE_SECURE: "false",
    },
    "fixture-db-password-with-24-characters",
  );
  expect(result.DATABASE_URL).toContain("@db:5432/halloween_ux_preprod");
  expect(result.DATABASE_URL).not.toContain("production");
  expect(result).toMatchObject({
    COOKIE_SECURE: "true",
    SMTP_HOST: "",
    SMTP_FROM: "",
    SETUP_TOKEN: "",
  });
  expect(result).not.toHaveProperty("SMTP_PASSWORD");
  expect(result).not.toHaveProperty("PREPROD_ADMIN_PASSWORD");
  for (const origin of [
    "http://ux.invalid",
    "https://ux.invalid/path",
    "https://ux.invalid/",
    "https://user:password@ux.invalid",
  ])
    expect(() =>
      preprodEnvironment(
        { ...env, APP_ORIGIN: origin },
        "fixture-db-password-with-24-characters",
      ),
    ).toThrow();
  expect(() =>
    preprodEnvironment(
      { ...env, HALLOWEEN_PREPROD: "false" },
      "fixture-db-password-with-24-characters",
    ),
  ).toThrow();
  expect(() => preprodEnvironment(env, "short")).toThrow();
});
it("refuses seed outside the explicitly named preproduction database without creating data", async () => {
  await expect(
    seedPreproduction({ ...env, HALLOWEEN_PREPROD: "false" }),
  ).rejects.toThrow("uniquement");
  await expect(seedPreproduction(env)).rejects.toThrow("Base préproduction");
  expect((await db().query("SELECT * FROM instances")).rows).toHaveLength(0);
});
it("uses existing setup/accounts/season/house rules and creates independent functional fixtures once", async () => {
  databaseName = "halloween_ux_preprod";
  expect(await seedPreproduction(env)).toEqual({ initialized: true });
  const accounts = (await db().query("SELECT id,email FROM users")).rows;
  expect(accounts).toHaveLength(12);
  expect(
    accounts.every((u) => String(u.email).endsWith("@example.invalid")),
  ).toBe(true);
  expect((await db().query("SELECT * FROM email_outbox")).rows).toHaveLength(0);
  expect((await db().query("SELECT * FROM participations")).rows).toHaveLength(
    18,
  );
  expect(
    (
      await db().query(
        "SELECT * FROM participations WHERE review_status<>'VALIDATED'",
      )
    ).rows,
  ).toHaveLength(0);
  const visitor = (await getUser(
    (
      await login({
        email: "visiteur-ux@example.invalid",
        password: env.PREPROD_USER_PASSWORD,
      })
    ).token,
  ))!;
  const publicMap = await publicState(undefined, visitor);
  expect(publicMap.mapAccessible).toBe(true);
  expect(publicMap.season?.is_test).toBe(false);
  expect(publicMap.houses).toHaveLength(7);
  expect(publicMap.houses!.some((h) => h.adaptable)).toBe(true);
  expect(
    publicMap.houses!.some(
      (h) => h.candy_available === false && h.activities.includes("ACTING"),
    ),
  ).toBe(true);
  expect(await seedPreproduction(env)).toEqual({ initialized: false });
  expect((await db().query("SELECT * FROM participations")).rows).toHaveLength(
    18,
  );
  const admin = (await getUser(
    await createSession(
      String(
        accounts.find((a) => a.email === "superadmin-ux@example.invalid")!.id,
      ),
    ),
  ))!;
  const test = (await db().query("SELECT id FROM seasons WHERE is_test"))
    .rows[0];
  await adminAction(admin, {
    action: "deactivateSeason",
    id: publicMap.season!.id,
    payload: "DÉSACTIVER",
  });
  await adminAction(admin, {
    action: "activateSeason",
    id: test.id,
    payload: "ACTIVER",
  });
  expect((await publicState(undefined, visitor)).mapAccessible).toBe(false);
  expect((await publicState(undefined, admin)).houses).toHaveLength(7);
  expect((await publicState(undefined, admin)).season?.is_test).toBe(true);
});
it("refuses to overwrite an unmarked existing instance", async () => {
  await db().query("UPDATE instances SET config=config-'preprodFixture'");
  await expect(seedPreproduction(env)).rejects.toThrow("Base non vide");
  expect((await db().query("SELECT * FROM participations")).rows).toHaveLength(
    18,
  );
});
