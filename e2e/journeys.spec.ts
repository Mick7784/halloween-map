import { randomBytes, createHash } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { Pool } from "pg";
import { dispatchEmails } from "../lib/mail";
import { DateTime } from "luxon";
const zone = "Europe/Paris";
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const bootstrapSecret = randomBytes(32).toString("base64url");
const year = DateTime.now().setZone(zone).year;
test.describe.configure({ mode: "serial" });
test.beforeAll(async () => {
  await pool.query(
    "TRUNCATE bootstrap,setup_sessions,instances,roles,users,seasons,participations,sessions,audit_logs,rate_limits RESTART IDENTITY CASCADE",
  );
  await pool.query("INSERT INTO bootstrap(secret_hash) VALUES($1)", [
    createHash("sha256").update(bootstrapSecret).digest("hex"),
  ]);
});
test.afterAll(async () => {
  await pool.end();
  await (
    globalThis as unknown as { halloweenPool?: Pool }
  ).halloweenPool?.end();
});
async function login(page: Page, email = "admin@example.invalid") {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: false }).fill(email);
  await page
    .getByLabel("Mot de passe", { exact: false })
    .fill("browser-password-1234");
  await page.getByRole("button", { name: "Me connecter", exact: true }).click();
  await page.waitForURL(
    email === "admin@example.invalid" ? "/admin" : "/participant",
  );
}
test("first-run wizard, mobile/desktop layout and permanent setup lock", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/setup?bootstrap=" + bootstrapSecret);
  await page.waitForURL("/setup/wizard");
  expect(page.url()).not.toContain(bootstrapSecret);
  expect(
    (await page.context().cookies()).find((c) => c.name === "halloween_setup")
      ?.httpOnly,
  ).toBe(true);
  await expect(
    page.getByLabel("Clé de configuration", { exact: false }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Une nuit. Toute votre commune." }),
  ).toBeVisible();
  await page
    .getByLabel("Commune / territoire", { exact: false })
    .fill("Territoire fictif");
  await page.getByLabel("Code postal", { exact: false }).fill("00000");
  await page
    .getByLabel("Déterminer automatiquement", { exact: false })
    .uncheck();
  await page.getByLabel("Latitude", { exact: false }).fill("48.1");
  await page.getByLabel("Longitude", { exact: false }).fill("-1.67");
  await page.screenshot({
    path: "test-results/wizard-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Continuer" }).click();
  await page
    .getByLabel("Nom d’affichage", { exact: false })
    .fill("Équipe test");
  await page
    .getByLabel("Email", { exact: false })
    .fill("admin@example.invalid");
  await page
    .getByLabel("Mot de passe", { exact: false })
    .fill("browser-password-1234");
  await page.getByRole("button", { name: "Continuer" }).click();
  await page.getByRole("button", { name: "Continuer" }).click();
  await page.getByRole("button", { name: "Créer mon événement" }).click();
  await page.waitForURL("/admin");
  await expect(
    page.getByRole("heading", { name: "Tableau de bord" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: "test-results/admin-desktop.png",
    fullPage: true,
  });
  await page.goto("/setup");
  await expect(
    page.getByRole("heading", { name: "Configuration terminée" }),
  ).toBeVisible();
  const result = await page.request.post("/api/setup", {
    headers: { origin: process.env.APP_ORIGIN! },
    data: {
      token: process.env.SETUP_TOKEN,
      instance: {
        public_name: "Test",
        territory: "Test",
        postal_code: "00000",
        country: "France",
        timezone: zone,
        latitude: 0,
        longitude: 0,
        zoom: 13,
      },
      admin: {
        email: "x@example.invalid",
        password: "browser-password-1234",
        display_name: "X",
      },
      season: {
        year,
        opens_at: `${year}-10-31T12:00`,
        closes_at: `${year}-11-01T00:00`,
        activated: false,
        registrations_open: true,
      },
    },
  });
  expect(result.status()).toBe(409);
});
async function delivery(email: string) {
  let link = "";
  await dispatchEmails(new Date(), async (mail) => {
    if (mail.to === email) link = mail.text.match(/https?:[^\s]+/)?.[0] ?? "";
  });
  expect(link).toContain("token=");
  return link;
}
test("signup → verify email → participation and required terms, mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/register");
  await expect(
    page.getByRole("heading", { name: "Vos données restent les vôtres." }),
  ).toBeVisible();
  await page.getByLabel("Nom ou pseudo").fill("Visiteur test");
  await page
    .getByLabel("Email", { exact: false })
    .fill("visitor@example.invalid");
  await page
    .getByLabel("Mot de passe", { exact: false })
    .fill("browser-password-1234");
  await page
    .getByRole("button", { name: "Créer mon compte", exact: true })
    .click();
  await page.waitForURL("**/account?created=1");
  await expect(
    page.getByText("Email non vérifié", { exact: true }),
  ).toBeVisible();
  await page.goto(await delivery("visitor@example.invalid"));
  await page.waitForURL("**/account?verified=1");
  expect(page.url()).not.toContain("token=");
  await expect(page.getByText("Email vérifié", { exact: true })).toBeVisible();
  await page.goto("/participant");
  await page.getByLabel("Nom fictif", { exact: false }).fill("La maison test");
  await page
    .getByLabel("Adresse de la maison", { exact: false })
    .fill("1 allée fictive");
  await page
    .getByRole("button", { name: "Envoyer ma participation", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("heading", { name: "Avant de participer" }),
  ).toBeVisible();
  const confirm = dialog.getByRole("button", {
    name: "Confirmer ma participation",
  });
  await expect(confirm).toBeDisabled();
  await dialog
    .getByRole("checkbox", { name: "Je confirme avoir lu", exact: false })
    .check();
  await dialog
    .getByRole("checkbox", { name: "J’ai lu et j’accepte", exact: false })
    .check();
  await confirm.click();
  await expect(
    page.getByText("En attente", { exact: true }).first(),
  ).toBeVisible();
  expect(
    (
      await pool.query(
        "SELECT terms_version,guidelines_version FROM participations",
      )
    ).rows[0],
  ).toEqual({ terms_version: "2026.1", guidelines_version: "2026.1" });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/participation-mobile.png",
    fullPage: true,
  });
  const denied = await page.request.get("/api/admin/users");
  expect(denied.status()).toBe(403);
});
test("admin invitation → one-use email → choose password and read-only administration", async ({
  page,
}) => {
  await login(page);
  await page.getByRole("button", { name: "Utilisateurs", exact: true }).click();
  await page
    .getByRole("button", { name: "Créer un utilisateur", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Nom ou pseudo").fill("Lecteur invité");
  await dialog
    .getByLabel("Email", { exact: false })
    .fill("reader@example.invalid");
  await dialog.getByLabel("Profil").selectOption({ label: "Lecture seule" });
  await expect(dialog.getByLabel("Mot de passe", { exact: false })).toHaveCount(
    0,
  );
  await dialog.getByRole("button", { name: "Envoyer une invitation" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const link = await delivery("reader@example.invalid");
  await page.request.post("/api/logout", {
    headers: { origin: process.env.APP_ORIGIN! },
    data: {},
  });
  await page.goto(link);
  await page.waitForURL("**/activation");
  expect(page.url()).not.toContain("token=");
  await page
    .getByLabel("Votre mot de passe", { exact: false })
    .fill("reader-password-1234");
  await page
    .getByRole("button", { name: "Activer mon compte", exact: true })
    .click();
  await page.waitForURL("**/account");
  await expect(page.getByText("Email vérifié", { exact: true })).toBeVisible();
  await page.goto("/admin");
  await expect(
    page.getByRole("heading", { name: "Tableau de bord", exact: true }),
  ).toBeVisible();
  const denied = await page.request.post("/api/admin", {
    headers: { origin: process.env.APP_ORIGIN! },
    data: {
      action: "role",
      payload: { name: "ESCALATION", permissions: ["roles.manage"] },
    },
  });
  expect(denied.status()).toBe(403);
});
test("individual permissions authorize and revoke administration independently of legacy kind", async ({
  page,
}) => {
  await login(page);
  await page.getByRole("button", { name: "Utilisateurs", exact: true }).click();
  await page
    .getByRole("button", { name: "Visiteur test", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Profil").selectOption({ label: "Lecture seule" });
  await dialog
    .getByRole("button", { name: "Enregistrer l’utilisateur" })
    .click();
  await dialog.getByRole("button", { name: "Fermer", exact: true }).click();
  await page.request.post("/api/logout", {
    headers: { origin: process.env.APP_ORIGIN! },
    data: {},
  });
  await page.goto("/login");
  await page
    .getByLabel("Email", { exact: false })
    .fill("visitor@example.invalid");
  await page
    .getByLabel("Mot de passe", { exact: false })
    .fill("browser-password-1234");
  await page.getByRole("button", { name: "Me connecter", exact: true }).click();
  await page.waitForURL("**/admin");
  await expect(
    page.getByRole("heading", { name: "Tableau de bord", exact: true }),
  ).toBeVisible();
  const me = await (await page.request.get("/api/me")).json();
  expect(me.kind).toBe("PARTICIPANT");
  expect(me.permissions).toContain("admin.access");
});
test("CMS publishes editorial text visible publicly and versioned legal document", async ({
  page,
}) => {
  await login(page);
  await page.getByRole("button", { name: "Contenus", exact: true }).click();
  await page.getByLabel("Contenu à modifier").selectOption("home.title");
  await page
    .getByLabel("Texte", { exact: true })
    .fill("La nuit des lanternes à {{territory}}");
  await page
    .getByRole("button", { name: "Enregistrer le contenu", exact: true })
    .click();
  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      name: "La nuit des lanternes à Territoire fictif",
    }),
  ).toBeVisible();
  await page.goto("/admin");
  await page.getByRole("button", { name: "Contenus", exact: true }).click();
  await page.getByRole("button", { name: "Documents", exact: true }).click();
  await page
    .getByText("Préparer une nouvelle version", { exact: true })
    .click();
  await page
    .getByLabel("Version (ex. 2027.2)", { exact: false })
    .fill("2026.2");
  await page
    .getByLabel("Document", { exact: true })
    .last()
    .fill("## Conditions actualisées\n\nRespectez les horaires.");
  await page.getByRole("button", { name: "Créer le brouillon" }).click();
  await page.getByRole("button", { name: "Publier cette version" }).click();
  await page.goto("/terms");
  await expect(
    page.getByText("Version 2026.2", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Conditions actualisées" }),
  ).toBeVisible();
});
test("relative campaign → outbox delivery once → purge retains accounts and removes addresses", async ({
  page,
}) => {
  await login(page);
  await page.getByRole("button", { name: "Saison", exact: true }).click();
  await page.getByRole("button", { name: "Nouvelle campagne" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Nom interne").fill("Bienvenue aux participants");
  await dialog.getByLabel("Décalage en jours", { exact: false }).fill("-30");
  await dialog.getByRole("button", { name: "Enregistrer la campagne" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const sent: string[] = [];
  await dispatchEmails(new Date(), async (m) => {
    sent.push(m.to);
  });
  await dispatchEmails(new Date(), async (m) => {
    sent.push(m.to);
  });
  expect(sent).toEqual(["visitor@example.invalid"]);
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Purger maintenant" }).click();
  await expect(page.getByText("Purgée", { exact: true }).first()).toBeVisible();
  expect((await pool.query("SELECT * FROM participations")).rows).toHaveLength(
    0,
  );
  expect(
    (await pool.query("SELECT * FROM email_outbox WHERE season_id IS NOT NULL"))
      .rows,
  ).toHaveLength(0);
  expect((await pool.query("SELECT * FROM users")).rows).toHaveLength(3);
  expect(
    (
      await pool.query(
        "SELECT sent FROM email_campaigns WHERE name='Bienvenue aux participants'",
      )
    ).rows[0].sent,
  ).toBe(1);
  await page.goto("/");
  const manifest = await (
    await page.request.get("/manifest.webmanifest")
  ).json();
  expect(manifest.display).toBe("standalone");
  expect(manifest.icons).toHaveLength(3);
  await expect
    .poll(() =>
      page.evaluate(() =>
        navigator.serviceWorker.getRegistration().then((r) => !!r),
      ),
    )
    .toBe(true);
  const cachesList = await page.evaluate(async () => {
    const entries = await Promise.all(
      (await caches.keys()).map(async (key) =>
        (await (await caches.open(key)).keys()).map(
          (r) => new URL(r.url).pathname,
        ),
      ),
    );
    return entries.flat();
  });
  expect(
    cachesList.some(
      (p) => p.startsWith("/api/") || p === "/participant" || p === "/account",
    ),
  ).toBe(false);
});
