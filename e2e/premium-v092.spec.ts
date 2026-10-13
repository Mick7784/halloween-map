import { test, expect, type Page } from "@playwright/test";
import { realSeasonFixture } from "./fixtures/real-season";
const instant = "2026-10-18T20:32:24Z";
const now = Date.parse(instant);
const season = realSeasonFixture({ now, opensIn: Date.parse("2026-10-31T17:00:00Z") - now });
const state = {
  setupRequired: false, state: "COUNTDOWN", count: 12,
  publicMapOpen: false, mapAccessible: false, serverTime: instant,
  instance: { id: season.instance_id, active_season_id: season.id,
    public_name: "Halloween Map", territory: "Villiers-sur-Morin",
    timezone: "Europe/Paris", latitude: 48.8, longitude: 2.8, zoom: 14 },
  season, nextOpening: season.opens_at, houses: [], routeCandidates: [],
  contents: { "account.create": "Créer un compte", "privacy.title": "Vos données personnelles",
    "privacy.signup": "Votre compte et votre participation restent sous votre contrôle." },
  documents: {}, projectLinks: {},
};
async function enter(page: Page, path = "/", signedIn = false) {
  await page.clock.install({ time: new Date(instant) });
  await page.addInitScript(() => {
    Object.defineProperty(window, "DeviceOrientationEvent", {
      configurable: true, value: class extends Event {},
    });
  });
  await page.route("**/api/**", (route) => route.fulfill({ json: { ok: true } }));
  await page.route("**/api/public*", (route) => route.fulfill({ json: state }));
  await page.route("**/api/me", (route) => route.fulfill({ json: signedIn ? {
    id: "premium-user", instance_id: season.instance_id, account_status: "ACTIVE",
    role_name: "USER", permissions: [], email_status: "VERIFIED",
    display_name: "Camille", email: "camille@example.invalid",
  } : null }));
  await page.route("**/api/house", (route) => route.fulfill({ json: null }));
  await page.route("**/api/history", (route) => route.fulfill({ json: [] }));
  await page.goto(path);
  await expect(page.getByRole("button", { name: "Menu utilisateur", exact: true, includeHidden: true })).toBeAttached();
  await page.evaluate(() => document.fonts.ready);
}
async function emit(page: Page, beta: number, gamma: number) {
  await page.evaluate(({ beta, gamma }) => {
    const event = new Event("deviceorientation");
    Object.defineProperties(event, { beta: { value: beta }, gamma: { value: gamma } });
    window.dispatchEvent(event);
  }, { beta, gamma });
}
for (const width of [390, 1440]) {
  for (const path of ["/login", "/register", "/forgot-password", "/privacy", "/about"]) {
    test(`V0.9.2 shared surfaces, focus and static secondary page ${path} ${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: width < 760 ? 844 : 900 });
      await enter(page, path);
      await expect(page.locator(".application")).toBeVisible();
      await expect(page.locator(".application > header")).toHaveCSS("border-bottom-color", "rgb(87, 69, 97)");
      await expect(page.locator(".home-art")).toHaveCount(0);
      await expect(page.locator(".application .brand strong")).toHaveText("Halloween Map");
      const focusable = page.locator("main").locator("input, button, a").first();
      if (await focusable.count()) {
        await focusable.focus();
        await expect(focusable).toBeFocused();
        await expect(focusable).toHaveCSS("outline-style", "solid");
      }
      const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      expect(horizontalOverflow).toBeLessThanOrEqual(0);
      await page.screenshot({ animations: "disabled", fullPage: true,
        path: `test-results/premium-v092/${path.slice(1)}-${width}.png` });
    });
  }
  for (const path of ["/account", "/participant"]) {
    test(`V0.9.2 personal surfaces retain static home backdrop ${path} ${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: width < 760 ? 844 : 900 });
      await enter(page, path, true);
      const dialog = page.getByRole("dialog").first();
      await expect(dialog).toBeVisible();
      await expect(dialog).toHaveCSS("background-color", "rgb(14, 19, 40)");
      await expect(page.locator(".home-art")).not.toHaveAttribute("data-home-sensor", "listening");
      await emit(page, 35, 10);
      await emit(page, 55, 40);
      await page.clock.runFor(420);
      await expect(page.locator(".home-art")).not.toHaveAttribute("data-home-motion", "active");
      await page.screenshot({ animations: "disabled",
        path: `test-results/premium-v092/${path.slice(1)}-${width}.png` });
    });
  }
  test(`V0.9.2 guest menu shares the premium palette ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: width < 760 ? 844 : 900 });
    await enter(page);
    await page.getByRole("button", { name: "Menu utilisateur", exact: true }).click();
    const dialog = page.getByRole("dialog").first();
    await expect(dialog).toHaveCSS("background-color", "rgb(14, 19, 40)");
    await expect(page.locator(".home-art")).not.toHaveAttribute("data-home-sensor", "listening");
    await page.screenshot({ animations: "disabled", path: `test-results/premium-v092/menu-${width}.png` });
  });
}
test("V0.9.2 menu and authentication pause the decorative homepage sensor", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await enter(page);
  const art = page.locator(".home-art");
  await expect(art).toHaveAttribute("data-home-sensor", "listening");
  await emit(page, 35, 10);
  await expect(art).toHaveAttribute("data-home-motion", "active");
  await page.getByRole("button", { name: "Menu utilisateur", exact: true }).click();
  await expect(art).not.toHaveAttribute("data-home-sensor", "listening");
  await expect(art).not.toHaveAttribute("data-home-motion", "active");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(art).toHaveAttribute("data-home-sensor", "listening");
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Se connecter" })).toBeVisible();
  await expect(art).not.toHaveAttribute("data-home-sensor", "listening");
  await expect(art).not.toHaveAttribute("data-home-motion", "active");
});
test("V0.9.2 offline page and manifest retain individual-tool identity", async ({ page }) => {
  const response = await page.request.get("/manifest.webmanifest");
  const manifest = await response.json();
  expect(manifest.theme_color).toBe("#080b18");
  expect(manifest.start_url).toBe("/");
  expect(manifest.display).toBe("standalone");
  await page.goto("/offline.html");
  await expect(page.getByRole("heading", { name: "Retrouvons la connexion." })).toBeVisible();
  await expect(page.getByRole("link", { name: "Réessayer" })).toHaveAttribute("href", "/");
  await expect(page.locator("body")).toContainText("Aucune adresse ni donnée privée");
  await page.screenshot({ path: "test-results/premium-v092/offline.png" });
});
