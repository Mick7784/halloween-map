import { messageDefaults } from "../lib/message-templates";
import { test, expect, type Page } from "@playwright/test";
const real = "30000000-0000-4000-8000-000000000001",
  other = "30000000-0000-4000-8000-000000000002",
  testId = "30000000-0000-4000-8000-000000000003";
async function arrange(page: Page, role = "SUPER_ADMIN", granted?: readonly string[]) {
  const now = Date.now(),
    dates = {
      year: 2026,
      registrations_open: true,
      registrations_open_at: new Date(now - 7200000).toISOString(),
      opens_at: new Date(now - 3600000).toISOString(),
      closes_at: new Date(now + 86400000).toISOString(),
      purge_at: new Date(now + 172800000).toISOString(),
    };
  let seasons = [
    {
      ...dates,
      id: real,
      name: "Halloween 2026",
      is_test: false,
      active: true,
    },
    {
      ...dates,
      id: other,
      name: "Halloween prochaine édition",
      is_test: false,
      active: false,
    },
    {
      ...dates,
      id: testId,
      name: "Essais octobre",
      is_test: true,
      active: false,
    },
  ];
  const reviews: Record<string, string> = {};
  const mutations: { action: string; id?: string }[] = [];
  const defaultPermissions = [
    "admin.access",
    "stats.read",
    "audit.read",
    "communications.read",
    "communications.manage",
    "participants.read",
    "participants.edit",
    "users.read",
    "users.manage",
    "season.read",
    "season.manage",
    "content.manage",
    ...(role === "SUPER_ADMIN"
      ? ["roles.manage", "settings.read", "settings.manage"]
      : []),
  ];
  const permissions = granted ? [...granted] : defaultPermissions;
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url()),
      path = url.pathname,
      sid =
        url.searchParams.get("seasonId") ?? seasons.find((s) => s.active)?.id;
    let data: unknown = {};
    if (path === "/api/me")
      data = {
        id: "admin",
        role_name: role,
        display_name: "Mickaël",
        email_status: "VERIFIED",
        permissions,
      };
    else if (path === "/api/public")
      data = {
        setupRequired: false,
        serverTime: new Date().toISOString(),
        state: "MAP_OPEN",
        mapAccessible: true,
        instance: {
          id: "instance",
          public_name: "Halloween Map",
          territory: "Rennes",
          timezone: "Europe/Paris",
          latitude: 48.1,
          longitude: -1.67,
          zoom: 14,
        },
        season: seasons.find((s) => s.active),
        houses: [],
      };
    else if (path === "/api/admin/seasons") data = seasons;
    else if (path === "/api/admin/settings")
      data = {
        id: "instance",
        public_name: "Halloween Map",
        territory: "Rennes",
        postal_code: "35000",
        country: "France",
        timezone: "Europe/Paris",
        latitude: 48.1,
        longitude: -1.67,
        zoom: 14,
        config: {
          defaultOpen: "10-31T18:00",
          defaultClose: "11-01T01:00",
        },
      };
    else if (path === "/api/admin/settings-impact")
      data = {
        changes: ["commune / territoire"],
        fingerprint: "a".repeat(64),
        houses: 3,
      };
    else if (path === "/api/admin/dashboard")
      data =
        sid === real
          ? { approved: 24, pending: 1, routes: 18, users: 30 }
          : sid === testId
            ? { approved: 5, pending: 1, routes: 3, users: 7 }
            : { approved: 0, pending: 0, routes: 0, users: 0 };
    else if (path === "/api/admin/statistics")
      data = {
        seasonId: sid,
        snapshot: false,
        stats: {
          houses: 26,
          approved: 24,
          pending: 1,
          refused: 1,
          participants: 30,
          routes: 18,
          candy: 16,
          decoration: 12,
          acting: 3,
          collections_started: 7,
          collections_finished: 4,
          visited: 11,
          completion_sum: 2.5,
          distance_meters: 10000,
          duration_seconds: 7200,
        },
      };
    else if (path === "/api/admin/houses")
      data =
        sid === other ||
        new URL(route.request().url()).searchParams.get("q") === "introuvable"
          ? []
          : [
              {
                id: "10000000-0000-4000-8000-000000000001",
                season_id: sid,
                name:
                  sid === testId ? "Maison des essais" : "Jardin des lanternes",
                owner_name: "Camille",
                email: "camille@example.invalid",
                address: "12 rue de Paris, Rennes",
                latitude: 48.1,
                longitude: -1.67,
                address_parts: { city: "Rennes" },
                review_status: reviews[sid!] ?? "PENDING",
                status: "VISIBLE",
                activity: "ACTIVE",
                activities: ["CANDY"],
                candy_available: true,
                starts_at: dates.opens_at,
                ends_at: dates.closes_at,
                submitted_at: new Date(now).toISOString(),
                updated_at: new Date(now).toISOString(),
              },
            ];
    else if (path === "/api/admin/audit")
      data =
        sid === other ||
        new URL(route.request().url()).searchParams.get("q") === "introuvable"
          ? []
          : [
              {
                id: "1",
                action: "house.review.validated",
                target_label:
                  sid === testId ? "Maison des essais" : "Jardin des lanternes",
                actor: "Mickaël",
                created_at: new Date(now).toISOString(),
              },
            ];
    else if (path === "/api/admin/templates") data = messageDefaults;
    else if (path === "/api/admin/communications")
      data = { campaigns: [], variables: [], smtpAvailable: true };
    else if (path === "/api/admin/users" || path === "/api/admin/roles")
      data = [];
    else if (path === "/api/admin" && route.request().method() === "POST") {
      const body = route.request().postDataJSON();
      mutations.push(body);
      if (body.action === "reviewHouse")
        reviews[body.seasonId] = body.payload.status;
      if (body.action === "activateSeason")
        seasons = seasons.map((s) => ({ ...s, active: s.id === body.id }));
      data = { ok: true };
    }
    await route.fulfill({ json: data });
  });
  return {
    mutations,
    removeTest: () => {
      seasons = seasons.filter((s) => s.id !== testId);
    },
  };
}

