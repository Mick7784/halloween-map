import { test, expect } from "@playwright/test";
test("beta desktop exposes only useful navigation, pending moderation and normal house actions", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const now = Date.now(),
    sid = "30000000-0000-4000-8000-000000000001",
    realId = "30000000-0000-4000-8000-000000000002";
  let mutations = 0;
  const houses = Array.from({ length: 5 }, (_, n) => ({
    id: "10000000-0000-4000-8000-00000000000" + n,
    name: "Mr Test " + (n + 1),
    owner_name: "Mr Test " + (n + 1),
    email: "mr-test-" + (n + 1) + "@example.invalid",
    address: "12 rue des Tests, Rennes",
    season_is_test: true,
    review_status: n === 0 ? "PENDING" : "VALIDATED",
    status: "VISIBLE",
    activity: "ACTIVE",
    candy_available: true,
    activities: ["CANDY", "ACTING"],
    season_id: sid,
    starts_at: new Date(now - 3600000).toISOString(),
    ends_at: new Date(now + 7200000).toISOString(),
    submitted_at: new Date(now).toISOString(),
    updated_at: new Date(now).toISOString(),
  }));
  const user = {
    id: "admin",
    role_name: "SUPER_ADMIN",
    display_name: "Admin",
    permissions: [
      "admin.access",
      "stats.read",
      "participants.read",
      "participants.edit",
      "participants.delete",
    ],
    email_status: "VERIFIED",
  };
  const state = {
    setupRequired: false,
    state: "MAP_OPEN",
    instance: {
      id: "instance",
      public_name: "Halloween",
      territory: "Rennes",
      timezone: "Europe/Paris",
      latitude: 48.1,
      longitude: -1.67,
      zoom: 14,
    },
    season: {
      id: sid,
      year: 2026,
      opens_at: new Date(now - 7200000).toISOString(),
      closes_at: new Date(now + 14400000).toISOString(),
    },
    houses: [],
  };
  await page.route("**/api/**", async (r) => {
    const path = new URL(r.request().url()).pathname;
    let data: unknown = {};
    if (path === "/api/me") data = user;
    else if (path === "/api/public") data = state;
    else if (path === "/api/admin/seasons")
      data = [
        {
          ...state.season,
          name: "Tests octobre",
          is_test: true,
          public_active: false,
        },
        {
          ...state.season,
          id: realId,
          name: "Halloween 2026",
          is_test: false,
          public_active: true,
        },
      ];
    else if (path === "/api/admin/houses")
      data =
        new URL(r.request().url()).searchParams.get("seasonId") === sid
          ? houses
          : [];
    else if (path === "/api/admin/dashboard")
      data = { approved: 4, pending: 1, routes: 2, users: 6 };
    else if (path === "/api/admin" && r.request().method() === "POST") {
      const body = r.request().postDataJSON();
      mutations++;
      expect(body.seasonId).toBe(sid);
      const h = houses.find((h) => h.id === body.id)!;
      if (body.action === "houseActivity")
        h.activity = body.payload.action === "end" ? "ENDED" : "ACTIVE";
      else if (body.action === "reviewHouse")
        h.review_status = body.payload.status;
      data = { ok: true };
    }
    await r.fulfill({ json: data });
  });
  await page.goto("/admin");
  await expect(page.getByLabel("Saison du back-office")).toHaveValue(realId);
  await page.getByLabel("Saison du back-office").selectOption(sid);
  await expect(
    page.getByRole("heading", { name: "Tableau de bord", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".beta-sidebar nav button")).toHaveCount(2);
  await expect(page.locator(".beta-content table tbody tr")).toHaveCount(1);
  await page
    .locator(".beta-sidebar")
    .getByRole("button", { name: "Maisons", exact: true })
    .click();
  await expect(page.locator("tbody tr")).toHaveCount(5);
  await expect(page.getByLabel("Saison du back-office")).toHaveValue(sid);
  await page
    .getByRole("row")
    .filter({ hasText: "Mr Test 4" })
    .getByRole("button", { name: "Gérer" })
    .click();
  await page
    .getByRole("button", { name: "Fermer la maison", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("Fermée");
  await page
    .getByRole("button", { name: "Rouvrir la maison", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("Ouverte");
  await page.getByRole("button", { name: "Fermer", exact: true }).click();
  const previous = mutations;
  await page.getByLabel("Saison du back-office").selectOption(realId);
  await expect(page.locator("tbody tr")).toHaveCount(0);
  expect(mutations).toBe(previous);
  await page.getByLabel("Apparence", { exact: true }).selectOption("light");
  await expect(page.locator(".admin-beta")).toHaveAttribute(
    "data-theme",
    "light",
  );
});

test("season context enables direct accounts only in TEST and shows season controls", async ({
  page,
}) => {
  const real = "30000000-0000-4000-8000-000000000002",
    testId = "30000000-0000-4000-8000-000000000001";
  const now = Date.now(),
    dates = {
      year: 2026,
      opens_at: new Date(now - 3600000).toISOString(),
      closes_at: new Date(now + 86400000).toISOString(),
      registrations_open_at: new Date(now - 7200000).toISOString(),
      purge_at: new Date(now + 172800000).toISOString(),
      activated: true,
      registrations_open: true,
    };
  const seasons = [
    {
      ...dates,
      id: real,
      name: "Halloween 2026",
      is_test: false,
      public_active: true,
    },
    {
      ...dates,
      id: testId,
      name: "Tests octobre",
      is_test: true,
      test_used: true,
    },
  ];
  const user = {
    id: "admin",
    role_name: "SUPER_ADMIN",
    display_name: "Admin",
    email_status: "VERIFIED",
    permissions: [
      "admin.access",
      "users.read",
      "users.manage",
      "season.read",
      "season.manage",
      "participants.read",
      "participants.edit",
    ],
  };
  let created: Record<string, unknown> | undefined;
  await page.route("**/api/**", async (r) => {
    const path = new URL(r.request().url()).pathname;
    let data: unknown = {};
    if (path === "/api/me") data = user;
    else if (path === "/api/public")
      data = {
        setupRequired: false,
        state: "MAP_OPEN",
        instance: {
          id: "instance",
          public_name: "Halloween",
          territory: "Rennes",
          timezone: "Europe/Paris",
          latitude: 48.1,
          longitude: -1.67,
          zoom: 14,
        },
        season: seasons[0],
        houses: [],
      };
    else if (path === "/api/admin/seasons") data = seasons;
    else if (path === "/api/admin/roles")
      data = [
        {
          id: "20000000-0000-4000-8000-000000000001",
          name: "USER",
          permissions: [],
        },
      ];
    else if (path === "/api/admin/users" && r.request().method() === "POST") {
      created = r.request().postDataJSON();
      data = { ok: true };
    } else if (path === "/api/admin/users" || path === "/api/admin/houses")
      data = [];
    await r.fulfill({ json: data });
  });
  await page.goto("/admin");
  const selector = page.getByLabel("Saison du back-office");
  await expect(selector).toHaveValue(real);
  await page
    .locator(".beta-sidebar")
    .getByRole("button", { name: "Utilisateurs", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Créer un utilisateur", exact: true })
    .click();
  await expect(page.getByLabel("Créer sans envoyer d’invitation")).toHaveCount(
    0,
  );
  await selector.selectOption(testId);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Créer un utilisateur", exact: true })
    .click();
  await page.getByLabel("Nom ou pseudo").fill("Mr Test 1");
  await page
    .getByRole("textbox", { name: /^Email/ })
    .fill("mr-test-1@example.invalid");
  await page.getByLabel("Créer sans envoyer d’invitation").check();
  await page
    .getByLabel("Mot de passe (12 caractères minimum)")
    .fill("valid-password-1234");
  await page
    .getByRole("button", { name: "Créer le compte", exact: true })
    .click();
  await expect
    .poll(() => created)
    .toMatchObject({
      seasonId: testId,
      without_invitation: true,
      password: "valid-password-1234",
      action: "invite",
    });
  await page
    .locator(".beta-sidebar")
    .getByRole("button", { name: "Saisons", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Utilisée pour les tests" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Supprimer la saison de test" }),
  ).toBeVisible();
  await expect(
    page.getByText("Cette saison est un environnement de test isolé.", {
      exact: false,
    }),
  ).toBeVisible();
});
