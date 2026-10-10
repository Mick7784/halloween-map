import { test, expect, type Page } from "@playwright/test";
const activeId = "30000000-0000-4000-8000-000000000001";
const historyId = "30000000-0000-4000-8000-000000000002";
const emptyId = "30000000-0000-4000-8000-000000000003";
async function arrange(page: Page, isTest: boolean, isActive = true) {
  const now = Date.now();
  const seasons = [
    { id: activeId, name: "Saison active", is_test: isTest, active: isActive },
    {
      id: historyId,
      name: "Historique purgé",
      is_test: false,
      archived: true,
      purged_at: new Date(now).toISOString(),
    },
    { id: emptyId, name: "Saison planifiée", is_test: false },
  ].map((s) => ({
    ...s,
    year: new Date().getFullYear(),
    opens_at: new Date(now - 3600000).toISOString(),
    closes_at: new Date(now + 86400000).toISOString(),
  }));
  const live = {
    houses: 4,
    approved: 2,
    pending: 1,
    refused: 1,
    participants: 4,
    candy: 3,
    decoration: 2,
    acting: 1,
    routes: 5,
    collections_started: 4,
    collections_finished: 2,
    visited: 6,
    completion_sum: 1.5,
    distance_meters: 4000,
    duration_seconds: 1200,
  };
  const history = {
    houses: 17,
    approved: 15,
    pending: 0,
    refused: 2,
    participants: 17,
    candy: 12,
    decoration: 5,
    acting: 3,
    routes: 20,
  };
  const owner = {
    id: "20000000-0000-4000-8000-000000000001",
    display_name: "Alice",
    email: "alice@example.invalid",
    email_status: "VERIFIED",
    account_status: "ACTIVE",
  };
  const houses: Record<string, unknown>[] = [];
  const suggestion = {
    label: "12 rue des Tests, Rennes",
    postalCode: "35000",
    city: "Rennes",
    cityCode: "35238",
    number: "12",
    street: "rue des Tests",
    latitude: 48.1,
    longitude: -1.67,
    point: [-1.67, 48.1],
  };
  await page.route("**/api/**", async (r) => {
    const url = new URL(r.request().url()),
      path = url.pathname,
      sid = url.searchParams.get("seasonId") ?? activeId;
    let data: unknown = {};
    if (path === "/api/me")
      data = {
        id: "admin",
        display_name: "Admin",
        role_name: "SUPER_ADMIN",
        email_status: "VERIFIED",
        permissions: [
          "admin.access",
          "stats.read",
          "participants.read",
          "participants.edit",
          "users.read",
          "users.manage",
          "season.read",
        ],
      };
    else if (path === "/api/public")
      data = {
        setupRequired: false,
        state: "MAP_OPEN",
        mapAccessible: true,
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
    else if (path === "/api/admin/statistics")
      data = {
        seasonId: sid,
        snapshot: sid === historyId,
        stats:
          sid === activeId
            ? live
            : sid === historyId
              ? history
              : {
                  houses: 0,
                  approved: 0,
                  pending: 0,
                  refused: 0,
                  participants: 0,
                  candy: 0,
                  decoration: 0,
                  acting: 0,
                  routes: 0,
                },
      };
    else if (path === "/api/admin/dashboard")
      data = { approved: 2, pending: 1, routes: 5, users: 4 };
    else if (path === "/api/admin/houses")
      data = sid === activeId ? houses : [];
    else if (path === "/api/admin/eligibleOwners")
      data = [
        owner,
        {
          ...owner,
          id: "20000000-0000-4000-8000-000000000002",
          display_name: "Bob",
          email: "bob@example.invalid",
        },
      ];
    else if (path === "/api/admin/users") data = [owner];
    else if (path === "/api/admin/roles")
      data = [{ id: owner.id, name: "USER" }];
    else if (path === "/api/location")
      data =
        url.searchParams.get("mode") === "communes"
          ? [{ code: "35238", nom: "Rennes", codesPostaux: ["35000"] }]
          : url.searchParams.get("mode") === "search"
            ? [suggestion]
            : suggestion;
    else if (path === "/api/admin" && r.request().method() === "POST") {
      const body = r.request().postDataJSON();
      expect(body.action).toBe("createHouse");
      expect(body.seasonId).toBe(activeId);
      expect(body.payload.userId).toBe(owner.id);
      expect(body.payload.participation.house).not.toHaveProperty(
        "review_status",
      );
      houses.push({
        ...body.payload.participation.house,
        id: "new-house",
        season_id: activeId,
        owner_name: owner.display_name,
        email: owner.email,
        review_status: "VALIDATED",
        status: "VISIBLE",
        activity: "ACTIVE",
        candy_available: true,
        updated_at: new Date().toISOString(),
        ...{ starts_at: seasons[0].opens_at, ends_at: seasons[0].closes_at },
      });
      data = { ok: true };
    }
    await r.fulfill({ json: data });
  });
  await page.goto("/admin");
  await expect(
    page.getByRole("heading", { name: "Tableau de bord", exact: true }),
  ).toBeVisible();
}
for (const isTest of [false, true])
  test(`statistics consulted REAL/TEST (${isTest}) and anonymous history, with absent metrics`, async ({
    page,
  }) => {
    await arrange(page, isTest);
    await page
      .locator(".beta-sidebar")
      .getByRole("button", { name: "Statistiques", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Statistiques", exact: true }),
    ).toBeVisible();
    await expect(
      page
        .locator(".stats-kpis article")
        .filter({ hasText: "Maisons inscrites" }),
    ).toContainText("4");
    await expect(page.locator(".stats-chart")).toHaveCount(3);
    await expect(
      page
        .getByRole("region", { name: "Activités des maisons" })
        .locator("li")
        .first(),
    ).toHaveText("Bonbons3");
    await expect(
      page
        .locator(".stats-kpis article")
        .filter({ hasText: "Taux de collectes terminées" }),
    ).toContainText("50 %");
    if (!isTest) {
      await page.getByLabel("Apparence", { exact: true }).selectOption("dark");
      await page.screenshot({
        path: "test-results/statistics-desktop-dark.png",
      });
    }
    await page
      .getByLabel("Saison consultée", { exact: true })
      .selectOption(historyId);
    await expect(
      page
        .locator(".stats-kpis article")
        .filter({ hasText: "Maisons inscrites" }),
    ).toContainText("17");
    await expect(
      page.getByText(
        "Historique en lecture seule · snapshot anonyme conservé.",
        { exact: false },
      ),
    ).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Parcours et collectes" }),
    ).toContainText("Donnée non disponible");
    await page
      .getByLabel("Saison consultée", { exact: true })
      .selectOption(emptyId);
    await expect(
      page
        .locator(".stats-kpis article")
        .filter({ hasText: "Maisons inscrites" }),
    ).toContainText("0");
    await expect(
      page
        .locator(".stats-kpis article")
        .filter({ hasText: "Visites déclarées" }),
    ).toContainText("Donnée non disponible");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByLabel("Apparence", { exact: true }).selectOption("light");
    await expect(
      page.getByRole("region", { name: "Activités des maisons" }),
    ).toBeVisible();
    if (!isTest)
      await page.screenshot({
        path: "test-results/statistics-mobile-light.png",
      });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
test("new house uses shared form, searchable owner and refreshed validated list; inactive season disables creation", async ({
  page,
}) => {
  await arrange(page, false);
  await page
    .locator(".beta-sidebar")
    .getByRole("button", { name: "Maisons", exact: true })
    .click();
  await page.getByLabel("Saison du back-office").selectOption(historyId);
  await expect(
    page.getByRole("button", { name: "+ Nouvelle maison", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Revenir à la saison active" })
    .click();
  await page
    .getByRole("button", { name: "+ Nouvelle maison", exact: true })
    .click();
  await page.getByLabel("Rechercher un propriétaire").fill("alice@");
  await expect(
    page.getByLabel("Propriétaire", { exact: true }).locator("option"),
  ).toHaveCount(2);
  await page
    .getByLabel("Propriétaire", { exact: true })
    .selectOption("20000000-0000-4000-8000-000000000001");
  await page.getByLabel("Code postal *", { exact: true }).fill("35000");
  await expect(
    page.getByRole("combobox", { name: "Ville *", exact: true }),
  ).toHaveValue("35238");
  await page.getByLabel("Numéro", { exact: false }).fill("12");
  await page.getByLabel("Rue", { exact: false }).fill("rue des Tests");
  await page.getByRole("button", { name: "12 rue des Tests, Rennes" }).click();
  await page
    .getByRole("button", { name: "Confirmer le point de ma maison" })
    .click();
  await page
    .getByLabel("Nom de la maison *", { exact: true })
    .fill("Maison Alice");
  await page.getByRole("checkbox").last().check();
  await page.getByRole("button", { name: "Créer la maison" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("row").filter({ hasText: "Maison Alice" }),
  ).toContainText("Validée");
  await page
    .getByRole("row")
    .filter({ hasText: "Maison Alice" })
    .getByRole("button", { name: "Gérer" })
    .click();
  await expect(
    page.getByRole("button", { name: "Valider", exact: true }),
  ).toHaveCount(0);
});
test("owner creation opens the existing user flow", async ({ page }) => {
  await arrange(page, true);
  await page
    .locator(".beta-sidebar")
    .getByRole("button", { name: "Maisons", exact: true })
    .click();
  await page
    .getByRole("button", { name: "+ Nouvelle maison", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Créer un utilisateur", exact: true })
    .click();
  await expect(page.getByLabel("Nom ou pseudo")).toBeVisible();
  await expect(
    page.getByLabel("Créer sans envoyer d’invitation"),
  ).toBeVisible();
});

test("no active season keeps the house CTA disabled with an explanation", async ({
  page,
}) => {
  await arrange(page, false, false);
  await page
    .locator(".beta-sidebar")
    .getByRole("button", { name: "Maisons", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "+ Nouvelle maison", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByText("Activez une saison avant de créer une maison.", {
      exact: true,
    }),
  ).toBeVisible();
});