test("dashboard stays active while BO house browsing is independently persisted; themes and navigation work", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const { mutations } = await arrange(page);
  await page.goto("/admin");
  const nav = page.getByRole("navigation", {
    name: "Navigation administration",
  });
  await expect(nav.getByText("Gestion", { exact: true })).toBeVisible();
  await expect(nav.getByText("Suivi & communication", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Réduire aux icônes" }).click();
  await expect(page.locator(".beta-sidebar")).toHaveClass(/is-collapsed/);
  await page.getByRole("button", { name: "Développer le menu" }).click();
  await expect(page.locator(".beta-sidebar")).not.toHaveClass(/is-collapsed/);
  await expect(
    page.locator(".beta-kpis article").filter({ hasText: "Maisons validées" }),
  ).toContainText("24");
  for (const theme of ["dark", "light", "system"])
    await page.getByLabel("Apparence", { exact: true }).selectOption(theme);
  await nav.getByRole("button", { name: "Maisons", exact: true }).click();
  const selector = page.getByLabel("Saison du back-office");
  await selector.selectOption(testId);
  await expect(page.locator(".beta-table-scroll")).toContainText(
    "Maison des essais",
  );
  await nav
    .getByRole("button", { name: "Tableau de bord", exact: true })
    .click();
  await expect(
    page.locator(".beta-kpis article").filter({ hasText: "Maisons validées" }),
  ).toContainText("24");
  await expect(page.locator(".beta-context")).toContainText(
    "Saison active : Halloween 2026",
  );
  await nav.getByRole("button", { name: "Maisons", exact: true }).click();
  await expect(selector).toHaveValue(testId);
  expect(mutations).toEqual([]);
  for (const name of ["Utilisateurs", "Saison", "Tableau de bord"]) {
    await nav.getByRole("button", { name, exact: true }).click();
    await expect(page.locator(".beta-page-title h1")).toHaveText(name);
  }
});
test("settings location change requires impact preview and deliberate confirmation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const { mutations } = await arrange(page);
  await page.goto("/admin");
  const nav = page.getByRole("navigation", { name: "Navigation administration" });
  await nav.getByRole("button", { name: "Paramètres", exact: true }).click();
  await page.getByLabel("Territoire / commune").fill("Nantes");
  await page.getByRole("button", { name: "Enregistrer les paramètres" }).click();
  const preview = page.getByRole("dialog", { name: "Confirmer l’action sensible" });
  await expect(preview).toContainText("commune / territoire");
  await expect(preview).toContainText("3 maison(s)");
  expect(mutations.filter((m) => m.action === "settings")).toHaveLength(0);
  await preview.getByRole("button", { name: "Annuler", exact: true }).click();
  await expect(preview).toHaveCount(0);
  expect(mutations.filter((m) => m.action === "settings")).toHaveLength(0);
  await page.getByRole("button", { name: "Enregistrer les paramètres" }).click();
  await preview.getByLabel("Confirmation de l’opération").fill("MODIFIER LA LOCALISATION");
  await preview.getByLabel("Mot de passe").fill("test-password");
  await preview.getByRole("button", { name: "Confirmer", exact: true }).click();
  await expect.poll(() => mutations.filter((m) => m.action === "settings").length).toBe(1);
  const saved = mutations.filter((m) => m.action === "settings");
  expect(saved).toHaveLength(1);
  const payload = (saved[0] as { payload?: Record<string, unknown> }).payload;
  expect(payload).toMatchObject({
    territory: "Nantes",
    location_confirmed: true,
    location_fingerprint: "a".repeat(64),
  });
});


