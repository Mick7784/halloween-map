import { test, expect, type Page } from "@playwright/test";
import { Pool } from "pg";
import { setup, adminAction } from "../lib/service";
import { createAccount } from "../lib/accounts";
import { getUser } from "../lib/auth";
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const globals = globalThis as unknown as { testDb?: Pool };
const password = "release-browser-password-1234",
  origin = process.env.APP_ORIGIN ?? "http://localhost:3000";
let ownerId: string, adminId: string, seasonId: string;
test.describe.configure({ mode: "serial" });
test.beforeEach(async () => {
  globals.testDb = pool;
  await pool.query(
    "TRUNCATE instances,bootstrap,setup_sessions,rate_limits RESTART IDENTITY CASCADE",
  );
  const now = Date.now();
  const result = await setup({
    token: process.env.SETUP_TOKEN,
    instance: {
      public_name: "Halloween",
      territory: "Commune fictive",
      postal_code: "00000",
      country: "France",
      timezone: "Europe/Paris",
      latitude: 48.1,
      longitude: 2.8,
      zoom: 14,
    },
    admin: {
      display_name: "Équipe",
      email: "release-admin@example.invalid",
      password,
    },
    season: {
      year: new Date().getFullYear(),
      name: "Prochaine édition",
      registrations_open: true,
      registrations_open_at: new Date(now - 3600000).toISOString(),
      opens_at: new Date(now + 86400000).toISOString(),
      closes_at: new Date(now + 2 * 86400000).toISOString(),
      purge_at: new Date(now + 3 * 86400000).toISOString(),
    },
  });
  const admin = (await getUser(result.token))!;
  adminId = admin.id;
  seasonId = String((await pool.query("SELECT id FROM seasons")).rows[0].id);
  await adminAction(admin, {
    action: "activateSeason",
    id: seasonId,
    payload: "ACTIVER",
    current_password: password,
  });
  ownerId = (await getUser(
    (
      await createAccount({
        display_name: "Camille",
        email: "release-member@example.invalid",
        password,
      })
    ).token,
  ))!.id;
  await pool.query(
    "UPDATE users SET email_status='VERIFIED',email_verified_at=now()",
  );
  await pool.query("DELETE FROM email_outbox");
});
test.afterAll(async () => {
  delete globals.testDb;
  await pool.end();
});
async function post(page: Page, path: string, body: unknown) {
  return page.request.post("/api/" + path, { headers: { origin }, data: body });
}
async function login(page: Page, email = "release-admin@example.invalid") {
  const r = await post(page, "login", { email, password });
  expect(r.status()).toBe(200);
  return r;
}
test("guest mobile entry offers authentication and legal documents; APIs reject anonymous access", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await page.goto("/");
  await expect(
    page
      .locator(".home-login")
      .getByRole("button", { name: "Se connecter", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Créer mon compte", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "La carte", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("link", { name: "Confidentialité", exact: true })
    .scrollIntoViewIfNeeded();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(360);
  expect((await page.request.get("/api/admin/users")).status()).toBe(401);
  await page.screenshot({
    path: "test-results/release-guest-mobile.png",
    fullPage: true,
  });
});
test("twelve-hour cookie and server expiry preserve accounts and request authentication again", async ({
  page,
}) => {
  const response = await login(page, "release-member@example.invalid");
  expect(response.headers()["set-cookie"]).toContain("Max-Age=43200");
  await page.goto("/");
  await expect(page.locator(".home-clock")).toBeVisible();
  await expect(page.locator(".route-experience")).toHaveCount(0);
  await pool.query(
    "UPDATE sessions SET created_at=now()-interval '13 hours',expires_at=now()+interval '7 days' WHERE user_id=$1",
    [ownerId],
  );
  expect(await (await page.request.get("/api/me")).json()).toBeNull();
  await page.reload();
  await expect(page.locator(".home-login")).toBeVisible();
  expect(
    (await pool.query("SELECT id FROM users WHERE id=$1", [ownerId])).rows,
  ).toHaveLength(1);
});
test("ADMIN grants are enforced on API requests immediately; idle rights require reauthentication", async ({
  page,
}) => {
  await pool.query(
    "UPDATE users SET role_id=(SELECT id FROM roles WHERE name='ADMIN'),admin_permissions=ARRAY['users.read'] WHERE id=$1",
    [ownerId],
  );
  await login(page, "release-member@example.invalid");
  expect((await page.request.get("/api/admin/users")).status()).toBe(200);
  expect((await page.request.get("/api/admin/houses")).status()).toBe(403);
  expect(
    (
      await post(page, "admin/users", {
        action: "edit",
        id: ownerId,
        permissions: ["settings.manage"],
        current_password: password,
      })
    ).status(),
  ).toBe(403);
  await page.goto("/admin");
  await expect(page.getByLabel("Rechercher un utilisateur")).toBeVisible();
  await expect(
    page
      .getByRole("navigation")
      .getByRole("button", { name: "Paramètres", exact: true }),
  ).toHaveCount(0);
  await pool.query("UPDATE users SET admin_permissions='{}' WHERE id=$1", [
    ownerId,
  ]);
  expect((await page.request.get("/api/admin/users")).status()).toBe(403);
  await pool.query(
    "UPDATE sessions SET admin_last_activity_at=now()-interval '61 minutes' WHERE user_id=$1",
    [ownerId],
  );
  const denied = await page.request.get("/api/admin/roles");
  expect(denied.status()).toBe(403);
  expect((await denied.json()).error).toContain("60 minutes");
  expect((await (await page.request.get("/api/me")).json()).id).toBe(ownerId);
  await login(page, "release-member@example.invalid");
  expect(
    (await (await page.request.get("/api/me")).json()).permissions,
  ).toContain("admin.access");
});
test("Super Admin enters the real map early; cancelling masked confirmation prevents mutation", async ({
  page,
}) => {
  await login(page);
  await page.goto("/");
  await expect(page.locator(".route-experience")).toBeVisible();
  expect(
    (await (await page.request.get("/api/public")).json()).earlyAccess,
  ).toBe(true);
  expect(
    (
      await post(page, "admin", {
        action: "deactivateSeason",
        id: seasonId,
        payload: "DÉSACTIVER",
      })
    ).status(),
  ).toBe(403);
  await page.goto("/admin");
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Utilisateurs", exact: true })
    .click();
  const row = page.getByRole("row").filter({ hasText: "Camille" });
  await row.locator("summary").click();
  await row.getByRole("button", { name: "Désactiver", exact: true }).click();
  const dialog = page.getByRole("dialog", {
    name: "Confirmer l’action sensible",
  });
  await expect(dialog.getByLabel("Mot de passe")).toHaveAttribute(
    "type",
    "password",
  );
  await dialog.getByRole("button", { name: "Annuler", exact: true }).click();
  expect(
    (
      await pool.query("SELECT account_status FROM users WHERE id=$1", [
        ownerId,
      ])
    ).rows[0].account_status,
  ).toBe("ACTIVE");
  await row.getByRole("button", { name: "Désactiver", exact: true }).click();
  await dialog.getByLabel("Mot de passe").fill(password);
  await dialog.getByRole("button", { name: "Confirmer", exact: true }).click();
  await expect(row).toContainText("Désactivé");
});
test("shared visual editor produces the saved email format and SMTP failure is explicit", async ({
  page,
}) => {
  await login(page);
  await page.goto("/admin");
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Communications", exact: true })
    .click();
  const kinds = page.getByLabel("Type de message");
  await expect(kinds.locator("option")).toHaveCount(6);
  await kinds.selectOption("HOUSE_REFUSED");
  const editor = page.getByRole("textbox", { name: "Message", exact: true });
  await editor.fill("Précision du refus");
  await editor.evaluate((el) => {
    const r = document.createRange();
    r.selectNodeContents(el);
    const s = getSelection()!;
    s.removeAllRanges();
    s.addRange(r);
  });
  await page
    .getByRole("toolbar")
    .getByRole("button", { name: "Gras", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Enregistrer le modèle", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Modèle enregistré");
  expect(
    (await (await page.request.get("/api/admin/templates")).json())
      .HOUSE_REFUSED.body,
  ).toContain("**Précision du refus**");
  await expect(
    page
      .frameLocator('iframe[title="Aperçu du modèle"]')
      .locator("strong")
      .filter({ hasText: "Précision du refus" }),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: "Envoyer un test au Super Admin",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("alert").filter({ hasText: "SMTP non configuré" }),
  ).toBeVisible();
  expect((await pool.query("SELECT * FROM email_tokens")).rows).toHaveLength(0);
  expect((await pool.query("SELECT * FROM email_outbox")).rows).toHaveLength(0);
  expect(
    (await pool.query("SELECT id FROM users WHERE id=$1", [adminId])).rows,
  ).toHaveLength(1);
});
