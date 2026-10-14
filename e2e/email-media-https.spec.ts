import { test, expect, request as apiRequest } from "@playwright/test";
import { Pool } from "pg";
import sharp from "sharp";
import { DateTime } from "luxon";
import { setup } from "../lib/service";

const origin = "https://127.0.0.1:3443";
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const password = "https-test-password-only-1234";
test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  await pool.query(
    "TRUNCATE bootstrap,setup_sessions,instances,roles,users,seasons,participations,sessions,audit_logs,rate_limits RESTART IDENTITY CASCADE",
  );
  const opens = DateTime.now().setZone("Europe/Paris").plus({ days: 3 })
    .set({ hour: 18, minute: 0, second: 0, millisecond: 0 });
  await setup({
    token: process.env.SETUP_TOKEN,
    instance: {
      public_name: "Halloween HTTPS test", territory: "Rennes",
      postal_code: "35000", country: "France", timezone: "Europe/Paris",
      latitude: 48.1, longitude: -1.67, zoom: 14,
    },
    admin: {
      display_name: "Équipe HTTPS", email: "admin@example.invalid", password,
    },
    season: {
      year: opens.year,
      registrations_open: true,
      registrations_open_at: opens.minus({ days: 30 }).toFormat("yyyy-MM-dd'T'HH:mm"),
      opens_at: opens.toFormat("yyyy-MM-dd'T'HH:mm"),
      closes_at: opens.plus({ hours: 5 }).toFormat("yyyy-MM-dd'T'HH:mm"),
      purge_at: opens.plus({ days: 3 }).toFormat("yyyy-MM-dd'T'HH:mm"),
    },
  });
});

test.afterAll(async () => {
  await pool.end();
  await (globalThis as unknown as { halloweenPool?: Pool }).halloweenPool?.end();
});

test("HTTPS UI upload, library, saved template and unauthenticated image access", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/login");
  await page.locator("main").getByLabel("Email", { exact: false }).fill("admin@example.invalid");
  await page.locator("main").getByLabel("Mot de passe", { exact: false }).fill(password);
  await page.locator("main").getByRole("button", { name: "Se connecter", exact: true }).click();
  await page.waitForURL("/");
  await page.goto("/admin");
  await page.getByRole("navigation", { name: "Navigation administration" })
    .getByRole("button", { name: "Communications", exact: true }).click();
  await page.getByRole("button", { name: "Passer à l’éditeur HTML complet" }).click();
  await page.getByRole("button", { name: "Image", exact: true }).click();
  const png = await sharp({ create: {
    width: 64, height: 64, channels: 4, background: "#ff922f",
  } }).png().toBuffer();
  await page.getByLabel("Importer une image").setInputFiles({
    name: "citrouille-test.png", mimeType: "image/png", buffer: png,
  });
  await expect(page.getByText(/Bibliothèque : 1\/60 images actives/)).toBeVisible();
  const gallery = await page.request.get("/api/admin/email-media");
  expect(gallery.status()).toBe(200);
  const entries = await gallery.json();
  expect(entries.images).toHaveLength(1);
  const asset = entries.images[0] as { id: string; url: string };
  expect(asset.url).toMatch(/^https:\/\/127\.0\.0\.1:3443\/api\/email-media\//);
  await page.getByLabel("Choisir une image de la bibliothèque").selectOption(asset.id);
  await page.getByRole("button", { name: "Insérer l’image" }).click();
  await page.getByRole("button", { name: "HTML", exact: true }).click();
  await expect(page.getByLabel("Code source HTML de l'email")).toHaveValue(new RegExp(asset.id));
  await page.getByRole("button", { name: "Enregistrer le modèle" }).click();
  await expect(page.getByRole("status").filter({ hasText: /Modèle enregistré/ })).toBeVisible();
  const templates = await (await page.request.get("/api/admin/templates")).json();
  expect(JSON.stringify(templates)).toContain(asset.id);

  // A recipient must be able to load the sent image with no session cookie.
  const anonymous = await apiRequest.newContext({ ignoreHTTPSErrors: true });
  try {
    const publicAsset = await anonymous.get(asset.url);
    expect(publicAsset.status()).toBe(200);
    expect(publicAsset.headers()["content-type"]).toBe("image/webp");
    const denied = await anonymous.post(origin + "/api/admin/email-media", {
      headers: { origin },
      multipart: { image: { name: "private.png", mimeType: "image/png", buffer: png } },
    });
    expect([401, 403]).toContain(denied.status());
  } finally {
    await anonymous.dispose();
  }
});
