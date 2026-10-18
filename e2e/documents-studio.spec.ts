import { test, expect } from "@playwright/test";
import { Pool } from "pg";
test.skip(
  !process.env.SEASON_E2E_DATABASE_URL,
  "Requires an explicitly disposable database",
);
const origin = process.env.APP_ORIGIN ?? "http://localhost:3000";
test("live document API and editor: private drafts, offline retry, conflicts, publication, mobile and restore", async ({
  page,
  browser,
}) => {
  const pool = new Pool({
    connectionString: process.env.SEASON_E2E_DATABASE_URL,
  });
  try {
    await pool.query(
      "TRUNCATE instances,bootstrap,setup_sessions,rate_limits RESTART IDENTITY CASCADE",
    );
    const now = Date.now();
    const post = (path: string, data: unknown) =>
      page.request.post("/api/" + path, { headers: { origin }, data });
    const setup = await post("setup", {
      token: process.env.SETUP_TOKEN,
      instance: {
        public_name: "Événement documentaire fictif",
        territory: "Rennes",
        postal_code: "35000",
        country: "France",
        timezone: "Europe/Paris",
        latitude: 48.1,
        longitude: -1.67,
        zoom: 14,
      },
      admin: {
        display_name: "Équipe documentaire",
        email: "documents@example.invalid",
        password: "documents-browser-test-1234",
      },
      season: {
        year: new Date().getFullYear(),
        registrations_open: true,
        registrations_open_at: new Date(now - 3600000).toISOString(),
        opens_at: new Date(now + 86400000).toISOString(),
        closes_at: new Date(now + 2 * 86400000).toISOString(),
        purge_at: new Date(now + 3 * 86400000).toISOString(),
      },
    });
    expect(setup.status()).toBe(200);
    await page.setViewportSize({ width: 1600, height: 1100 });
    await page.goto("/admin");
    await page
      .getByRole("navigation", { name: "Navigation administration" })
      .getByRole("button", { name: "Contenus & documents", exact: true })
      .click();
    const studio = page.locator(".studio-shell");
    await expect(studio.getByRole("textbox")).toBeVisible();
    await studio.getByRole("button", { name: /^Documents officiels/ }).click();
    await studio
      .locator(".studio-document-grid .studio-panel")
      .filter({
        has: page.getByRole("heading", {
          name: "Bonnes pratiques",
          exact: true,
        }),
      })
      .getByRole("button", { name: "Ouvrir le document" })
      .click();
    const surface = studio.getByRole("textbox", { name: "Corps du document" });
    await surface.fill("Titre des consignes de test");
    await studio.getByLabel("Style de paragraphe").selectOption("2");
    await surface.press("End");
    await surface.press("Enter");
    await page.keyboard.type(
      "Gardez les accès dégagés pendant cet événement fictif.",
    );
    await studio.getByLabel("Les informations sont complètes").check();
    await studio.getByLabel("Changement important").check();
    await studio.getByRole("button", { name: "Aperçu fidèle" }).click();
    await expect(studio.locator(".document-preview h2")).toHaveText(
      "Titre des consignes de test",
    );
    await studio.getByLabel("Format de l’aperçu").selectOption("mobile");
    expect(
      await studio
        .locator(".document-mobile")
        .evaluate((e) => e.getBoundingClientRect().width),
    ).toBeLessThanOrEqual(390);
    await studio.getByRole("button", { name: "Rédiger", exact: true }).click();
    await studio
      .getByRole("button", { name: "Enregistrer le brouillon" })
      .click();
    await expect(
      studio.getByRole("button", { name: "Vérifier avant publication" }),
    ).toBeEnabled();
    const before = await (await page.request.get("/api/public")).json();
    expect(before.documents.GUIDELINES.version).toBe("2026.1");
    const state = await (await page.request.get("/api/admin/content")).json();
    const draft = state.documents.find(
      (d: { kind: string; status: string }) =>
        d.kind === "GUIDELINES" && d.status === "DRAFT",
    );
    const denied = await post("admin/content", {
      action: "publish",
      id: draft.id,
    });
    expect(denied.status()).toBe(409);
    // A second editing session updates the same draft.
    const remote = await post("admin/content", {
      action: "draft",
      id: draft.id,
      revision: draft.revision,
      active_version: "2026.1",
      document: {
        ...draft,
        body: "",
        content_json: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "Modification distante" }],
            },
          ],
        },
      },
    });
    expect(remote.status()).toBe(200);
    await surface.fill("Mon texte local à préserver");
    await studio
      .getByRole("button", { name: "Enregistrer le brouillon" })
      .click();
    await expect(studio.getByText(/Ce brouillon a changé/)).toBeVisible();
    await expect(surface).toHaveText("Mon texte local à préserver");
    await studio
      .getByRole("button", { name: "Actualiser les versions" })
      .click();
    await expect(
      studio.getByRole("heading", {
        name: "Modifications concurrentes détectées",
      }),
    ).toBeVisible();
    await expect(
      studio.getByText("Modification distante", { exact: true }),
    ).toBeVisible();
    await studio
      .getByRole("button", { name: "Reprendre mon travail sur cette révision" })
      .click();
    // Interrupted network save must retain the editor; a retry uses the same revision.
    await page.route("**/api/admin/content", async (route) =>
      route.request().method() === "POST"
        ? route.abort("failed")
        : route.continue(),
    );
    await studio
      .getByRole("button", { name: "Enregistrer le brouillon" })
      .click();
    await expect(surface).toHaveText("Mon texte local à préserver");
    await page.unroute("**/api/admin/content");
    await studio
      .getByRole("button", { name: "Enregistrer le brouillon" })
      .click();
    await expect(
      studio.getByRole("button", { name: "Vérifier avant publication" }),
    ).toBeEnabled();
    await studio
      .getByRole("button", { name: "Vérifier avant publication" })
      .click();
    await expect(
      studio.getByText(
        "0 participant(s) concerné(s) par la nouvelle acceptation.",
      ),
    ).toBeVisible();
    await studio.getByLabel("J’ai vérifié l’aperçu et l’impact").check();
    await studio
      .getByRole("button", { name: "Publier la version 2026.2" })
      .click();
    await expect(studio.locator(".studio-document-grid")).toBeVisible();
    const after = await (await page.request.get("/api/public")).json();
    expect(after.documents.GUIDELINES).toMatchObject({
      version: "2026.2",
      format: "tiptap",
      body: "Mon texte local à préserver",
    });
    const anonymous = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    try {
      const phone = await anonymous.newPage();
      expect((await phone.request.get("/api/admin/content")).status()).toBe(
        401,
      );
      await phone.goto("/guidelines");
      await expect(phone.locator(".document-copy")).toHaveText(
        "Mon texte local à préserver",
      );
      expect(
        await phone.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
    } finally {
      await anonymous.close();
    }
    await studio
      .locator(".studio-document-grid .studio-panel")
      .filter({
        has: page.getByRole("heading", {
          name: "Bonnes pratiques",
          exact: true,
        }),
      })
      .getByRole("button", { name: "Ouvrir le document" })
      .click();
    await studio
      .getByRole("button", { name: "Historique & comparaison" })
      .click();
    await studio
      .getByLabel("Version à consulter")
      .selectOption({ label: "2026.1 · Bonnes pratiques" });
    await studio
      .getByRole("button", { name: "Restaurer dans un nouveau brouillon" })
      .click();
    await expect(studio.getByLabel("Version", { exact: true })).toHaveValue(
      "2026.3",
    );
    await expect(
      studio.getByLabel("Les informations sont complètes"),
    ).not.toBeChecked();
    await studio
      .getByRole("button", { name: "Enregistrer le brouillon" })
      .click();
    expect(
      (await (await page.request.get("/api/public")).json()).documents
        .GUIDELINES.version,
    ).toBe("2026.2");
    expect(
      (
        await pool.query(
          "SELECT action FROM legal_events WHERE action='PUBLISHED'",
        )
      ).rows,
    ).toHaveLength(1);
  } finally {
    await pool.end();
  }
});
