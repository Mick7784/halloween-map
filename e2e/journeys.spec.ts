import { test, expect, type Page } from "@playwright/test";
import { Pool } from "pg";
import { DateTime } from "luxon";
import { setup, adminAction } from "../lib/service";
import { hashPassword, getUser } from "../lib/auth";
import { dispatchEmails } from "../lib/mail";
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const password = "browser-password-1234",
  origin = process.env.APP_ORIGIN ?? "http://localhost:3000";
let houseId: string;
test.describe.configure({ mode: "serial" });
test.beforeAll(async () => {
  await pool.query(
    "TRUNCATE bootstrap,setup_sessions,instances,roles,users,seasons,participations,sessions,audit_logs,rate_limits RESTART IDENTITY CASCADE",
  );
  const opens = DateTime.now()
    .setZone("Europe/Paris")
    .plus({ days: 2 })
    .set({ hour: 18, minute: 0, second: 0, millisecond: 0 });
  const installed = await setup({
    token: process.env.SETUP_TOKEN,
    instance: {
      public_name: "Halloween test",
      territory: "Commune fictive",
      postal_code: "00000",
      country: "France",
      timezone: "Europe/Paris",
      latitude: 48.1,
      longitude: -1.67,
      zoom: 14,
    },
    admin: {
      display_name: "Équipe test",
      email: "admin@example.invalid",
      password,
    },
    season: {
      year: opens.year,
      opens_at: opens.toFormat("yyyy-MM-dd'T'HH:mm"),
      closes_at: opens.plus({ hours: 5 }).toFormat("yyyy-MM-dd'T'HH:mm"),
      registrations_open_at: opens
        .minus({ days: 30 })
        .toFormat("yyyy-MM-dd'T'HH:mm"),
      purge_at: opens.plus({ days: 3 }).toFormat("yyyy-MM-dd'T'HH:mm"),
      registrations_open: true,
    },
  });
  const initial = (await pool.query("SELECT id FROM seasons")).rows[0];
  await adminAction((await getUser(installed.token))!, {
    action: "activateSeason",
    id: initial.id,
    payload: "ACTIVER",
  });
  const i = (await pool.query("SELECT * FROM instances")).rows[0],
    role = (await pool.query("SELECT id FROM roles WHERE name='USER'")).rows[0],
    hash = await hashPassword(password);
  for (let n = 0; n < 2; n++) {
    const u = (
      await pool.query(
        "INSERT INTO users(instance_id,email,display_name,password_hash,role_id,kind,email_status,email_verified_at) VALUES($1,$2,$3,$4,$5,'PARTICIPANT','VERIFIED',now()) RETURNING id",
        [i.id, `visitor${n}@example.invalid`, `Visiteur ${n}`, hash, role.id],
      )
    ).rows[0];
    const h = (
      await pool.query(
        "INSERT INTO participations(instance_id,season_id,user_id,name,address,latitude,longitude,activities,starts_at,ends_at,fear,terms_version,guidelines_version) VALUES($1,$2,$3,$4,$5,$6,$7,ARRAY['DECORATION','CANDY'],$8,$9,2,'2026.1','2026.1') RETURNING id",
        [
          i.id,
          i.active_season_id,
          u.id,
          `Maison ${n}`,
          `Adresse privée ${n}`,
          48.1 + n * 0.0005,
          -1.67 + n * 0.0005,
          opens.toISO(),
          opens.plus({ hours: 5 }).toISO(),
        ],
      )
    ).rows[0];
    if (n === 0) houseId = h.id;
  }
});
test.afterAll(async () => {
  await pool.end();
  await (
    globalThis as unknown as { halloweenPool?: Pool }
  ).halloweenPool?.end();
});
async function login(
  page: Page,
  email = "admin@example.invalid",
  pass = password,
) {
  await page.goto("/login");
  await page.locator("main").getByLabel("Email", { exact: false }).fill(email);
  await page
    .locator("main")
    .getByLabel("Mot de passe", { exact: false })
    .fill(pass);
  await page
    .locator("main")
    .getByRole("button", { name: "Se connecter", exact: true })
    .click();
  await page.waitForURL("/map");
}
test("login → preopening map is unavailable and fits the mobile viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/map");
  await expect(
    page
      .locator("main")
      .getByRole("button", { name: "Se connecter", exact: true }),
  ).toBeVisible();
  await login(page, "visitor0@example.invalid");
  await expect(page.locator(".map-experience")).toHaveCount(0);
  const state = await (await page.request.get("/api/public")).json();
  expect(state.houses).toEqual([]);
  expect(state.mapAccessible).toBe(false);
  expect(JSON.stringify(state)).not.toContain("Adresse privée 1");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollHeight <= innerHeight + 1,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Menu utilisateur" }).click();
  await expect(
    page
      .getByRole("dialog", { name: "Menu utilisateur" })
      .getByRole("link", { name: "La carte", exact: true }),
  ).toBeVisible();
});
test("admin hides a house publicly, retains it in administration, and restores it", async ({
  page,
  browser,
}) => {
  await login(page);
  await page.goto("/admin");
  await page
    .locator(".beta-sidebar")
    .getByRole("button", { name: "Maisons", exact: true })
    .click();
  const row = page.getByRole("row").filter({ hasText: "Maison 0" });
  await row.getByRole("button", { name: "Gérer", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Masquer", exact: true })
    .click();
  await expect(row.getByText("Masquée", { exact: true })).toBeVisible();
  const context = await browser.newContext({ baseURL: origin }),
    visitor = await context.newPage();
  await login(visitor, "visitor0@example.invalid");
  const state = await (await visitor.request.get("/api/public")).json();
  expect(state.houses).toEqual([]);
  expect(JSON.stringify(state)).not.toContain("Adresse privée 0");
  const houses = await (await page.request.get("/api/admin/houses")).json();
  expect(houses.find((h: { id: string }) => h.id === houseId).status).toBe(
    "HIDDEN",
  );
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Réafficher", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("Visible");
  await context.close();
});
test("Super Admin has no obsolete demo action before REAL opening", async ({
  page,
}) => {
  await login(page);
  await page.goto("/");
  await page
    .getByRole("button", { name: "Menu utilisateur", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Mode démo", exact: true }),
  ).toHaveCount(0);
  const state = await (await page.request.get("/api/public")).json();
  expect(state.mapAccessible).toBe(false);
  expect(state.houses).toEqual([]);
});

test("forgot password → email CTA → one-use reset → login", async ({
  page,
}) => {
  await page.goto("/forgot-password");
  await page
    .locator("main")
    .getByLabel("Email", { exact: false })
    .fill("visitor0@example.invalid");
  await page.getByRole("button", { name: "Envoyer le lien" }).click();
  await expect(
    page.getByText("Si un compte correspond", { exact: false }),
  ).toBeVisible();
  let link = "";
  await dispatchEmails(new Date(), async (mail) => {
    if (mail.to === "visitor0@example.invalid") {
      expect(mail.html).toContain("Choisir un nouveau mot de passe");
      link = mail.text.match(/https?:[^\s]+/)![0];
    }
  });
  expect(link).toContain("/reset-password?token=");
  await page.goto(link);
  await page
    .getByLabel("Nouveau mot de passe", { exact: false })
    .fill("replacement-password-1234");
  await page
    .getByLabel("Confirmer le mot de passe")
    .fill("replacement-password-1234");
  await page
    .getByRole("button", { name: "Enregistrer le mot de passe" })
    .click();
  await expect(
    page.getByText("Votre mot de passe a été modifié.", { exact: false }),
  ).toBeVisible();
  const token = new URL(link).searchParams.get("token"),
    replay = await page.request.post("/api/reset-password", {
      headers: { origin },
      data: { token, password: "replacement-password-1234" },
    });
  expect(replay.status()).toBe(400);
  await login(page, "visitor0@example.invalid", "replacement-password-1234");
});
