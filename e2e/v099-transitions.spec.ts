import { test, expect } from "@playwright/test";

test("V099 registration, map opening and closing update without navigation or reload", async ({ page }) => {
  const now = +new Date("2026-10-31T17:00:00Z");
  await page.clock.install({ time: new Date(now) });
  await page.clock.pauseAt(new Date(now + 1000));
  const iso = (offset: number) => new Date(now + offset).toISOString();
  const season = {
    id: "30000000-0000-4000-8000-000000000001", year: 2026, active: true,
    registrations_open_at: iso(5000), opens_at: iso(10000), closes_at: iso(15000), purge_at: iso(86400000),
  };
  let stage = 0, publicRequests = 0;
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    let data: unknown = null;
    if (path === "/api/me") data = {
      id: "member", role_name: "USER", permissions: [], email_status: "VERIFIED",
      account_status: "ACTIVE", display_name: "Camille",
    };
    if (path === "/api/public") {
      publicRequests++;
      data = {
        setupRequired: false, state: stage === 2 ? "MAP_OPEN" : stage === 3 ? "CLOSED" : "COUNTDOWN",
        instance: { id: "20000000-0000-4000-8000-000000000001", public_name: "Halloween Map", territory: "Rennes", timezone: "Europe/Paris", latitude: 48.1, longitude: -1.67, zoom: 14 },
        season: { ...season, registrations_open: stage === 1 || stage === 2 },
        mapAccessible: stage === 2, publicMapOpen: stage === 2, collectionAccessible: stage === 2,
        earlyAccess: false, houses: [], routeCandidates: [], count: 0, documents: {}, contents: {},
      };
    }
    await route.fulfill({ json: data });
  });
  await page.route("https://basemaps.cartocdn.com/**", (route) => route.fulfill({ json: { version: 8, sources: {}, layers: [] } }));
  let navigations = 0;
  page.on("request", (request) => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) navigations++;
  });
  await page.goto("/");
  await expect(page.locator(".home-clock")).toBeVisible();
  await expect(page.getByRole("link", { name: "Inscrire ma maison", exact: true })).toHaveCount(0);
  stage = 1;
  await page.clock.runFor(4500);
  await expect(page.getByRole("link", { name: "Inscrire ma maison", exact: true })).toBeVisible();
  stage = 2;
  await page.clock.runFor(5000);
  await expect(page.locator(".route-experience")).toBeVisible();
  stage = 3;
  await page.clock.runFor(5000);
  await expect(page.locator(".route-experience")).toHaveCount(0);
  await expect(page.locator(".home-state-card")).toContainText("La saison est terminée");
  expect(publicRequests).toBeGreaterThanOrEqual(4);
  expect(navigations).toBe(1);
});
