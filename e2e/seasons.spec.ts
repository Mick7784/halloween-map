import { test, expect, type Page } from "@playwright/test";
const real = "30000000-0000-4000-8000-000000000001",
  planned = "30000000-0000-4000-8000-000000000002",
  testId = "30000000-0000-4000-8000-000000000003",
  past = "30000000-0000-4000-8000-000000000004";
async function arrange(page: Page, role = "SUPER_ADMIN") {
  const now = Date.now(),
    base = {
      instance_id: "instance",
      year: 2026,
      registrations_open: true,
      registrations_open_at: new Date(now - 86400000).toISOString(),
      opens_at: new Date(now - 3600000).toISOString(),
      closes_at: new Date(now + 86400000).toISOString(),
      purge_at: new Date(now + 172800000).toISOString(),
      archived: false,
      purged_at: null,
      stats: {},
      routes_count: 0,
    };
  let seasons = [
    { ...base, id: real, name: "Halloween 2026", is_test: false, active: true },
    {
      ...base,
      id: planned,
      name: "Halloween 2027",
      year: 2027,
      is_test: false,
      active: false,
      opens_at: new Date(now + 365 * 86400000).toISOString(),
      closes_at: new Date(now + 366 * 86400000).toISOString(),
    },
    {
      ...base,
      id: testId,
      name: "Essais octobre",
      is_test: true,
      active: false,
    },
    {
      ...base,
      id: past,
      name: "Halloween 2025",
      year: 2025,
      is_test: false,
      active: false,
      archived: true,
      purged_at: new Date(now - 86400000).toISOString(),
      stats_snapshot_at: new Date(now - 86400000).toISOString(),
      stats: {
        houses: 84,
        approved: 70,
        refused: 14,
        participants: 80,
        routes: 612,
        collections_started: 500,
        collections_finished: 400,
        visited: 3000,
        distance_meters: 1400000,
        duration_seconds: 1600000,
        completion_sum: 320,
      },
    },
  ];
  const mutations: Record<string, unknown>[] = [],
    paths: string[] = [];
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url()),
      path = url.pathname;
    paths.push(path);
    const active = seasons.find((s) => s.active),
      sid = url.searchParams.get("seasonId") ?? active?.id;
    let data: unknown = {};
    if (path === "/api/me")
      data = {
        id: "admin",
        instance_id: "instance",
        display_name: "Mickaël",
        role_name: role,
        email_status: "VERIFIED",
        permissions:
          role === "USER"
            ? []
            : [
                "admin.access",
                "stats.read",
                "audit.read",
                "participants.read",
                "participants.edit",
                "users.read",
                "users.manage",
                "season.read",
                "season.manage",
                ...(role === "SUPER_ADMIN"
                  ? ["settings.read", "settings.manage", "roles.manage"]
                  : []),
              ],
      };
    else if (path === "/api/public")
      data = {
        setupRequired: false,
        mapAccessible: !!active && (!active.is_test || role !== "USER"),
        state:
          active && (!active.is_test || role !== "USER")
            ? "MAP_OPEN"
            : "PREPARATION",
        instance: {
          id: "instance",
          public_name: "Halloween Map",
          territory: "Rennes",
          timezone: "Europe/Paris",
          latitude: 48.1,
          longitude: -1.67,
          zoom: 14,
        },
        season: active?.is_test && role === "USER" ? null : (active ?? null),
        houses: [],
        routeCandidates: [],
      };
    else if (path === "/api/admin/seasons") data = seasons;
    else if (path === "/api/admin/dashboard")
      data = {
        approved: active?.is_test ? 5 : 24,
        pending: 0,
        routes: 18,
        users: 30,
        season: active,
      };
    else if (
      path === "/api/admin/houses" ||
      path === "/api/admin/audit" ||
      path === "/api/admin/users" ||
      path === "/api/admin/roles"
    )
      data = [];
    else if (path === "/api/admin" && route.request().method() === "POST") {
      const body = route.request().postDataJSON();
      mutations.push(body);
      if (body.action === "activateSeason")
        seasons = seasons.map((s) => ({ ...s, active: s.id === body.id }));
      if (body.action === "deactivateSeason")
        seasons = seasons.map((s) => ({ ...s, active: false }));
      if (body.action === "deleteSeason")
        seasons = seasons.filter((s) => s.id !== body.id);
      if (body.action === "season" && !body.id)
        seasons.push({
          ...base,
          id: "30000000-0000-4000-8000-000000000005",
          name: body.payload.name,
          is_test: body.payload.is_test,
          active: false,
        });
      data = { ok: true };
    }
    void sid;
    await route.fulfill({ json: data });
  });
  return {
    mutations,
    paths,
    activateTest: () => {
      seasons = seasons.map((s) => ({ ...s, active: s.id === testId }));
    },
  };
}
async function openSeasons(page: Page) {
  await page
    .getByRole("navigation", { name: "Navigation administration" })
    .getByRole("button", { name: "Saison", exact: true })
    .click();
}

