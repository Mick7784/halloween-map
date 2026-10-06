import { test, expect, type Page } from "@playwright/test";
const real = "30000000-0000-4000-8000-000000000001",
  other = "30000000-0000-4000-8000-000000000002",
  testId = "30000000-0000-4000-8000-000000000003";
async function arrange(page: Page, role = "SUPER_ADMIN") {
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
      activated: true,
      public_active: true,
      test_used: false,
    },
    {
      ...dates,
      id: other,
      name: "Halloween prochaine édition",
      is_test: false,
      activated: false,
      public_active: false,
      test_used: false,
    },
    {
      ...dates,
      id: testId,
      name: "Essais octobre",
      is_test: true,
      activated: true,
      public_active: false,
      test_used: true,
    },
  ];
  const mutations: { action: string; id?: string }[] = [];
  const permissions = [
    "admin.access",
    "stats.read",
    "audit.read",
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
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url()),
      path = url.pathname,
      sid = url.searchParams.get("seasonId");
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
        state: "MAP_OPEN",
        instance: {
          id: "instance",
          public_name: "Halloween Map",
          territory: "Rennes",
          timezone: "Europe/Paris",
          latitude: 48.1,
          longitude: -1.67,
          zoom: 14,
        },
        season: seasons.find((s) => s.public_active),
        houses: [],
      };
    else if (path === "/api/admin/seasons") data = seasons;
    else if (path === "/api/admin/dashboard")
      data =
        sid === real
          ? { approved: 24, pending: 1, routes: 18, users: 30 }
          : sid === testId
            ? { approved: 5, pending: 1, routes: 3, users: 7 }
            : { approved: 0, pending: 0, routes: 0, users: 0 };
    else if (path === "/api/admin/houses")
      data =
        sid === other
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
                address_parts: { city: "Rennes" },
                review_status: "PENDING",
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
        sid === other
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
    else if (path === "/api/admin/users" || path === "/api/admin/roles")
      data = [];
    else if (path === "/api/admin" && route.request().method() === "POST") {
      const body = route.request().postDataJSON();
      mutations.push(body);
      if (body.action === "activateSeason")
        seasons = seasons.map((s) =>
          s.is_test
            ? s
            : {
                ...s,
                activated: s.id === body.id,
                public_active: s.id === body.id,
              },
        );
      if (body.action === "useForTests")
        seasons = seasons.map((s) => ({ ...s, test_used: s.id === body.id }));
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
test("desktop shell, themes, independent persisted season context and existing navigation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1080 });
  const { mutations, removeTest } = await arrange(page);
  await page.goto("/admin");
  const selector = page.getByLabel("Saison du back-office");
  await expect(selector).toHaveValue(real);
  await expect(
    page.locator(".beta-kpis article").filter({ hasText: "Maisons validées" }),
  ).toContainText("24");
  await expect(page.locator(".beta-activity-list")).toContainText(
    "Maison validée",
  );
  await expect(page.locator(".beta-activity-list")).not.toContainText(
    "house.review",
  );
  await page.getByLabel("Apparence", { exact: true }).selectOption("dark");
  await expect(page.locator(".admin-beta")).toHaveCSS(
    "background-color",
    "rgb(12, 17, 26)",
  );
  await page
    .locator(".beta-sidebar")
    .evaluate((el) =>
      Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished)),
    );
  await expect(page.locator(".beta-sidebar nav button.is-current")).toHaveCSS(
    "color",
    "rgb(255, 154, 83)",
  );
  await page.screenshot({ path: "test-results/admin-desktop-dark.png" });
  await page.getByLabel("Apparence", { exact: true }).selectOption("light");
  await expect(page.locator(".admin-beta")).toHaveCSS(
    "background-color",
    "rgb(244, 246, 250)",
  );
  await page
    .locator(".beta-sidebar")
    .evaluate((el) =>
      Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished)),
    );
  await page.screenshot({ path: "test-results/admin-desktop-light.png" });
  await page.getByLabel("Apparence", { exact: true }).selectOption("system");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator(".admin-beta")).toHaveCSS(
    "background-color",
    "rgb(12, 17, 26)",
  );
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator(".admin-beta")).toHaveCSS(
    "background-color",
    "rgb(244, 246, 250)",
  );
  for (const sid of [testId, other, real, testId])
    await selector.selectOption(sid);
  await expect(
    page.locator(".beta-kpis article").filter({ hasText: "Maisons validées" }),
  ).toContainText("5");
  await expect(page.locator(".beta-pending-list")).toContainText(
    "Maison des essais",
  );
  await expect(page.locator(".beta-context")).toContainText(
    "Saison publique : Halloween 2026",
  );
  await expect(page.locator(".beta-activity-list")).not.toContainText(
    "Jardin des lanternes",
  );
  expect(mutations).toEqual([]);
  await page.reload();
  await expect(selector).toHaveValue(testId);
  await expect(page.getByLabel("Apparence", { exact: true })).toHaveValue(
    "system",
  );
  const nav = page.getByRole("navigation", {
    name: "Navigation administration",
  });
  for (const name of [
    "Maisons",
    "Utilisateurs",
    "Parcours",
    "Saison",
    "Rôles & permissions",
    "Tableau de bord",
  ]) {
    await nav.getByRole("button", { name, exact: true }).click();
    await expect(page.locator(".beta-page-title h1")).toHaveText(name);
  }
  await expect(page.locator(".beta-logo")).toHaveAttribute(
    "href",
    "https://github.com/Mick7784/halloween-map",
  );
  removeTest();
  await page.getByRole("button", { name: "Actualiser les données" }).click();
  await expect(selector).toHaveValue(real);
});
test("explicit activation confirms, excludes TEST and updates public state immediately", async ({
  page,
}) => {
  const { mutations } = await arrange(page);
  await page.goto("/admin");
  await page.getByLabel("Saison du back-office").selectOption(other);
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Saison", exact: true })
    .click();
  page.once("dialog", (d) => d.dismiss());
  await page
    .getByRole("button", { name: "Activer cette saison", exact: true })
    .click();
  expect(mutations).toEqual([]);
  page.once("dialog", async (d) => {
    expect(d.message()).toContain("automatiquement désactivée");
    await d.accept();
  });
  await page
    .getByRole("button", { name: "Activer cette saison", exact: true })
    .click();
  await expect(page.locator(".beta-context")).toContainText(
    "Saison publique : Halloween prochaine édition",
  );
  expect(mutations).toEqual([
    expect.objectContaining({
      action: "activateSeason",
      id: other,
      payload: "ACTIVER",
    }),
  ]);
  await page.getByLabel("Saison du back-office").selectOption(testId);
  await expect(
    page.getByRole("button", { name: "Activer cette saison", exact: true }),
  ).toHaveCount(0);
  await page.getByLabel("Saison du back-office").selectOption(real);
  await expect(
    page.getByRole("button", { name: "Activer cette saison", exact: true }),
  ).toBeVisible();
});
test("mobile dashboard simplifies presentation and navigation respects ADMIN permissions", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await arrange(page, "ADMIN");
  await page.goto("/admin");
  await expect(page.locator(".beta-kpis article")).toHaveCount(4);
  expect(
    await page.evaluate(
      () => document.querySelector(".beta-content")!.scrollWidth,
    ),
  ).toBeLessThanOrEqual(390);
  await page.screenshot({ path: "test-results/admin-mobile.png" });
  await page.getByRole("button", { name: "Ouvrir la navigation" }).click();
  const nav = page.getByRole("navigation");
  await expect(
    nav.getByRole("button", { name: "Rôles & permissions", exact: true }),
  ).toHaveCount(0);
  await expect(
    nav.getByRole("button", { name: "Paramètres", exact: true }),
  ).toHaveCount(0);
  await nav.getByRole("button", { name: "Maisons", exact: true }).click();
  await expect(page.locator(".beta-sidebar")).not.toHaveClass(/is-open/);
  await expect(page.getByLabel("Saison du back-office")).toHaveValue(real);
});
