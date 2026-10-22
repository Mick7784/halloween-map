import { test, expect } from "@playwright/test";
import { Pool } from "pg";
import { hashPassword } from "../lib/auth";
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
    // Shared Studio formatting controls expose their state without changing commands.
    await expect(studio.getByRole("button", { name: "Aperçu fidèle" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await expect(studio.getByRole("button", { name: "Gras", exact: true })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await studio.getByRole("button", { name: "Aperçu fidèle" }).click();
    await expect(studio.getByRole("button", { name: "Rédiger", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(studio.locator(".document-preview h2")).toHaveText(
      "Titre des consignes de test",
    );
    // The content block inherits the single admin-shell theme.
    await expect(
      page.getByRole("heading", { name: "Contenus & documents", exact: true }),
    ).toHaveCount(1);
    await expect(
      page.getByRole("combobox", { name: "Apparence", exact: true }),
    ).toHaveCount(1);
    await page.getByRole("combobox", { name: "Apparence", exact: true })
      .selectOption("light");
    await expect(studio).toHaveCSS("color", "rgb(32, 43, 59)");
    await expect(studio).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await studio.screenshot({
      path: "test-results/studio/document-desktop-light.png",
      animations: "disabled",
    });
    await page.getByRole("combobox", { name: "Apparence", exact: true })
      .selectOption("dark");
    await expect(studio).toHaveCSS("color", "rgb(230, 235, 242)");
    await studio.screenshot({
      path: "test-results/studio/document-desktop-dark.png",
      animations: "disabled",
    });
    await studio.getByLabel("Format de l’aperçu").selectOption("mobile");
    expect(
      await studio
        .locator(".document-mobile")
        .evaluate((e) => e.getBoundingClientRect().width),
    ).toBeLessThanOrEqual(390);
    await studio.screenshot({
      path: "test-results/studio/document-mobile-preview.png",
      animations: "disabled",
    });
    await studio.getByRole("button", { name: "Rédiger", exact: true }).click();
    await studio.locator(".document-toolbar").scrollIntoViewIfNeeded();
    await page.screenshot({
      path: "test-results/studio/editor-desktop.png",
      animations: "disabled",
    });
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
    expect(after.documents.GUIDELINES.created_by).toBeUndefined();
    expect(after.documents.GUIDELINES.published_by).toBeUndefined();
    const longDraft = await post("admin/content", {
      action: "draft",
      active_version: "2026.1",
      document: {
        kind: "NOTICE",
        version: "2026.2",
        title: "Long document de test",
        body: "",
        format: "tiptap",
        content_json: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "Document long. ".repeat(4000) }],
            },
          ],
        },
        requires_reaccept: false,
        prepared: false,
      },
    });
    expect(longDraft.status()).toBe(200);
    expect(
      (await (await page.request.get("/api/public")).json()).documents.NOTICE
        .version,
    ).toBe("2026.1");
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

test("live reacceptance distinguishes TERMS from guidelines and survives a publication during the user session", async ({
  page,
  browser,
}) => {
  const pool = new Pool({
    connectionString: process.env.SEASON_E2E_DATABASE_URL,
  });
  const password = "document-acceptance-test-1234",
    now = Date.now();
  const post = (path: string, data: unknown) =>
    page.request.post("/api/" + path, { headers: { origin }, data });
  try {
    await pool.query(
      "TRUNCATE instances,bootstrap,setup_sessions,rate_limits RESTART IDENTITY CASCADE",
    );
    expect(
      (
        await post("setup", {
          token: process.env.SETUP_TOKEN,
          instance: {
            public_name: "Test acceptations",
            territory: "Rennes",
            postal_code: "35000",
            country: "France",
            timezone: "Europe/Paris",
            latitude: 48.1,
            longitude: -1.67,
            zoom: 14,
          },
          admin: {
            display_name: "Équipe",
            email: "acceptance-admin@example.invalid",
            password,
          },
          season: {
            year: new Date().getFullYear(),
            registrations_open: true,
            registrations_open_at: new Date(now - 7200000).toISOString(),
            opens_at: new Date(now - 3600000).toISOString(),
            closes_at: new Date(now + 86400000).toISOString(),
            purge_at: new Date(now + 172800000).toISOString(),
          },
        })
      ).status(),
    ).toBe(200);
    await pool.query(
      "UPDATE instances SET active_season_id=(SELECT id FROM seasons LIMIT 1)",
    );
    const user = (
      await pool.query(
        "INSERT INTO users(instance_id,email,display_name,password_hash,kind,role_id,email_status,account_status) SELECT i.id,'acceptance-member@example.invalid','Camille',$1,'PARTICIPANT',r.id,'VERIFIED','ACTIVE' FROM instances i JOIN roles r ON r.instance_id=i.id AND r.name='USER' RETURNING id",
        [await hashPassword(password)],
      )
    ).rows[0];
    const house = (
      await pool.query(
        "INSERT INTO participations(instance_id,season_id,user_id,name,address,latitude,longitude,activities,starts_at,ends_at,fear,terms_version,guidelines_version,guidelines_accepted_at,review_status,status,activity,address_parts) SELECT i.id,s.id,$1,'Maison de test','12 Rue des Lanternes, 35000 Rennes',48.1,-1.67,ARRAY['CANDY'],now()-interval '20 minutes',now()+interval '2 hours',2,NULL,'2026.1',now(),'VALIDATED','VISIBLE','ACTIVE',$2::jsonb FROM instances i JOIN seasons s ON s.instance_id=i.id RETURNING id",
        [
          user.id,
          JSON.stringify({
            number: "12",
            street: "Rue des Lanternes",
            postalCode: "35000",
            city: "Rennes",
            cityCode: "35238",
          }),
        ],
      )
    ).rows[0];
    const member = await browser.newContext();
    try {
      const phone = await member.newPage();
      expect(
        (
          await phone.request.post("/api/login", {
            headers: { origin },
            data: { email: "acceptance-member@example.invalid", password },
          })
        ).status(),
      ).toBe(200);
      async function publish(version: string, base: string) {
        const result = await post("admin/content", {
          action: "draft",
          active_version: base,
          document: {
            kind: "TERMS",
            version,
            title: "CGU de test uniquement",
            body: "Document fictif pour tester une acceptation explicite.",
            prepared: true,
            requires_reaccept: true,
          },
        });
        expect(result.status()).toBe(200);
        const d = (await result.json()).document;
        expect(
          (
            await post("admin/content", {
              action: "publish",
              id: d.id,
              revision: d.revision,
              active_version: base,
              confirmed: true,
              affected: 1,
            })
          ).status(),
        ).toBe(200);
      }
      await publish("2026.2", "2026.1");
      // Reproduce the legacy bug: a version was written without acceptance.
      await pool.query(
        "UPDATE participations SET terms_version='2026.2',terms_accepted_at=NULL WHERE id=$1",
        [house.id],
      );
      const map = await (await phone.request.get("/api/public")).json();
      expect(map.houses.map((h: { id: string }) => h.id)).toContain(house.id);
      await phone.goto("/participant");
      const form = phone.locator("#participation-form");
      await expect(form.getByText(/Les conditions ont évolué/)).toBeVisible();
      await expect(
        form.getByRole("button", { name: "Enregistrer les modifications" }),
      ).toBeDisabled();
      await form
        .getByRole("checkbox", { name: /J’ai pris connaissance des/ })
        .check();
      await expect(
        form.getByRole("checkbox", { name: /J’ai pris connaissance des/ }),
      ).toBeChecked();
      await expect(
        form.getByRole("button", { name: "Enregistrer les modifications" }),
      ).toBeDisabled();
      expect(
        (
          await pool.query(
            "SELECT terms_version,terms_accepted_at FROM participations WHERE id=$1",
            [house.id],
          )
        ).rows[0],
      ).toEqual({ terms_version: "2026.2", terms_accepted_at: null });
      await form.getByLabel(/J’accepte les conditions générales/).check();
      // New publication while the old version is still open must fail safely.
      await publish("2026.3", "2026.2");
      await form
        .getByRole("button", { name: "Enregistrer les modifications" })
        .click();
      await expect(form.getByText(/Les documents ont changé/)).toBeVisible();
      await form
        .getByRole("button", { name: "Actualiser les documents à lire" })
        .click();
      await expect(
        form.getByLabel(/J’accepte les conditions générales/),
      ).not.toBeChecked();
      await form.getByLabel(/J’accepte les conditions générales/).check();
      await form.getByLabel(/J’ai pris connaissance des/).check();
      await form
        .getByRole("button", { name: "Enregistrer les modifications" })
        .click();
      await expect(form.getByText("Modifications enregistrées.")).toBeVisible();
      const proof = (
        await pool.query(
          "SELECT kind,version,action FROM legal_events WHERE user_id=$1 AND kind='TERMS'",
          [user.id],
        )
      ).rows;
      expect(proof).toEqual([
        { kind: "TERMS", version: "2026.3", action: "ACCEPTED" },
      ]);
    } finally {
      await member.close();
    }
  } finally {
    await pool.end();
  }
});
