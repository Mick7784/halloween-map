import { test, expect, type Page } from "@playwright/test";
import { Pool } from "pg";
import { DateTime } from "luxon";
import { setup, adminAction } from "../lib/service";
import { dispatchEmails, smtpSender } from "../lib/mail";
import { createAccount } from "../lib/accounts";
import { getUser } from "../lib/auth";
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const globals = globalThis as unknown as { testDb?: Pool };
const password = "release-browser-password-1234",
  origin = process.env.APP_ORIGIN ?? "http://localhost:3000";
let ownerId: string, adminId: string, seasonId: string;
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
      territory: "Rennes",
      postal_code: "35000",
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
function mimePart(raw: string, type: "html" | "plain") {
  const match = raw.match(
    new RegExp(
      "Content-Type: text/" + type + "[^]*?\\r\\n\\r\\n([^]*?)(?=\\r\\n--)",
      "i",
    ),
  );
  expect(match, type + " MIME part").toBeTruthy();
  const encoded = match![1].replace(/=\r\n/g, "");
  return Buffer.from(
    encoded.replace(/=([\dA-F]{2})/gi, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16)),
    ),
    "binary",
  ).toString("utf8");
}
test("SMTP STARTTLS is required and delivers the same multipart message", async ({
  request,
}) => {
  await request.get("http://127.0.0.1:3108/reset");
  const previous = {
    port: process.env.SMTP_PORT,
    secure: process.env.SMTP_SECURE,
  };
  try {
    process.env.SMTP_PORT = "3109";
    process.env.SMTP_SECURE = "false";
    await smtpSender()({
      to: "release-admin@example.invalid",
      subject: "STARTTLS fixture",
      text: "Message sécurisé de test",
      html: "<p>Message sécurisé de test</p>",
      messageId: "<starttls@halloween-map.local>",
    });
    const captured = await (
      await request.get("http://127.0.0.1:3108/messages")
    ).json();
    expect(captured).toHaveLength(1);
    expect(mimePart(captured[0].raw, "plain")).toContain("Message sécurisé");
    expect(mimePart(captured[0].raw, "html")).toContain("Message sécurisé");
  } finally {
    process.env.SMTP_PORT = previous.port;
    process.env.SMTP_SECURE = previous.secure;
  }
});
test("six models travel through real TLS SMTP with HTML/text, inert previews and mobile layouts", async ({
  page,
  request,
}) => {
  await login(page);
  await request.get("http://127.0.0.1:3108/reset");
  for (const kind of [
    "VERIFY",
    "INVITE",
    "RESET",
    "HOUSE_SUBMITTED",
    "HOUSE_APPROVED",
    "HOUSE_REFUSED",
  ]) {
    await pool.query("DELETE FROM rate_limits");
    const response = await post(page, "admin/templates", {
      action: "test",
      kind,
    });
    expect(response.status(), await response.text()).toBe(200);
  }
  const mails = await (
    await request.get("http://127.0.0.1:3108/messages")
  ).json();
  expect(mails).toHaveLength(6);
  for (const [index, mail] of mails.entries()) {
    expect(mail.recipients).toEqual(["release-admin@example.invalid"]);
    const html = mimePart(mail.raw, "html"),
      text = mimePart(mail.raw, "plain");
    expect(html).toContain("Halloween");
    expect(text.trim().length).toBeGreaterThan(30);
    if (index < 3) {
      expect(html).toContain("https://example.invalid/preview");
      expect(text).toContain("https://example.invalid/preview");
    }
    await page.setViewportSize({ width: 320, height: 640 });
    await page.setContent(html);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(320);
    await page.screenshot({
      path: `test-results/v081-email-${index}-mobile.png`,
      fullPage: true,
    });
  }
  expect((await pool.query("SELECT * FROM email_tokens")).rows).toHaveLength(0);
  expect((await pool.query("SELECT * FROM email_outbox")).rows).toHaveLength(0);
});
test("user profile edit is separate, cancels cleanly and confirms actual grade/grants before persisting", async ({
  page,
}) => {
  await login(page);
  await page.goto("/admin");
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Utilisateurs", exact: true })
    .click();
  const row = page.locator("tr.admin-clickable-row").filter({ hasText: "Camille" });
  await row
    .getByRole("button", { name: "Voir la fiche de Camille", exact: true })
    .click();
  const sheet = page.locator(".admin-inline-detail");
  await expect(sheet.getByLabel("Profil")).toHaveCount(0);
  await sheet
    .getByRole("button", { name: "Modifier l’utilisateur", exact: true })
    .click();
  const roles = (await pool.query("SELECT * FROM roles")).rows;
  await sheet
    .getByLabel("Profil")
    .selectOption(roles.find((r) => r.name === "ADMIN").id);
  await sheet
    .getByRole("button", { name: "Tout sélectionner", exact: true })
    .click();
  await sheet
    .getByRole("button", { name: "Enregistrer l’utilisateur", exact: true })
    .click();
  const confirmation = page.getByRole("dialog", {
    name: "Confirmer l’action sensible",
  });
  await confirmation
    .getByRole("button", { name: "Annuler", exact: true })
    .click();
  expect(
    (await pool.query("SELECT role_id FROM users WHERE id=$1", [ownerId]))
      .rows[0].role_id,
  ).toBe(roles.find((r) => r.name === "USER").id);
  await sheet
    .getByRole("button", { name: "Enregistrer l’utilisateur", exact: true })
    .click();
  await confirmation.getByLabel("Mot de passe").fill(password);
  await confirmation
    .getByRole("button", { name: "Confirmer", exact: true })
    .click();
  await expect(
    sheet.getByRole("button", { name: "Modifier l’utilisateur", exact: true }),
  ).toBeVisible();
  await expect(sheet).toContainText("Admin");
  await sheet.getByRole("button", { name: "Refermer la fiche Camille" }).click();
  await expect(row).toContainText("Admin");
  const persisted = (
    await pool.query(
      "SELECT role_id,admin_permissions FROM users WHERE id=$1",
      [ownerId],
    )
  ).rows[0];
  expect(persisted.role_id).toBe(roles.find((r) => r.name === "ADMIN").id);
  expect(persisted.admin_permissions).toContain("users.manage");
});
test("real API rejects forged addresses; house decisions dispatch one message and USER deletion is attributed", async ({
  page,
  request,
}) => {
  await login(page, "release-member@example.invalid");
  const now = Date.now();
  const house = {
    name: "Maison des lanternes",
    address: "12 Rue des Lanternes 35000 Rennes",
    position_confirmed: true,
    latitude: 48.1,
    longitude: -1.67,
    activities: ["CANDY"],
    starts_at: new Date(now + 86400000).toISOString(),
    ends_at: new Date(now + 2 * 86400000 - 3600000).toISOString(),
    fear: 2,
    adaptable: false,
    rp: "Ambiance",
    practical: "",
  };
  const acceptance = {
    mode: "GUIDELINES_ONLY",
    guidelines: true,
    guidelines_version: "2026.1",
  };
  expect(
    (await post(page, "participation", { house, acceptance })).status(),
  ).toBe(400);
  const valid = {
    ...house,
    address_parts: {
      number: "12",
      street: "Rue des Lanternes",
      postalCode: "35000",
      city: "Rennes",
      cityCode: "35238",
    },
  };
  await page.goto("/participant");
  const form = page.locator("#participation-form");
  await form.getByLabel("Nom de la maison").fill(house.name);
  await expect(form.getByLabel("Code postal")).toHaveValue("35000");
  await expect(form.getByLabel("Code postal")).toHaveAttribute("readonly", "");
  await expect(form.getByLabel("Ville")).toHaveValue("Rennes");
  await form.getByLabel("Numéro").fill("12");
  await form.getByLabel("Rue", { exact: false }).fill("Rue des Lanternes");
  await form
    .getByRole("button", {
      name: "12 Rue des Lanternes 35000 Rennes",
      exact: true,
    })
    .click();
  await form
    .getByRole("button", {
      name: "Confirmer le point de ma maison",
      exact: true,
    })
    .click();
  await form.getByLabel("Bonbons", { exact: true }).check();
  await expect(form.getByLabel("Heure de début")).toHaveValue("");
  await expect(form.getByLabel("Heure de fin")).toHaveValue("");
  await expect(form.getByLabel("Date de début")).toHaveValue(
    `${new Date().getFullYear()}-10-31`,
  );
  const startDate = DateTime.fromISO(house.starts_at)
    .setZone("Europe/Paris")
    .plus({ minutes: 2 });
  const endDate = DateTime.fromISO(house.ends_at).setZone("Europe/Paris");
  await form.getByLabel("Date de début").fill(startDate.toFormat("yyyy-MM-dd"));
  await form.getByLabel("Heure de début").fill(startDate.toFormat("HH:mm"));
  await form.getByLabel("Date de fin").fill(endDate.toFormat("yyyy-MM-dd"));
  await form.getByLabel("Heure de fin").fill(endDate.toFormat("HH:mm"));
  await form.getByRole("checkbox", { name: /J’ai pris connaissance/ }).check();
  const submittedPromise = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/participation") && r.request().method() === "POST",
  );
  await form
    .getByRole("button", { name: "Envoyer ma participation", exact: true })
    .click();
  const submitted = await submittedPromise;
  expect(submitted.status(), await submitted.text()).toBe(200);
  const h = (
    await pool.query("SELECT * FROM participations WHERE user_id=$1", [ownerId])
  ).rows[0];
  await request.get("http://127.0.0.1:3108/reset");
  await dispatchEmails(new Date(), smtpSender());
  await login(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/admin");
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Maisons", exact: true })
    .click();
  const card = page.locator("tr.admin-clickable-row").filter({ hasText: house.name });
  await card.click();
  const sheet = page.locator(".admin-inline-detail");
  await expect(sheet.getByRole("tab", { name: "Informations" })).toBeVisible();
  await expect(sheet.getByRole("tab", { name: "Modération" })).toBeVisible();
  await expect(sheet.getByRole("tab", { name: "Gestion" })).toBeVisible();
  await sheet.getByRole("tab", { name: "Modération" }).click();
  await page.screenshot({
    path: "test-results/v094-house-inline-desktop.png",
    fullPage: true,
  });
  await sheet.getByRole("button", { name: "Valider la maison", exact: true }).click();
  await expect(sheet).toContainText("Validée");
  await sheet.getByRole("tab", { name: "Gestion" }).click();
  await sheet
    .getByRole("button", { name: "Plus de bonbons et fermer", exact: true })
    .click();
  await expect(
    sheet.getByRole("button", { name: "Rouvrir la maison", exact: true }),
  ).toBeVisible();
  await sheet
    .getByRole("button", { name: "Rouvrir la maison", exact: true })
    .click();
  await expect(
    sheet.getByRole("button", { name: "Fermer la maison", exact: true }),
  ).toBeVisible();
  await sheet
    .getByRole("button", {
      name: "Remettre les bonbons disponibles",
      exact: true,
    })
    .click();
  await expect(
    sheet.getByRole("button", {
      name: "Plus de bonbons et fermer",
      exact: true,
    }),
  ).toBeVisible();
  expect(
    (
      await pool.query(
        "SELECT review_status,activity,candy_available FROM participations WHERE id=$1",
        [h.id],
      )
    ).rows[0],
  ).toMatchObject({
    review_status: "VALIDATED",
    activity: "ACTIVE",
    candy_available: true,
  });
  await dispatchEmails(new Date(), smtpSender());
  await dispatchEmails(new Date(), smtpSender());
  expect(
    await (await request.get("http://127.0.0.1:3108/messages")).json(),
  ).toHaveLength(2);
  expect(
    (
      await pool.query(
        "SELECT kind,status FROM email_outbox WHERE participation_id=$1 ORDER BY created_at",
        [h.id],
      )
    ).rows,
  ).toMatchObject([
    { kind: "HOUSE_SUBMITTED", status: "SENT" },
    { kind: "HOUSE_APPROVED", status: "SENT" },
  ]);
  await login(page, "release-member@example.invalid");
  expect(
    (
      await post(page, "house", { ...valid, rp: "Une nouvelle ambiance" })
    ).status(),
  ).toBe(200);
  expect(
    (
      await pool.query("SELECT review_status FROM participations WHERE id=$1", [
        h.id,
      ])
    ).rows[0].review_status,
  ).toBe("PENDING");
  await dispatchEmails(new Date(), smtpSender());
  await login(page);
  await page.goto("/admin");
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Maisons", exact: true })
    .click();
  await card.click();
  await sheet.getByRole("tab", { name: "Modération" }).click();
  await sheet
    .getByLabel("Motif du refus", { exact: true })
    .selectOption("OTHER");
  await sheet
    .getByRole("button", { name: "Refuser avec motif", exact: true })
    .click();
  await expect(sheet.getByRole("alert")).toBeVisible();
  await sheet
    .getByLabel("Précisions du refus", { exact: true })
    .fill("L’entrée doit être précisée pour les visiteurs.");
  await sheet
    .getByRole("button", { name: "Refuser avec motif", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (
          await pool.query(
            "SELECT review_status FROM participations WHERE id=$1",
            [h.id],
          )
        ).rows[0].review_status,
    )
    .toBe("REFUSED");
  await expect(sheet).toContainText("Refusée");
  await dispatchEmails(new Date(), smtpSender());
  await dispatchEmails(new Date(), smtpSender());
  const actual = await (
    await request.get("http://127.0.0.1:3108/messages")
  ).json();
  expect(actual).toHaveLength(3);
  expect(mimePart(actual[2].raw, "plain")).toContain(
    "L’entrée doit être précisée",
  );
  await login(page, "release-member@example.invalid");
  expect(
    (
      await post(page, "participant", {
        action: "delete",
        confirm: "SUPPRIMER",
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await pool.query(
        "SELECT actor_id FROM audit_logs WHERE action='participant.deleted'",
      )
    ).rows[0].actor_id,
  ).toBe(ownerId);
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
for (const width of [1440])
  test(`free selection UI API DB never contacts directions ${width}`, async ({
    page,
    request,
    context,
  }) => {
    const now = Date.now();
    await pool.query(
      "UPDATE seasons SET opens_at=now()-interval '1 hour',closes_at=now()+interval '6 hours',purge_at=now()+interval '3 days' WHERE id=$1",
      [seasonId],
    );
    await pool.query("UPDATE instances SET longitude=-1.67,latitude=48.1");
    await login(page, "release-member@example.invalid");
    const acceptance = {
      mode: "GUIDELINES_ONLY",
      guidelines: true,
      guidelines_version: "2026.1",
    };
    const created = await post(page, "participation", {
      acceptance,
      house: {
        name: "Maison des lanternes",
        address: "12 Rue des Lanternes 35000 Rennes",
        position_confirmed: true,
        address_parts: {
          number: "12",
          street: "Rue des Lanternes",
          postalCode: "35000",
          city: "Rennes",
          cityCode: "35238",
        },
        latitude: 48.1,
        longitude: -1.67,
        activities: ["CANDY"],
        fear: 2,
        adaptable: true,
        rp: "Une entrée illuminée",
        practical: "Entrée par le portail",
        starts_at: new Date(now + 60000).toISOString(),
        ends_at: new Date(now + 3 * 3600000).toISOString(),
      },
    });
    expect(created.status(), await created.text()).toBe(200);
    await pool.query(
      "UPDATE participations SET status='VISIBLE',review_status='VALIDATED',starts_at=now()-interval '5 minutes' WHERE user_id=$1",
      [ownerId],
    );
    const houseId = (
      await pool.query("SELECT id FROM participations WHERE user_id=$1", [
        ownerId,
      ])
    ).rows[0].id;
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation({
      latitude: 48.1,
      longitude: -1.67,
      accuracy: 10,
    });
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    const count = async () =>
      (
        await (
          await request.get("http://127.0.0.1:3106/test-only/request-count")
        ).json()
      ).routingRequests;
    const before = await count();
    // Stable map style only; UI, selection API and database remain real.
    await page.route("https://basemaps.cartocdn.com/**", (r) =>
      r.fulfill({
        json: {
          version: 8,
          sources: {},
          layers: [
            {
              id: "review-background",
              type: "background",
              paint: { "background-color": "#20232b" },
            },
          ],
        },
      }),
    );
    await page.goto("/map");
    await expect(page.locator(".maplibregl-canvas")).toBeVisible();
    await expect(page.locator(".house-marker")).toBeVisible();
    await page.screenshot({ path: `test-results/review-map-${width}.png` });
    await page
      .getByRole("button", { name: "Préparer ma collecte", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Me localiser", exact: true })
      .click();
    await page
      .getByRole("checkbox", { name: /J’ai pris connaissance/ })
      .check();
    const response = page.waitForResponse(
      (r) =>
        new URL(r.url()).pathname === "/api/route" &&
        r.request().method() === "POST",
    );
    await page
      .getByRole("button", { name: "Préparer ma collecte", exact: true })
      .click();
    const prepared = await response;
    expect(prepared.status(), await prepared.text()).toBe(200);
    const result = await prepared.json();
    expect(
      result.stops.map((s: { house: { id: string } }) => s.house.id),
    ).toEqual([houseId]);
    expect(result).toMatchObject({
      geometry: [],
      distanceMeters: 0,
      durationMinutes: 0,
      walkingSeconds: 0,
    });
    await page
      .getByRole("button", { name: "Commencer ma collecte", exact: true })
      .click();
    await page
      .getByRole("button", {
        name: "J’ai compris — commencer ma collecte",
        exact: true,
      })
      .click();
    await expect(page.locator(".collection-top-panel")).toHaveCount(0);
    await expect(page.locator(".collection-bottom-bar")).toBeVisible();
    const metrics = page.locator(".collection-bottom-metrics");
    await expect(metrics.locator("span")).toHaveCount(3);
    await expect(metrics.locator('[aria-label="Temps écoulé"]')).toBeVisible();
    await expect(
      metrics.locator('[title="Distance GPS indisponible"]'),
    ).toBeVisible();
    const bar = (await page.locator(".collection-bottom-bar").boundingBox())!;
    const metricBox = (await metrics.boundingBox())!;
    const heading = (await page
      .locator(".collection-bottom-heading")
      .boundingBox())!;
    const stopBox = (await page
      .getByRole("button", { name: "Arrêter la collecte", exact: true })
      .boundingBox())!;
    expect(metricBox.x).toBeGreaterThanOrEqual(bar.x);
    expect(metricBox.x + metricBox.width).toBeLessThanOrEqual(
      bar.x + bar.width,
    );
    expect(metricBox.y).toBeGreaterThanOrEqual(heading.y + heading.height);
    expect(stopBox.y).toBeGreaterThanOrEqual(heading.y);
    expect(
      await metrics
        .locator("strong")
        .first()
        .evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
    ).toBeGreaterThanOrEqual(13);
    await expect(page.locator(".house-marker")).toBeVisible();
    await page.screenshot({
      path: `test-results/review-collection-${width}.png`,
    });
    expect(await count()).toBe(before);
    expect(
      (
        await pool.query("SELECT routes_count FROM seasons WHERE id=$1", [
          seasonId,
        ])
      ).rows[0].routes_count,
    ).toBe(1);
  });
test("V0.9.5 HTML emails preserve full source, safe CTA and reusable uploaded images", async ({
  page,
}) => {
  await login(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/admin");
  await page.getByRole("navigation", { name: "Navigation administration" })
    .getByRole("button", { name: "Communications", exact: true }).click();
  const editorToggle = page.getByRole("button", { name: "Passer à l’éditeur HTML complet" });
  await expect(editorToggle).toBeVisible();
  await editorToggle.click();
  const htmlEditor = page.locator(".email-html-editor").first();
  await expect(htmlEditor.getByRole("textbox", { name: "Document HTML d'email" })).toBeVisible();
  await htmlEditor.getByRole("button", { name: "HTML", exact: true }).click();
  const source = htmlEditor.getByRole("textbox", { name: "Code source HTML de l'email" });
  const html = '<!doctype html><html lang="fr"><body style="background-color:#17171e">' +
    '<table role="presentation" width="100%" cellpadding="20"><tbody><tr><td>' +
    '<h1>Bonjour {{name}}</h1><p>Votre carte est prête.</p>' +
    '<img src="https://example.org/halloween.png" width="200" alt="Citrouille">' +
    '<a href="{{secure_action_url}}" style="background-color:#ff922f;padding:12px">Vérifier</a>' +
    '</td></tr></tbody></table></body></html>';
  await source.fill(html);
  await htmlEditor.getByRole("button", { name: "Aperçu", exact: true }).click();
  await expect(page.frameLocator('iframe[title="Aperçu du modèle"]')
    .locator("h1")).toContainText("Camille");
  await page.getByRole("button", { name: "Enregistrer le modèle", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Modèle enregistré");
  const row = (await pool.query("SELECT html_body,body FROM message_templates WHERE kind='VERIFY'")).rows[0];
  expect(row.html_body).toBe(html);
  expect(row.body).toContain("Vérifiez");
  await page.reload();
  await page.getByRole("navigation", { name: "Navigation administration" })
    .getByRole("button", { name: "Communications", exact: true }).click();
  await expect(page.locator(".email-html-editor")).toBeVisible();
  await page.locator(".email-html-editor")
    .getByRole("button", { name: "HTML", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Code source HTML de l'email" }))
    .toHaveValue(html);

  const upload = await page.request.post(origin + "/api/admin/email-media", {
    headers: { origin: new URL(origin).origin },
    multipart: {
      image: {
        name: "favicon.png",
        mimeType: "image/png",
        buffer: await import("node:fs/promises").then((m) => m.readFile("public/favicon-16.png")),
      },
    },
  });
  // The CI browser uses HTTP localhost while delivered email images must
  // remain publicly reachable over HTTPS. Do not bypass the production guard.
  if (!origin.startsWith("https://")) {
    expect(upload.status(), await upload.text()).toBe(503);
    expect((await upload.json()).error).toContain("HTTPS");
  } else {
    expect(upload.status(), await upload.text()).toBe(200);
    const image = await upload.json();
    expect(image.url).toContain("/api/email-media/");
    const file = await page.request.get(image.url);
    expect(file.status()).toBe(200);
    expect(file.headers()["content-type"]).toContain("image/webp");
  }
});

test("V0.9.5 rejects executable source HTML before opening visual editor", async ({
  page,
}) => {
  await login(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/admin");
  await page.getByRole("navigation", { name: "Navigation administration" })
    .getByRole("button", { name: "Communications", exact: true }).click();
  await page.getByRole("button", { name: "Passer à l’éditeur HTML complet" }).click();
  const editor = page.locator(".email-html-editor").first();
  await editor.getByRole("button", { name: "HTML", exact: true }).click();
  const source = editor.getByRole("textbox", { name: "Code source HTML de l'email" });
  await source.fill('<body><p>Test</p><img src="https://invalid.example/image.png" ' +
    'onerror="window.__halloweenEmailXss=1">' +
    '<a href="{{secure_action_url}}">Vérifier</a></body>');
  await editor.getByRole("button", { name: "Visuel", exact: true }).click();
  await expect(editor.getByRole("alert")).toContainText("Attribut HTML non autorisé");
  await expect(source).toBeVisible();
  expect(await page.evaluate(() =>
    (window as unknown as { __halloweenEmailXss?: number }).__halloweenEmailXss,
  )).toBeUndefined();
  await source.fill('<body><p>Bonjour {{name}}</p>' +
    '<a href="{{secure_action_url}}">Vérifier</a></body>');
  await editor.getByRole("button", { name: "Visuel", exact: true }).click();
  await expect(editor.getByRole("textbox", { name: "Document HTML d'email" }))
    .toContainText("Bonjour");
});

test("V0.9.5 rich editor allows direct text and table editing without touching public pages", async ({
  page,
}) => {
  await login(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/admin");
  await page.getByRole("navigation", { name: "Navigation administration" })
    .getByRole("button", { name: "Communications", exact: true }).click();
  await page.getByRole("button", { name: "Passer à l’éditeur HTML complet" }).click();
  const editor = page.locator(".email-html-editor").first();
  const paper = editor.getByRole("textbox", { name: "Document HTML d'email" });
  await expect(paper).toHaveAttribute("contenteditable", "true");
  const paragraph = paper.locator("p").first();
  await paragraph.click();
  await page.keyboard.press("End");
  await page.keyboard.type(" Ajout depuis l’éditeur visuel");
  await expect(paper).toContainText("Ajout depuis l’éditeur visuel");
  const beforeTables = await paper.locator("table").count();
  await editor.getByRole("button", { name: "Tableau deux colonnes" }).click();
  await expect(paper.locator("table")).toHaveCount(beforeTables + 1);
  const newTable = paper.locator("table").last();
  await newTable.locator("td").first().click();
  const beforeCells = await newTable.locator("tr").first().locator("td").count();
  await editor.getByRole("button", { name: "Ajouter une colonne au tableau" }).click();
  await expect(newTable.locator("tr").first().locator("td")).toHaveCount(beforeCells + 1);
  await editor.getByRole("button", { name: "HTML", exact: true }).click();
  const source = editor.getByRole("textbox", { name: "Code source HTML de l'email" });
  await expect(source).toHaveValue(/Ajout depuis l’éditeur visuel/);
  await expect(source).toHaveValue(/Colonne 1/);
});

for (const width of [1440])
  test(`Tiptap saves combined formatting through the real API and PostgreSQL, with matching email preview ${width}`, async ({
    page,
  }) => {
    await login(page);
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/admin");
    if (width === 390)
      await page
        .getByRole("button", { name: "Ouvrir la navigation", exact: true })
        .click();
    await page
      .getByRole("navigation", { name: "Navigation administration" })
      .getByRole("button", { name: "Communications", exact: true })
      .click();
    const surface = page.getByRole("textbox", { name: "Message", exact: true });
    await expect(surface).toBeVisible();
    await expect(surface).toHaveAttribute("contenteditable", "true");
    await surface.fill("Accueil sûr et convivial");
    await expect(surface).toHaveText("Accueil sûr et convivial");
    await surface.press("ControlOrMeta+A");
    const editor = page.locator(".visual-editor").first();
    await editor.getByRole("button", { name: "Gras", exact: true }).click();
    await editor.getByRole("button", { name: "Italique", exact: true }).click();
    await expect(
      page
        .frameLocator('iframe[title="Aperçu du modèle"]')
        .locator("strong em"),
    ).toHaveText("Accueil sûr et convivial");
    await page
      .getByRole("button", { name: "Enregistrer le modèle", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText("Modèle enregistré");
    expect(
      (
        await pool.query(
          "SELECT body FROM message_templates WHERE kind='VERIFY'",
        )
      ).rows[0].body,
    ).toBe("***Accueil sûr et convivial***");
    await page.screenshot({
      path: `test-results/ui-editor-${width}.png`,
      fullPage: true,
    });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    await page.reload();
    if (width === 390)
      await page
        .getByRole("button", { name: "Ouvrir la navigation", exact: true })
        .click();
    await page
      .getByRole("navigation", { name: "Navigation administration" })
      .getByRole("button", { name: "Communications", exact: true })
      .click();
    await expect(surface.locator("strong em")).toHaveText(
      "Accueil sûr et convivial",
    );
    await surface.fill("Première maison");
    await editor.getByRole("button", { name: "Liste", exact: true }).click();
    await surface.press("End");
    await surface.press("Enter");
    await surface.pressSequentially("Deuxième maison");
    await expect(surface.locator("li")).toHaveCount(2);
    await page
      .getByRole("button", { name: "Enregistrer le modèle", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText("Modèle enregistré");
    expect(
      (
        await pool.query(
          "SELECT body FROM message_templates WHERE kind='VERIFY'",
        )
      ).rows[0].body,
    ).toBe("- ***Première maison***\n- ***Deuxième maison***");
    await expect(
      page.frameLocator('iframe[title="Aperçu du modèle"]').locator("li"),
    ).toHaveCount(2);
    await surface.press("ControlOrMeta+A");
    await editor.getByLabel("Style de paragraphe").selectOption("paragraph");
    await surface.fill("Bienvenue");
    await editor.getByLabel("Style de paragraphe").selectOption("2");
    await expect(surface.locator("h2")).toHaveText("Bienvenue");
    await surface.press("ControlOrMeta+A");
    await editor.getByRole("button", { name: "Lien", exact: true }).click();
    await editor.getByLabel("Adresse du lien").fill("javascript:alert(1)");
    await editor.getByRole("button", { name: "Appliquer le lien" }).click();
    await expect(editor.getByRole("alert")).toContainText("HTTPS");
    await editor
      .getByLabel("Adresse du lien")
      .fill("https://example.invalid/accueil");
    await editor.getByRole("button", { name: "Appliquer le lien" }).click();
    await expect(surface.locator("a")).toHaveAttribute(
      "href",
      "https://example.invalid/accueil",
    );
    await editor.getByRole("button", { name: "Aperçu", exact: true }).click();
    await expect(
      editor.getByLabel("Aperçu du contenu").locator("h2 a"),
    ).toHaveText("Bienvenue");
    await editor.getByRole("button", { name: "Rédiger", exact: true }).click();
    await expect(surface.locator("h2 a")).toHaveText("Bienvenue");
    await page
      .getByRole("button", { name: "Enregistrer le modèle", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText("Modèle enregistré");
    expect(
      (
        await pool.query(
          "SELECT body FROM message_templates WHERE kind='VERIFY'",
        )
      ).rows[0].body,
    ).toContain("# [");
    await editor.scrollIntoViewIfNeeded();
    await surface.locator("h2").click();
    await expect(editor.getByLabel("Style de paragraphe")).toHaveValue("2");
    await page.screenshot({
      path: `test-results/review-editor-${width}.png`,
      fullPage: true,
    });
  });
test("guest mobile entry offers authentication and legal documents; APIs reject anonymous access", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await page.goto("/");
  await expect(
    page.getByLabel("Temps restant avant l’ouverture", { exact: true }),
  ).toBeVisible();
  const heading = (await page.locator(".home-center h1").boundingBox())!,
    header = (await page.locator(".home-header").boundingBox())!;
  expect(heading.y).toBeGreaterThanOrEqual(header.y + header.height);
  await expect(page.getByRole("button", { name: "Se connecter", exact: true })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Créer un compte", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".home-login")).toHaveCount(0);
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await expect(page.locator(".home-login").getByRole("button", { name: "Se connecter", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Fermer la connexion" }).click();
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
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "test-results/release-guest-mobile.png",
    fullPage: true,
  });
});
test("anonymous countdown uses server time and becomes a thank-you after closure", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  // Put the device clock beyond the event; the server stays authoritative.
  await page.clock.install({ time: new Date(Date.now() + 7 * 86400000) });
  await page.goto("/");
  const clock = page.getByLabel("Temps restant avant l’ouverture", {
    exact: true,
  });
  await expect(clock).toBeVisible();
  await expect(clock.locator("strong").first()).toHaveText("00");
  const state = await (await page.request.get("/api/public")).json();
  expect(state.houses).toEqual([]);
  expect(state.routeCandidates).toEqual([]);
  expect(state.publicMapOpen).toBe(false);
  await page.screenshot({
    path: "test-results/v083-countdown-390.png",
    fullPage: true,
  });
  await pool.query(
    "UPDATE seasons SET registrations_open_at=now()-interval '3 days',opens_at=now()-interval '2 days',closes_at=now()-interval '1 day',purge_at=now()+interval '1 day' WHERE id=$1",
    [seasonId],
  );
  await page.reload();
  await expect(
    page.getByRole("heading", { name: /La saison est terminée/ }),
  ).toBeVisible();
  await expect(clock).toHaveCount(0);
  await expect(page.locator(".route-experience")).toHaveCount(0);
  await page.screenshot({
    path: "test-results/v083-thanks-390.png",
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
  await expect(page.getByRole("button", { name: "Se connecter" })).toBeVisible();
  await expect(page.locator(".home-login")).toHaveCount(0);
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
test("Super Admin starts on the countdown and opens the real map by explicit preview; sensitive cancellation remains safe", async ({
  page,
}) => {
  await login(page);
  await page.goto("/");
  await expect(page.locator(".home-clock")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Accéder à la carte" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Accéder à la carte" }).click();
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
  await row.locator("summary").click();
  await row.getByRole("button", { name: "Désactiver", exact: true }).click();
  await dialog.getByLabel("Mot de passe").fill(password);
  await dialog.getByRole("button", { name: "Confirmer", exact: true }).click();
  await expect(row).toContainText("Désactivé");
});
test("shared visual editor produces the saved format and real TLS SMTP accepts its test", async ({
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
    page.getByRole("status").filter({ hasText: "Message accepté par SMTP" }),
  ).toBeVisible();
  expect((await pool.query("SELECT * FROM email_tokens")).rows).toHaveLength(0);
  expect((await pool.query("SELECT * FROM email_outbox")).rows).toHaveLength(0);
  expect(
    (await pool.query("SELECT id FROM users WHERE id=$1", [adminId])).rows,
  ).toHaveLength(1);
});
test("settings preview confirms consequences; new seasons use defaults and existing calendars survive", async ({
  page,
}) => {
  await login(page);
  await page.goto("/admin");
  const nav = page.getByRole("navigation", {
    name: "Navigation administration",
  });
  await nav.getByRole("button", { name: "Paramètres", exact: true }).click();
  const before = (
    await pool.query("SELECT * FROM seasons WHERE id=$1", [seasonId])
  ).rows[0];
  await page.getByLabel("Territoire / commune").fill("Lyon");
  await page.getByLabel("Code postal", { exact: false }).fill("69002");
  await page
    .getByText("Valeurs proposées pour les futures saisons", { exact: true })
    .click();
  await page
    .getByLabel("Ouverture (jour et mois) : heure", { exact: true })
    .fill("18:30");
  await page
    .getByLabel("Fermeture (jour et mois) : heure", { exact: true })
    .fill("22:30");
  const proposed = await page
    .locator('input[name="recurring_open"]')
    .inputValue();
  await page
    .getByRole("button", { name: "Enregistrer les paramètres", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Confirmer l’action sensible",
  });
  await expect(dialog).toContainText("restent inchangés");
  await dialog
    .getByLabel("Confirmation de l’opération")
    .fill("MODIFIER LA LOCALISATION");
  await dialog.getByLabel("Mot de passe").fill("incorrect-password");
  await dialog.getByRole("button", { name: "Confirmer", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByLabel("Territoire / commune")).toHaveValue("Lyon");
  page.once("dialog", (d) => d.dismiss());
  await nav.getByRole("button", { name: "Utilisateurs", exact: true }).click();
  await expect(page.getByLabel("Territoire / commune")).toBeVisible();
  await page
    .getByRole("button", { name: "Enregistrer les paramètres", exact: true })
    .click();
  await dialog
    .getByLabel("Confirmation de l’opération")
    .fill("MODIFIER LA LOCALISATION");
  await dialog.getByLabel("Mot de passe").fill(password);
  await dialog.getByRole("button", { name: "Confirmer", exact: true }).click();
  await expect(page.getByRole("status")).toContainText(
    "Paramètres enregistrés",
  );
  expect(
    (await pool.query("SELECT * FROM seasons WHERE id=$1", [seasonId])).rows[0],
  ).toEqual(before);
  await nav.getByRole("button", { name: "Saison", exact: true }).click();
  await page
    .getByRole("button", { name: "Nouvelle saison", exact: true })
    .click();
  const creation = page.getByRole("dialog", { name: "Nouvelle saison" });
  const futureYear = new Date().getFullYear() + 1;
  await creation.getByLabel("Année", { exact: true }).fill(String(futureYear));
  await expect(creation.locator('input[name="opens_at"]')).toHaveValue(
    `${futureYear}-${proposed.slice(5)}`,
  );
  await creation
    .getByLabel("Nom de la saison")
    .fill("Édition issue des paramètres");
  await creation
    .getByRole("button", { name: "Enregistrer", exact: true })
    .click();
  await expect(creation).toHaveCount(0);
  const created = (
    await pool.query(
      "SELECT * FROM seasons WHERE name='Édition issue des paramètres'",
    )
  ).rows[0];
  expect(new Date(created.opens_at).toISOString()).toBe(
    DateTime.fromISO(`${futureYear}-${proposed.slice(5)}`, {
      zone: "Europe/Paris",
    })
      .toUTC()
      .toJSDate()
      .toISOString(),
  );
  const row = page.getByRole("row").filter({ hasText: "Prochaine édition" });
  await row.getByRole("button", { name: "Désactiver", exact: true }).click();
  await dialog.getByLabel("Mot de passe").fill(password);
  await dialog.getByRole("button", { name: "Confirmer", exact: true }).click();
  await expect(
    row.getByRole("button", { name: "Activer", exact: true }),
  ).toBeVisible();
  expect(
    (await pool.query("SELECT active_season_id FROM instances")).rows[0]
      .active_season_id,
  ).toBeNull();
  await row.getByRole("button", { name: "Activer", exact: true }).click();
  await dialog.getByLabel("Mot de passe").fill(password);
  await dialog.getByRole("button", { name: "Confirmer", exact: true }).click();
  await expect(
    row.getByRole("button", { name: "Désactiver", exact: true }),
  ).toBeVisible();
  expect(
    (await pool.query("SELECT active_season_id FROM instances")).rows[0]
      .active_season_id,
  ).toBe(seasonId);
});
test("all nine administration sections retain usable desktop layouts in three appearances", async ({
  page,
}) => {
  await login(page);
  await page.goto("/admin");
  const sections = [
    "Tableau de bord",
    "Maisons",
    "Utilisateurs",
    "Statistiques",
    "Saison",
    "Communications",
    "Activité",
    "Contenus & documents",
    "Paramètres",
  ];
  for (const width of [1440]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    for (const theme of ["light", "dark", "system"]) {
      await page.getByLabel("Apparence").selectOption(theme);
      for (const [index, name] of sections.entries()) {
        if (width === 390)
          await page
            .getByRole("button", { name: "Ouvrir la navigation", exact: true })
            .click();
        await page
          .getByRole("navigation", { name: "Navigation administration" })
          .getByRole("button", { name, exact: true })
          .click();
        await expect(page.locator(".beta-content")).toBeVisible();
        await expect(page.locator(".beta-skeleton")).toHaveCount(0);
        await expect(
          page.locator(".beta-content").getByText(/^Chargement/),
        ).toHaveCount(0);
        await page.locator(".beta-content").evaluate((el) => {
          el.scrollTop = 0;
        });
        await expect(page.locator('.notice[role="alert"]')).toHaveCount(0);
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth),
          name,
        ).toBeLessThanOrEqual(width);
        await page.screenshot({
          path: `test-results/v081-admin-${width}-${theme}-${index}.png`,
          fullPage: true,
        });
        await page.locator(".beta-content").evaluate((el) => {
          el.scrollTop = el.scrollHeight;
        });
        await page.screenshot({
          path: `test-results/v081-admin-${width}-${theme}-${index}-bottom.png`,
          fullPage: true,
        });
      }
    }
  }
});
test("registration and login use actual forms, verification SMTP and persistent global account", async ({
  page,
  request,
}) => {
  await request.get("http://127.0.0.1:3108/reset");
  await page.goto("/");
  await page
    .getByRole("link", { name: "Créer un compte", exact: true })
    .click();
  await page.getByLabel("Nom ou pseudo").fill("Alex inscrit");
  await page
    .getByRole("main")
    .getByLabel("Email")
    .fill("signup@example.invalid");
  await page.getByLabel("Mot de passe (12 caractères minimum)").fill(password);
  await page
    .getByRole("button", { name: "Créer mon compte", exact: true })
    .click();
  await expect(page).toHaveURL(/\/account/);
  const account = (
    await pool.query(
      "SELECT id,email_status FROM users WHERE email='signup@example.invalid'",
    )
  ).rows[0];
  expect(account.email_status).toBe("UNVERIFIED");
  await dispatchEmails(new Date(), smtpSender());
  const captured = await (
    await request.get("http://127.0.0.1:3108/messages")
  ).json();
  expect(captured).toHaveLength(1);
  const verification = mimePart(captured[0].raw, "plain").match(
    /http:\/\/localhost:3000\/verify\?token=[a-f0-9]{64}/,
  )?.[0];
  expect(verification).toBeTruthy();
  await page.goto(verification!);
  expect(
    (
      await pool.query("SELECT email_status FROM users WHERE id=$1", [
        account.id,
      ])
    ).rows[0].email_status,
  ).toBe("VERIFIED");
  await post(page, "logout", {});
  await page.goto("/");
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await page
    .locator(".home-login")
    .getByLabel("Email")
    .fill("signup@example.invalid");
  await page.locator(".home-login").getByLabel("Mot de passe").fill(password);
  await page
    .locator(".home-login")
    .getByRole("button", { name: "Se connecter", exact: true })
    .click();
  await expect(page.locator(".home-login")).toHaveCount(0);
  await expect(page.locator(".home-clock")).toBeVisible();
  expect((await (await page.request.get("/api/me")).json()).id).toBe(
    account.id,
  );
});

test("destructive house, season and account actions confirm masked passwords and preserve unrelated accounts", async ({
  page,
}) => {
  await login(page, "release-member@example.invalid");
  const now = Date.now();
  const create = () =>
    post(page, "participation", {
      house: {
        name: "Maison protégée",
        address: "12 Rue des Lanternes 35000 Rennes",
        address_parts: {
          number: "12",
          street: "Rue des Lanternes",
          postalCode: "35000",
          city: "Rennes",
          cityCode: "35238",
        },
        position_confirmed: true,
        latitude: 48.1,
        longitude: -1.67,
        activities: ["CANDY"],
        starts_at: new Date(now + 86400000 + 60000).toISOString(),
        ends_at: new Date(now + 2 * 86400000 - 60000).toISOString(),
        fear: 1,
        adaptable: false,
        rp: "",
        practical: "",
      },
      acceptance: {
        mode: "GUIDELINES_ONLY",
        guidelines: true,
        guidelines_version: "2026.1",
      },
    });
  expect((await create()).status()).toBe(200);
  await login(page);
  await page.goto("/admin");
  const nav = page.getByRole("navigation", {
    name: "Navigation administration",
  });
  const confirm = page.getByRole("dialog", {
    name: "Confirmer l’action sensible",
  });
  const approve = async (phrase?: string) => {
    if (phrase) {
      await expect(
        confirm.getByRole("button", { name: "Confirmer", exact: true }),
      ).toBeDisabled();
      await confirm.getByLabel("Confirmation de l’opération").fill(phrase);
    }
    await confirm.getByLabel("Mot de passe").fill(password);
    await confirm
      .getByRole("button", { name: "Confirmer", exact: true })
      .click();
    await expect(confirm).toHaveCount(0);
  };
  await nav.getByRole("button", { name: "Maisons", exact: true }).click();
  const houseRow = page.getByRole("row").filter({ hasText: "Maison protégée" });
  await houseRow.locator("summary").click();
  await houseRow
    .getByRole("button", { name: "Supprimer la maison", exact: true })
    .click();
  await approve("SUPPRIMER LA MAISON");
  await expect(houseRow).toHaveCount(0);
  expect(
    (await pool.query("SELECT id FROM users WHERE id=$1", [ownerId])).rows,
  ).toHaveLength(1);
  await login(page, "release-member@example.invalid");
  expect((await create()).status()).toBe(200);
  await login(page);
  await page.goto("/admin");
  await nav.getByRole("button", { name: "Saison", exact: true }).click();
  const seasonRow = page
    .getByRole("row")
    .filter({ hasText: "Prochaine édition" });
  await seasonRow
    .getByRole("button", { name: "Désactiver", exact: true })
    .click();
  await approve();
  await expect(
    seasonRow.getByRole("button", { name: "Activer", exact: true }),
  ).toBeVisible();
  // Only this disposable fixture calendar is moved into the past to exercise legitimate post-event purge.
  await pool.query(
    "UPDATE seasons SET registrations_open_at=now()-interval '5 days',opens_at=now()-interval '4 days',closes_at=now()-interval '3 days',purge_at=now()+interval '2 days' WHERE id=$1",
    [seasonId],
  );
  await page.reload();
  await nav.getByRole("button", { name: "Saison", exact: true }).click();
  await seasonRow
    .getByRole("button", { name: "Purger les données", exact: true })
    .click();
  await approve("PURGER");
  await expect(
    seasonRow.getByRole("button", { name: "Purger les données", exact: true }),
  ).toHaveCount(0);
  await expect
    .poll(
      async () => (await pool.query("SELECT id FROM participations")).rowCount,
    )
    .toBe(0);
  expect(
    (await pool.query("SELECT id FROM users WHERE id=$1", [ownerId])).rows,
  ).toHaveLength(1);
  await seasonRow
    .getByRole("button", { name: "Supprimer définitivement", exact: true })
    .click();
  await approve("Prochaine édition");
  await expect
    .poll(async () => (await pool.query("SELECT id FROM seasons")).rowCount)
    .toBe(0);
  await expect(seasonRow).toHaveCount(0);
  expect((await pool.query("SELECT id FROM seasons")).rows).toHaveLength(0);
  await nav.getByRole("button", { name: "Utilisateurs", exact: true }).click();
  const row = page.getByRole("row").filter({ hasText: "Camille" });
  await row.locator("summary").click();
  await row
    .getByRole("button", { name: "Supprimer le compte", exact: true })
    .click();
  await approve("SUPPRIMER CE COMPTE");
  await expect
    .poll(
      async () =>
        (await pool.query("SELECT id FROM users WHERE id=$1", [ownerId]))
          .rowCount,
    )
    .toBe(0);
  await expect(row).toHaveCount(0);
  expect(
    (await pool.query("SELECT id FROM users")).rows.map((u) => u.id),
  ).toEqual([adminId]);
});
