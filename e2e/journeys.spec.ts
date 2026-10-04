import { randomBytes, createHash } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { Pool } from "pg";
import { readFile } from "node:fs/promises";
import { DateTime } from "luxon";
const zone = "Europe/Paris";
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const bootstrapSecret = randomBytes(32).toString("base64url");
const year = DateTime.now().setZone(zone).year;
test.describe.configure({ mode: "serial" });
test.beforeAll(async () => {
  await pool.query(
    "TRUNCATE bootstrap,setup_sessions,instances,roles,users,seasons,houses,sessions,audit_logs,rate_limits RESTART IDENTITY CASCADE",
  );
  await pool.query("INSERT INTO bootstrap(secret_hash) VALUES($1)", [
    createHash("sha256").update(bootstrapSecret).digest("hex"),
  ]);
});
test.afterAll(async () => {
  await pool.end();
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
test("countdown hides positions; participant registers, updates and manages activity", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Les portes s’ouvriront bientôt." }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/countdown-mobile.png",
    fullPage: true,
  });
  await page.goto("/register");
  await page
    .getByLabel("Email", { exact: false })
    .fill("visitor@example.invalid");
  await page
    .getByLabel("Mot de passe", { exact: false })
    .fill("browser-password-1234");
  await page.getByLabel("Nom fictif", { exact: false }).fill("La maison test");
  await page
    .getByLabel("Adresse de la maison", { exact: false })
    .fill("1 allée fictive");
  await page.getByRole("button", { name: "Inscrire ma maison" }).click();
  await page.waitForURL("/participant");
  await expect(
    page.getByText("Votre maison attend la validation", { exact: false }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/participant-mobile.png",
    fullPage: true,
  });
  for (const [width, height, label] of [
    [820, 1180, "tablet"],
    [1920, 1080, "1080p"],
    [2560, 1440, "1440p"],
  ] as const) {
    await page.setViewportSize({ width, height });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: "test-results/participant-" + label + ".png",
      fullPage: true,
    });
  }
  const denied = await page.request.get("/api/admin/users");
  expect(denied.status()).toBe(403);
  await page.getByRole("button", { name: "Mettre en pause" }).click();
  await expect(page.getByText("En pause", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Reprendre mon accueil" }).click();
  await expect(page.getByText("En activité", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Je n’ai plus de bonbons" }).click();
  await expect(
    page.getByRole("button", { name: "J’ai de nouveau des bonbons" }),
  ).toBeVisible();
});
test("admin demonstration, reminder settings and responsive visual references", async ({
  page,
  context,
  browser,
}) => {
  await mockMap(page);
  await login(page);
  await page.getByRole("button", { name: "Maisons", exact: true }).click();
  await page.getByRole("button", { name: "Valider", exact: true }).click();
  await page
    .getByRole("button", { name: "Tableau de bord", exact: true })
    .click();
  await expect(page.locator(".dashboard-map .house-marker")).toHaveCount(1, {
    timeout: 15000,
  });
  for (const [width, height, label] of [
    [390, 844, "mobile"],
    [820, 1180, "tablet"],
    [1920, 1080, "1080p"],
    [2560, 1440, "1440p"],
  ] as const) {
    await page.setViewportSize({ width, height });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: "test-results/dashboard-" + label + ".png",
      fullPage: true,
    });
  }
  await page.getByRole("button", { name: "Saison", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Mode démonstration" }),
  ).toBeVisible();
  await page.getByLabel("Activer cette saison", { exact: false }).check();
  await page
    .getByRole("button", { name: "Enregistrer la saison", exact: true })
    .click();
  await expect(
    page.getByText("Envoi email indisponible", { exact: false }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Prévisualiser le message", exact: true })
    .click();
  await expect(
    page.getByText("APERÇU DU MESSAGE", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Fermer la prévisualisation email").click();
  await page.getByLabel("Activer le rappel", { exact: true }).check();
  await page
    .getByRole("button", { name: "Enregistrer le rappel", exact: true })
    .click();
  await expect(page.getByText("Programmé", { exact: true })).toBeVisible();
  for (const [width, height, label] of [
    [390, 844, "mobile"],
    [820, 1180, "tablet"],
    [1920, 1080, "1080p"],
    [2560, 1440, "1440p"],
  ] as const) {
    await page.setViewportSize({ width, height });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: "test-results/season-" + label + ".png",
      fullPage: true,
    });
  }
  await page.getByLabel("Activer pour ma session", { exact: true }).check();
  await page
    .getByLabel("Heure simulée", { exact: false })
    .fill(year + "-10-31T18:00");
  await page
    .getByRole("button", {
      name: "Appliquer le mode démonstration",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("link", { name: "Ouvrir la prévisualisation", exact: true }),
  ).toBeVisible();
  const countBefore = (await pool.query("SELECT routes_count FROM seasons"))
    .rows[0].routes_count;
  const preview = await context.newPage();
  await mockMap(preview);
  await preview.goto("/preview");
  await expect(
    preview.getByText("MODE DÉMONSTRATION", { exact: false }),
  ).toBeVisible();
  await expect(preview.locator(".house-marker")).toHaveCount(1, {
    timeout: 15000,
  });
  await preview.getByRole("button", { name: "Liste", exact: true }).click();
  await preview.getByRole("button", { name: /La maison test/ }).click();
  await expect(preview.getByRole("dialog")).toBeVisible();
  for (const [width, height, label] of [
    [390, 844, "mobile"],
    [1440, 1000, "desktop"],
  ] as const) {
    await preview.setViewportSize({ width, height });
    await preview.screenshot({
      path: "test-results/house-detail-" + label + ".png",
      fullPage: true,
    });
  }
  await preview.keyboard.press("Tab");
  expect(
    await preview.evaluate(
      () =>
        !!document
          .querySelector('[role="dialog"]')
          ?.contains(document.activeElement),
    ),
  ).toBe(true);
  await preview.keyboard.press("Escape");
  await expect(preview.getByRole("dialog")).toHaveCount(0);
  await preview
    .getByRole("button", { name: "Créer mon parcours", exact: true })
    .click();
  await expect(preview.getByRole("heading", { name: /1 étape/ })).toBeVisible();
  expect(
    (await pool.query("SELECT routes_count FROM seasons")).rows[0].routes_count,
  ).toBe(countBefore);
  await preview.getByRole("button", { name: "Carte", exact: true }).click();
  for (const [width, height, label] of [
    [390, 844, "mobile"],
    [820, 1180, "tablet"],
    [1920, 1080, "1080p"],
    [2560, 1440, "1440p"],
  ] as const) {
    await preview.setViewportSize({ width, height });
    expect(
      await preview.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await preview.screenshot({
      path: "test-results/demo-map-" + label + ".png",
      fullPage: true,
    });
  }
  const anonymous = await browser.newContext();
  const publicPage = await anonymous.newPage();
  await publicPage.goto("/");
  await expect(
    publicPage.getByRole("heading", {
      name: "Les portes s’ouvriront bientôt.",
    }),
  ).toBeVisible();
  expect((await publicPage.request.get("/api/public?preview=1")).status()).toBe(
    401,
  );
  for (const [width, height, label] of [
    [390, 844, "mobile"],
    [820, 1180, "tablet"],
    [1920, 1080, "1080p"],
    [2560, 1440, "1440p"],
  ] as const) {
    await publicPage.setViewportSize({ width, height });
    expect(
      await publicPage.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await publicPage.screenshot({
      path: "test-results/countdown-" + label + ".png",
      fullPage: true,
    });
  }
  await anonymous.close();
  await preview.close();
  await page
    .getByLabel("Heure simulée", { exact: false })
    .fill(year + "-10-30T18:00");
  await page
    .getByRole("button", {
      name: "Appliquer le mode démonstration",
      exact: true,
    })
    .click();
  const countdown = await context.newPage();
  await countdown.goto("/preview");
  await expect(countdown.locator(".countdown-boxes")).toBeVisible();
  await countdown.close();
  await page.getByLabel("Activer pour ma session", { exact: true }).uncheck();
  await page
    .getByRole("button", {
      name: "Appliquer le mode démonstration",
      exact: true,
    })
    .click();
  expect((await page.request.get("/api/public?preview=1")).status()).toBe(403);
});
async function mockMap(page: Page) {
  await page.route(
    "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
    (r) =>
      r.fulfill({
        json: {
          version: 8,
          sources: {
            roads: {
              type: "geojson",
              data: {
                type: "FeatureCollection",
                features: Array.from({ length: 15 }, (_, n) => ({
                  type: "Feature",
                  properties: {},
                  geometry: {
                    type: "LineString",
                    coordinates:
                      n % 2
                        ? [
                            [-1.695, 48.085 + n * 0.002],
                            [-1.645, 48.095 + n * 0.001],
                          ]
                        : [
                            [-1.688 + n * 0.003, 48.082],
                            [-1.681 + n * 0.003, 48.12],
                          ],
                  },
                })),
              },
            },
          },
          layers: [
            {
              id: "bg",
              type: "background",
              paint: { "background-color": "#151923" },
            },
            {
              id: "roads",
              type: "line",
              source: "roads",
              paint: { "line-color": "#30333f", "line-width": 5 },
            },
            {
              id: "roads-core",
              type: "line",
              source: "roads",
              paint: { "line-color": "#20252f", "line-width": 2 },
            },
          ],
        },
      }),
  );
}
test("admin moderates; public sees validated house and creates a feasible route", async ({
  page,
}) => {
  // A deterministic style keeps the browser suite independent of tile-provider DNS.
  // The actual MapLibre canvas, local module worker, markers and route still run.
  await page.route(
    "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
    (r) =>
      r.fulfill({
        json: {
          version: 8,
          sources: {},
          layers: [
            {
              id: "background",
              type: "background",
              paint: { "background-color": "#1a2029" },
            },
          ],
        },
      }),
  );
  await login(page);
  await page.getByRole("button", { name: "Maisons", exact: true }).click();
  await page.getByRole("button", { name: "Valider", exact: true }).click();
  await expect(
    page.getByRole("table").getByText("Validée", { exact: true }),
  ).toBeVisible();
  const now = DateTime.now();
  await pool.query(
    "UPDATE seasons SET activated=true,opens_at=$1,closes_at=$2",
    [now.minus({ hours: 1 }).toISO(), now.plus({ hours: 3 }).toISO()],
  );
  await pool.query("UPDATE houses SET starts_at=$1,ends_at=$2", [
    now.minus({ minutes: 30 }).toISO(),
    now.plus({ hours: 2 }).toISO(),
  ]);
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "La nuit vous appartient." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Liste", exact: true }).click();
  await page.getByRole("button", { name: /La maison test/ }).click();
  await expect(
    page.getByRole("dialog", { name: "La maison test" }),
  ).toBeVisible();
  await expect(
    page.getByRole("dialog").getByText("1 allée fictive", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Fermer la fiche").click();
  await page.getByRole("button", { name: "Créer mon parcours" }).click();
  await expect(page.getByRole("heading", { name: /1 étape/ })).toBeVisible();
  await page.screenshot({
    path: "test-results/public-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Carte", exact: true }).click();
  await expect(page.locator(".map-canvas")).toBeVisible();
  await expect(page.locator(".house-marker")).toHaveCount(1, {
    timeout: 15000,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/map-mobile.png",
    fullPage: true,
  });
  const csrf = await page.request.post("/api/admin", {
    headers: { origin: "https://untrusted.invalid" },
    data: { action: "moderate" },
  });
  expect(csrf.status()).toBe(403);
});
test("participant deletion and annual closure leave only staff and anonymous statistics", async ({
  page,
}) => {
  await login(page, "visitor@example.invalid");
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "Supprimer ma participation" })
    .click();
  await page.waitForURL("/");
  expect(
    (await pool.query("SELECT id FROM users WHERE kind='PARTICIPANT'")).rows,
  ).toHaveLength(0);
  await pool.query(
    "UPDATE seasons SET closes_at=now()-interval '1 second',opens_at=now()-interval '1 hour',purge_at=now()-interval '1 second'",
  );
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "C’est fini pour cette année." }),
  ).toBeVisible();
  expect(
    (await pool.query("SELECT purged_at,stats FROM seasons")).rows[0].purged_at,
  ).not.toBeNull();
  expect(
    (await pool.query("SELECT id FROM users WHERE kind='STAFF'")).rows,
  ).toHaveLength(1);
  const version = (await readFile("VERSION", "utf8")).trim();
  await expect(
    page.getByText("Halloween Map · " + version, { exact: true }),
  ).toBeVisible();
});