test("V0.9.7 dates defaults link to the current season while preserving navigation", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await arrange(page);
  await page.goto("/admin");
  const nav = page.getByRole("navigation", { name: "Navigation administration" });
  await nav.getByRole("button", { name: "Paramètres", exact: true }).click();
  await page.getByText("Valeurs proposées pour les futures saisons").click();
  await page.getByRole("button", { name: "Modifier la saison en cours" }).click();
  await expect(page.locator(".beta-page-title h1")).toHaveText("Saison");
});

test("V1.0 mobile shell exposes every authorized module and preserves compact statistics", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await arrange(page, "ADMIN");
  await page.goto("/admin");
  await expect(page.locator(".beta-page-title h1")).toHaveText("Tableau de bord");
  const toggle = page.getByRole("button", { name: "Ouvrir la navigation" });
  await expect(toggle).toBeVisible();
  await toggle.click();
  const nav = page.getByRole("navigation", { name: "Navigation administration" });
  for (const name of [
    "Tableau de bord", "Maisons", "Utilisateurs", "Saison",
    "Statistiques", "Activité", "Communications", "Contenus & documents",
  ]) {
    await expect(nav.getByRole("button", { name, exact: true })).toBeVisible();
  }
  await expect(nav.getByRole("button", { name: "Paramètres" })).toHaveCount(0);
  await nav.getByRole("button", { name: "Statistiques" }).click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator(".beta-page-title h1")).toHaveText("Statistiques");
  await expect(page.getByRole("tab", { name: "Vue d’ensemble" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Maisons" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Collectes" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Fréquentation" })).toBeVisible();
  await expect(page.getByText("Consultation uniquement")).toBeVisible();
  await page.getByRole("tab", { name: "Maisons" }).click();
  await expect(page.getByText("Bonbons", { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Collectes" }).click();
  await expect(page.getByText("Taux de collectes terminées")).toBeVisible();
  await page.getByRole("tab", { name: "Fréquentation" }).click();
  await toggle.click();
  await nav.getByRole("button", { name: "Saison", exact: true }).click();
  await expect(page.locator(".season-table")).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  expect(await page.evaluate(() => document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(390);
});

test("V1.0 mobile restricts the menu to grants and respects house edit permissions", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { mutations } = await arrange(page, "ADMIN", [
    "admin.access", "participants.read",
  ]);
  await page.goto("/admin");
  await expect(page.locator(".beta-page-title h1")).toHaveText("Maisons");
  await page.getByRole("button", { name: "Ouvrir la navigation" }).click();
  const nav = page.getByRole("navigation", { name: "Navigation administration" });
  await expect(nav.getByRole("button", { name: "Maisons", exact: true })).toBeVisible();
  await expect(nav.locator("button")).toHaveCount(1);
  await nav.getByRole("button", { name: "Maisons", exact: true }).click();
  await expect(page.locator(".beta-house-create")).toHaveCount(0);
  await expect(page.locator(".beta-table-scroll")).toContainText("Jardin des lanternes");
  expect(mutations).toEqual([]);
});

test("communications and activity follow the consulted season; TEST disables email actions", async ({
  page,
}) => {
  await arrange(page);
  await page.goto("/admin");
  const nav = page.getByRole("navigation", {
    name: "Navigation administration",
  });
  await nav
    .getByRole("button", { name: "Communications", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Nouvelle campagne" }),
  ).toBeVisible();
  const request = page.waitForRequest((r) =>
    r.url().includes("admin/communications?seasonId=" + testId),
  );
  await page.getByLabel("Saison du back-office").selectOption(testId);
  await request;
  await expect(
    page.getByText("Saison TEST : aucun email ne peut être envoyé."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Nouvelle campagne" }),
  ).toHaveCount(0);
  await nav
    .getByRole("button", { name: "Tableau de bord", exact: true })
    .click();
  await page.getByRole("button", { name: "Voir toute l’activité" }).click();
  await expect(page.getByLabel("Saison du back-office")).toHaveValue(real);
  for (const scope of ["global", "all", "season"]) {
    const next = page.waitForRequest(
      (r) =>
        r.url().includes("admin/audit") && r.url().includes("scope=" + scope),
    );
    await page.getByLabel("Périmètre de l’activité").selectOption(scope);
    await next;
  }
  await page.getByLabel("Filtrer l’activité").fill("introuvable");
  await expect(
    page.getByText("Aucune activité pour ces filtres."),
  ).toBeVisible();
});
test("reexamining a refused house opens moderation without implicitly validating", async ({
  page,
}) => {
  const { mutations } = await arrange(page);
  await page.route("**/api/admin/houses*", (r) =>
    r.fulfill({
      json: [
        {
          id: "10000000-0000-4000-8000-000000000001",
          season_id: real,
          name: "Maison refusée",
          owner_name: "Camille",
          email: "camille@example.invalid",
          address: "12 rue",
          latitude: 48.1,
          longitude: -1.67,
          review_status: "REFUSED",
          refusal_reason: "Adresse",
          status: "VISIBLE",
          activity: "ACTIVE",
          activities: ["CANDY"],
          candy_available: true,
          starts_at: new Date(Date.now() - 3600000).toISOString(),
          ends_at: new Date(Date.now() + 3600000).toISOString(),
        },
      ],
    }),
  );
  await page.goto("/admin");
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Maisons", exact: true })
    .click();
  await page.getByRole("button", { name: "Réexaminer", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Valider la maison", exact: true }),
  ).toBeVisible();
  expect(mutations).toEqual([]);
  await page
    .getByRole("button", { name: "Laisser en attente", exact: true })
    .click();
  await expect.poll(() => mutations.length).toBe(1);
  expect(mutations[0]).toMatchObject({
    action: "reviewHouse",
    payload: { status: "PENDING" },
    seasonId: real,
  });
});

test("own account and protected administrators expose no rejected user-management action", async ({
  page,
}) => {
  await arrange(page, "ADMIN");
  await page.route("**/api/admin/users", (r) =>
    r.fulfill({
      json: [
        {
          id: "admin",
          display_name: "Mon profil",
          email: "me@example.invalid",
          role_name: "ADMIN",
          permissions: [],
          account_status: "ACTIVE",
          email_status: "VERIFIED",
          communications: [],
        },
        {
          id: "protected",
          display_name: "Super protégé",
          email: "super@example.invalid",
          role_name: "SUPER_ADMIN",
          account_status: "ACTIVE",
          email_status: "VERIFIED",
          communications: [],
        },
      ],
    }),
  );
  await page.goto("/admin");
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Utilisateurs", exact: true })
    .click();
  await page.getByRole("button", { name: "Mon profil", exact: true }).click();
  let detail = page.locator(".admin-inline-detail");
  await expect(detail).not.toContainText("Camille");
  await expect(detail).not.toContainText("camille@example.invalid");
  await expect(detail).toContainText("Date de création du compte");
  await expect(
    detail.getByRole("link", { name: "Mon compte", exact: true }),
  ).toBeVisible();
  await expect(detail.locator("form")).toHaveCount(0);
  await expect(
    detail.getByRole("button", { name: "Désactiver", exact: true }),
  ).toHaveCount(0);
  await detail.getByRole("button", { name: /Refermer la fiche/ }).click();
  await page
    .getByRole("button", { name: "Super protégé", exact: true })
    .click();
  detail = page.locator(".admin-inline-detail");
  await expect(detail.locator("form")).toHaveCount(0);
  await expect(
    detail.getByRole("button", { name: "Désactiver", exact: true }),
  ).toHaveCount(0);
});

test("BO pages load only their data and ignore unrelated endpoint failures", async ({
  page,
}) => {
  await arrange(page);
  await page.goto("/admin");
  await expect(page.locator(".beta-kpis article")).toHaveCount(4);
  const requested: string[] = [];
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith("/api/admin/")) requested.push(path);
  });
  await page.route("**/api/admin/houses*", (r) =>
    r.fulfill({ status: 500, json: { error: "unrelated house failure" } }),
  );
  await page.route("**/api/admin/audit*", (r) =>
    r.fulfill({ status: 500, json: { error: "unrelated audit failure" } }),
  );
  await page.route("**/api/admin/dashboard*", (r) =>
    r.fulfill({ status: 500, json: { error: "unrelated dashboard failure" } }),
  );
  const nav = page.getByRole("navigation", {
    name: "Navigation administration",
  });
  await nav.getByRole("button", { name: "Utilisateurs", exact: true }).click();
  await expect(page.getByLabel("Rechercher un utilisateur")).toBeVisible();
  expect(requested.sort()).toEqual(["/api/admin/roles", "/api/admin/users"]);
  requested.length = 0;
  await page.route("**/api/admin/statistics*", (r) =>
    r.fulfill({
      json: { seasonId: real, snapshot: false, stats: { houses: 0 } },
    }),
  );
  await nav.getByRole("button", { name: "Statistiques", exact: true }).click();
  await expect(page.locator(".stats-page")).toContainText(
    "Donnée non disponible",
  );
  expect(requested).toEqual(["/api/admin/statistics"]);
  requested.length = 0;
  await page
    .getByLabel("Saison consultée", { exact: true })
    .selectOption(other);
  await expect.poll(() => requested.length).toBe(1);
  expect(requested).toEqual(["/api/admin/statistics"]);
});

test("dashboard moderation link switches to the active season and refreshes after mutation", async ({
  page,
}) => {
  await arrange(page);
  await page.goto("/admin");
  const nav = page.getByRole("navigation", {
    name: "Navigation administration",
  });
  await nav.getByRole("button", { name: "Maisons", exact: true }).click();
  await page.getByLabel("Saison du back-office").selectOption(testId);
  await expect(page.locator(".beta-table-scroll")).toContainText(
    "Maison des essais",
  );
  await nav
    .getByRole("button", { name: "Tableau de bord", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Consulter Jardin des lanternes",
      exact: true,
    })
    .click();
  await expect(page.getByLabel("Saison du back-office")).toHaveValue(real);
  const detail = page.locator(".admin-inline-detail");
  await expect(detail).not.toContainText("Jardin des lanternes");
  await expect(detail).not.toContainText("12 rue de Paris, Rennes");
  await expect(detail).toContainText("Coordonnées GPS");
  await detail.getByRole("tab", { name: "Modération" }).click();
  const refreshed = page.waitForResponse(
    (response) => new URL(response.url()).pathname === "/api/admin/houses",
  );
  await detail.getByRole("button", { name: "Valider la maison", exact: true }).click();
  await refreshed;
  await expect(
    page.locator(".beta-table-scroll tbody tr").first(),
  ).toContainText("Validée");
});


test("V1.0 baseline: a restricted ADMIN sees only granted modules and cannot mutate houses", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const { mutations } = await arrange(page, "ADMIN", [
    "admin.access",
    "participants.read",
  ]);
  await page.goto("/admin");
  const nav = page.getByRole("navigation", {
    name: "Navigation administration",
  });
  await expect(page.locator(".beta-page-title h1")).toHaveText("Maisons");
  await expect(
    nav.getByRole("button", { name: "Maisons", exact: true }),
  ).toBeVisible();
  for (const name of [
    "Tableau de bord",
    "Utilisateurs",
    "Saison",
    "Statistiques",
    "Activité",
    "Communications",
    "Contenus & documents",
    "Paramètres",
  ]) {
    await expect(nav.getByRole("button", { name, exact: true })).toHaveCount(0);
  }
  await expect(page.locator(".beta-house-create")).toHaveCount(0);
  await expect(page.getByLabel("Saison du back-office")).toBeVisible();
  await expect(page.locator(".beta-table-scroll")).toContainText(
    "Jardin des lanternes",
  );
  expect(mutations).toEqual([]);
});

test("V1.0 baseline: capture the V0.9.10 administration before replacing the shell", async ({
  page,
}, testInfo) => {
  await arrange(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/admin");
  for (const theme of ["dark", "light"] as const) {
    await page.getByLabel("Apparence", { exact: true }).selectOption(theme);
    await expect(page.locator(".beta-kpis article")).toHaveCount(4);
    await testInfo.attach(`v0910-desktop-${theme}.png`, {
      body: await page.screenshot({ fullPage: true, animations: "disabled" }),
      contentType: "image/png",
    });
  }
  await page.evaluate(() => localStorage.setItem("halloween.admin.theme", "dark"));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await page.getByRole("button", { name: "Ouvrir la navigation" }).click();
  const nav = page.getByRole("navigation", { name: "Navigation administration" });
  await nav.getByRole("button", { name: "Statistiques", exact: true }).click();
  await expect(page.getByRole("tab", { name: "Vue d’ensemble" })).toBeVisible();
  await testInfo.attach("v10-mobile-dark.png", {
    body: await page.screenshot({ fullPage: true, animations: "disabled" }),
    contentType: "image/png",
  });
});

test("V1.0 branding uses the actual DomotiK Studio assets and LinKs admin palette", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await arrange(page);
  await page.goto("/admin");
  const brand = page.locator(".beta-logo");
  const wordmark = brand.locator("img.beta-brand-wordmark");
  const icon = brand.locator("img.beta-brand-icon");
  await expect(wordmark).toHaveAttribute(
    "src",
    "/brand/halloween-map-wordmark-official.webp",
  );
  await expect(icon).toHaveAttribute(
    "src",
    "/brand/halloween-map-app-icon-official.webp",
  );
  await expect.poll(() => wordmark.evaluate((img: HTMLImageElement) =>
    img.complete && img.naturalWidth > 0,
  )).toBe(true);
  await page.getByLabel("Apparence", { exact: true }).selectOption("dark");
  await expect.poll(() => page.locator(".admin-beta").evaluate(
    (node) => getComputedStyle(node).getPropertyValue("--bg").trim(),
  )).toBe("#171d27");
  await page.getByLabel("Apparence", { exact: true }).selectOption("light");
  await expect.poll(() => page.locator(".admin-beta").evaluate(
    (node) => getComputedStyle(node).getPropertyValue("--bg").trim(),
  )).toBe("#f5f6f8");
  await page.getByRole("button", { name: "Réduire aux icônes" }).click();
  await expect(icon).toBeVisible();
  await expect(wordmark).toBeHidden();
});