test("compact ordered season list, compact TEST creation, and dark/light appearance", async ({
  page,
}) => {
  const { mutations } = await arrange(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/admin");
  await openSeasons(page);
  const rows = page.locator(".season-table tbody > tr");
  await expect(rows).toHaveCount(4);
  await expect(rows.nth(0)).toContainText("Halloween 2026");
  await expect(rows.nth(1)).toContainText("Halloween 2027");
  await expect(rows.nth(2)).toContainText("Essais octobre");
  await expect(rows.nth(3)).toContainText("Halloween 2025");
  await expect(page.locator(".season-editor")).toHaveCount(0);
  await expect(page.getByText("Mode démo", { exact: true })).toHaveCount(0);
  await page.getByLabel("Apparence", { exact: true }).selectOption("dark");
  await expect(page.locator(".beta-sidebar nav button").first()).toHaveCSS(
    "background-color",
    "rgb(21, 28, 40)",
  );
  await page.screenshot({ path: "test-results/seasons-desktop-dark.png" });
  await page.getByLabel("Apparence", { exact: true }).selectOption("light");
  await expect(page.locator(".beta-sidebar nav button").first()).toHaveCSS(
    "background-color",
    "rgb(255, 255, 255)",
  );
  await page.screenshot({ path: "test-results/seasons-desktop-light.png" });
  await page.getByRole("button", { name: "Nouvelle saison" }).click();
  const dialog = page.getByRole("dialog", { name: "Nouvelle saison" });
  await dialog.getByLabel("Type de saison").selectOption("TEST");
  await dialog.getByLabel("Nom de la saison").fill("Essais téléphone");
  await expect(dialog.locator('input[type="datetime-local"]')).toHaveCount(0);
  await dialog
    .getByRole("button", { name: "Enregistrer", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator(".season-table")).toContainText("Essais téléphone");
  expect(mutations).toEqual([
    expect.objectContaining({
      action: "season",
      payload: expect.objectContaining({
        is_test: true,
        name: "Essais téléphone",
      }),
    }),
  ]);
});
test("TEST activation replaces REAL, dashboard follows active, deactivation leaves an empty dashboard", async ({
  page,
}) => {
  const { mutations } = await arrange(page);
  await page.goto("/admin");
  await openSeasons(page);
  const row = page.locator("tr").filter({ hasText: "Essais octobre" });
  page.once("dialog", (d) => d.accept());
  await row.getByRole("button", { name: "Activer", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Confirmer l’action sensible" })
    .getByLabel("Mot de passe")
    .fill("fixture-password-1234");
  await page
    .getByRole("dialog", { name: "Confirmer l’action sensible" })
    .getByRole("button", { name: "Confirmer", exact: true })
    .click();
  await expect(page.locator(".beta-context")).toContainText(
    "Saison active : Essais octobre",
  );
  await expect(page.locator(".season-active")).toHaveCount(1);
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Tableau de bord", exact: true })
    .click();
  await expect(
    page.locator(".beta-kpis article").filter({ hasText: "Maisons validées" }),
  ).toContainText("5");
  await expect(page.getByLabel("Saison du back-office")).toHaveCount(0);
  await openSeasons(page);
  page.once("dialog", (d) => d.accept());
  await row.getByRole("button", { name: "Désactiver", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Confirmer l’action sensible" })
    .getByLabel("Mot de passe")
    .fill("fixture-password-1234");
  await page
    .getByRole("dialog", { name: "Confirmer l’action sensible" })
    .getByRole("button", { name: "Confirmer", exact: true })
    .click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Tableau de bord", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Aucune saison active" }),
  ).toBeVisible();
  await expect(page.locator(".beta-kpis article")).toHaveCount(0);
  expect(mutations.map((m) => m.action)).toEqual([
    "activateSeason",
    "deactivateSeason",
  ]);
});
test("history reads anonymous snapshot and exposes no edit/reactivation", async ({
  page,
}) => {
  const { paths } = await arrange(page);
  await page.goto("/admin");
  await openSeasons(page);
  const row = page.locator("tr").filter({ hasText: "Halloween 2025" });
  await expect(
    row.getByRole("button", { name: "Activer", exact: true }),
  ).toHaveCount(0);
  await expect(row.getByRole("button", { name: /Réglages/ })).toHaveCount(0);
  await row.getByRole("button", { name: "Voir les statistiques" }).click();
  const dialog = page.getByRole("dialog", { name: "Statistiques historiques" });
  await expect(dialog).toContainText("84");
  await expect(dialog).toContainText("80 %");
  await expect(dialog).not.toContainText("Adresse");
  await expect(dialog).toContainText("lecture seule");
  expect(paths).not.toContain("/api/admin/stats");
});
test("mobile season list remains usable and ADMIN has no critical activation/deletion", async ({
  page,
}) => {
  await arrange(page, "ADMIN");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/admin");
  await page.getByRole("button", { name: "Ouvrir la navigation" }).click();
  await openSeasons(page);
  await expect(page.locator(".season-table")).toBeVisible();
  await expect(page.locator(".season-period").first()).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Activer", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Désactiver", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Supprimer définitivement" }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.screenshot({ path: "test-results/seasons-mobile.png" });
});
test("normal USER cannot render the TEST map or a demo entry", async ({
  page,
}) => {
  const fixture = await arrange(page, "USER");
  fixture.activateTest();
  await page.goto("/map");
  await expect(page.locator(".map-experience")).toHaveCount(0);
  await expect(page.getByText("Mode démo", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Essais octobre", { exact: true })).toHaveCount(
    0,
  );
});
