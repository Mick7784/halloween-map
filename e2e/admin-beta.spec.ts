import { test, expect } from "@playwright/test";
test("beta desktop exposes only useful navigation, pending moderation and normal house actions", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const now = Date.now(),
    sid = "30000000-0000-4000-8000-000000000001";
  const houses = Array.from({ length: 5 }, (_, n) => ({
    id: "10000000-0000-4000-8000-00000000000" + n,
    name: "Mr Test " + (n + 1),
    owner_name: "Mr Test " + (n + 1),
    email: "mr-test-" + (n + 1) + "@example.invalid",
    address: "12 rue des Tests, Rennes",
    is_test: true,
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
    else if (path === "/api/admin/houses") data = houses;
    else if (path === "/api/admin/dashboard")
      data = { approved: 4, pending: 1, routes: 2, users: 6 };
    else if (path === "/api/admin" && r.request().method() === "POST") {
      const body = r.request().postDataJSON();
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
  await page.getByLabel("Profils", { exact: true }).selectOption("NORMAL");
  await expect(page.locator("tbody tr")).toHaveCount(0);
  await page.getByLabel("Profils", { exact: true }).selectOption("TEST");
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
  await page.getByLabel("Apparence", { exact: true }).selectOption("light");
  await expect(page.locator(".admin-beta")).toHaveAttribute(
    "data-theme",
    "light",
  );
});
