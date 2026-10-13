import { test, expect, type Page } from "@playwright/test";

const opening = "2026-10-31T17:00:00Z";
const guestState = {
  setupRequired: false,
  state: "COUNTDOWN",
  count: 12,
  publicMapOpen: false,
  mapAccessible: false,
  serverTime: "2026-10-18T20:32:24Z",
  instance: {
    public_name: "Halloween",
    territory: "Villiers-sur-Morin",
    timezone: "Europe/Paris",
    latitude: 48.8,
    longitude: 2.8,
    zoom: 14,
  },
  season: {
    opens_at: opening,
    closes_at: "2026-10-31T23:00:00Z",
    registrations_open: true,
  },
  nextOpening: opening,
  contents: {},
  houses: [],
  routeCandidates: [],
  demoAvailable: false,
  documents: {},
  projectLinks: {},
};
async function enter(page: Page, partial: Record<string, unknown> = {}) {
  await page.clock.install({ time: new Date("2026-10-18T20:32:24Z") });
  await page.route("**/api/public*", (route) =>
    route.fulfill({ json: { ...guestState, ...partial } }),
  );
  await page.route("**/api/me", (route) => route.fulfill({ json: null }));
  await page.goto("/");
  await expect(page.locator(".home-v09")).toBeVisible();
}

for (const size of [
  { width: 360, height: 640 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
  { width: 1440, height: 900 },
  { width: 2048, height: 1042 },
]) {
  test("V0.9 faithful layout and informative features " + size.width, async ({ page }) => {
    await page.setViewportSize(size);
    await enter(page);
    await page.evaluate(() => document.fonts.ready);
    const header = page.locator(".home-header");
    await expect(header.getByRole("button", { name: "Menu utilisateur" })).toHaveCount(1);
    await expect(header.locator("button")).toHaveCount(1);
    await expect(header.locator("a")).toHaveCount(1);
    await expect(page.locator(".home-art")).toHaveCSS("background-size", "cover");
    await expect(page.locator(".home-art")).toHaveCSS("background-image", /halloween-village-v2\.png/);
    await expect(page.locator(".home-center h1")).toHaveText("Halloween Map");
    await expect(page.locator(".home-clock > div")).toHaveCount(4);
    const clockTops = await page.locator(".home-clock > div").evaluateAll((els) =>
      els.map((e) => Math.round(e.getBoundingClientRect().top)),
    );
    expect(new Set(clockTops).size).toBe(1);
    await expect(page.locator(".home-feature")).toHaveCount(3);
    await expect(page.locator(".home-feature a, .home-feature button")).toHaveCount(0);
    await expect(page.locator(".home-feature")).toContainText([
      "Consultez les maisons",
      "Découvrez les décorations",
      "Gérez votre collecte",
    ]);
    await expect(page.getByRole("button", { name: "Se connecter", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Créer un compte", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: /Une création de DomotiK Studio/ })).toBeVisible();
    await expect(page.locator(".home-credit img")).toHaveAttribute("src", "/art/dk-footer-v09.webp");
    await expect(page.getByRole("contentinfo").getByRole("link", { name: "Mentions légales" })).toBeVisible();
    await expect(page.locator(".home-v09")).not.toContainText(/rassemblement organisé|itinéraire imposé|soirée organisée/i);
    const pageSize = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      scrollHeight: document.documentElement.scrollHeight,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    }));
    expect(pageSize.scrollWidth).toBeLessThanOrEqual(pageSize.viewportWidth);
    if (size.width < 760) {
      expect(pageSize.scrollHeight).toBeLessThanOrEqual(pageSize.viewportHeight + 1);
      const stageOverrun = await page.locator(".home-stage").evaluate((el) =>
        el.scrollHeight - el.clientHeight,
      );
      expect(stageOverrun).toBeLessThanOrEqual(2);
    }
    await page.screenshot({
      animations: "disabled",
      path: "test-results/home-v090-" + size.width + ".png",
    });
  });
}

test("V0.9 first access asks for account; login reuses existing form and returns focus", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await enter(page);
  await expect(page.locator(".home-login")).toHaveCount(0);
  const trigger = page.getByRole("button", { name: "Se connecter", exact: true });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Se connecter" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Email")).toBeVisible();
  await expect(dialog.getByLabel("Mot de passe")).toBeVisible();
  await expect(dialog.getByRole("link", { name: "Mot de passe oublié ?" })).toHaveAttribute("href", "/forgot-password");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(page.getByRole("link", { name: "Créer un compte", exact: true })).toHaveAttribute("href", "/register");
});

test("V0.9 no season, closed and historic TEST never invent a fictitious opening", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await enter(page, { season: null, nextOpening: null, state: "PREPARATION" });
  await expect(page.locator(".home-clock")).toHaveCount(0);
  await expect(page.locator(".home-state-card")).toContainText("La prochaine carte se prépare");
  await page.unroute("**/api/public*");
  await page.route("**/api/public*", (r) => r.fulfill({ json: {
    ...guestState,
    state: "CLOSED",
    season: { ...guestState.season, closes_at: "2026-10-17T17:00:00Z" },
  } }));
  await page.reload();
  await expect(page.locator(".home-state-card")).toContainText("La saison est terminée");
  await expect(page.locator(".home-clock")).toHaveCount(0);
  await page.unroute("**/api/public*");
  await page.route("**/api/public*", (r) => r.fulfill({ json: {
    ...guestState,
    state: "MAP_OPEN",
    nextOpening: null,
    season: { ...guestState.season, is_test: true, opens_at: "2000-01-01T00:00:00Z", closes_at: "2201-01-01T00:00:00Z" },
  } }));
  await page.reload();
  await expect(page.locator(".home-preview-label")).toHaveText("Prévisualisation TEST");
  await expect(page.locator(".home-clock")).toHaveCount(0);
});
