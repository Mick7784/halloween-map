import { expect, test, type Page } from "@playwright/test";

const fixture = {
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
    opens_at: "2026-10-31T17:00:00Z",
    closes_at: "2026-10-31T23:00:00Z",
    registrations_open: true,
  },
  nextOpening: "2026-10-31T17:00:00Z",
  contents: {},
  houses: [],
  routeCandidates: [],
  demoAvailable: false,
  documents: {},
  projectLinks: {},
};

async function enter(page: Page) {
  await page.clock.install({ time: new Date(fixture.serverTime) });
  await page.route("**/api/public*", (route) =>
    route.fulfill({ json: fixture }),
  );
  await page.route("**/api/me", (route) => route.fulfill({ json: null }));
  await page.goto("/");
  await expect(page.locator(".home-v09 .home-art")).toBeVisible();
}

async function emit(page: Page, beta: number | null, gamma: number | null) {
  await page.evaluate(({ beta, gamma }) => {
    const reading = new Event("deviceorientation");
    Object.defineProperty(reading, "beta", { value: beta });
    Object.defineProperty(reading, "gamma", { value: gamma });
    window.dispatchEvent(reading);
  }, { beta, gamma });
}

test("V0.9.1 static fallback never depends on sensor permissions or overlays", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await enter(page);
  const art = page.locator(".home-art");
  await expect(art).not.toHaveAttribute("data-home-motion", "active");
  await expect(art).toHaveCSS("background-size", "cover");
  await expect(art).toHaveCSS("background-image", /halloween-village-v2\.png/);
  await expect(page.locator(".home-art-plane")).toHaveCount(3);
  await expect(page.locator(".home-art-plane--near")).toBeHidden();
  await expect(page.locator(".home-header button")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Se connecter" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Créer un compte" })).toBeVisible();
  await expect(page.getByRole("button", { name: /activer.*effet|boussole/i })).toHaveCount(0);
});

test("V0.9.1 portrait mobile tilts only artwork, smoothly and within bounds", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await enter(page);
  const art = page.locator(".home-art");

  // Invalid sensor values may never activate the motion mode.
  await emit(page, null, null);
  await emit(page, Number.NaN, 20);
  await expect(art).not.toHaveAttribute("data-home-motion", "active");

  // First valid sample anchors handheld posture; second one moves scenery.
  await emit(page, 35, 10);
  await expect(art).toHaveAttribute("data-home-motion", "active");
  await emit(page, 55, 40);
  await page.clock.runFor(420);

  const offsets = await art.evaluate((node) => {
    const far = parseFloat(node.style.getPropertyValue("--depth-far-x"));
    const mid = parseFloat(node.style.getPropertyValue("--depth-mid-x"));
    const near = parseFloat(node.style.getPropertyValue("--depth-near-x"));
    return { far, mid, near };
  });
  expect(offsets.far).toBeGreaterThan(0.5);
  expect(offsets.far).toBeLessThanOrEqual(2.4);
  expect(offsets.mid).toBeGreaterThan(offsets.far);
  expect(offsets.near).toBeGreaterThan(offsets.mid);
  expect(offsets.near).toBeLessThanOrEqual(8);

  // An excessive angular reading must not push beyond the maximum.
  await emit(page, 150, 180);
  await page.clock.runFor(420);
  const max = await art.evaluate((node) =>
    parseFloat(node.style.getPropertyValue("--depth-near-x")),
  );
  expect(max).toBeLessThanOrEqual(8);

  // Resizing a formerly moving mobile to desktop removes every offset
  // and unregisters the sensor listener. Returning to portrait can re-arm.
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(art).not.toHaveAttribute("data-home-motion", "active");
  await expect(art).toHaveCSS("--depth-near-x", "0.00px");
  await emit(page, 50, 60);
  await emit(page, 80, 90);
  await page.clock.runFor(100);
  await expect(art).not.toHaveAttribute("data-home-motion", "active");
  await page.setViewportSize({ width: 390, height: 844 });
  await emit(page, 35, 10);
  await expect(art).toHaveAttribute("data-home-motion", "active");
  await emit(page, 40, 20);
  await page.clock.runFor(200);

  // Changing to reduced motion immediately removes the effect.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(art).not.toHaveAttribute("data-home-motion", "active");
  await expect(art).toHaveCSS("--depth-near-x", "0.00px");
  await expect(page.locator(".home-art-plane--near")).toBeHidden();
});

test("V0.9.1 desktop and mobile landscape always remain still", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await enter(page);
  await emit(page, 30, 20);
  await emit(page, 70, 90);
  await page.clock.runFor(150);
  await expect(page.locator(".home-art")).not.toHaveAttribute("data-home-motion", "active");
  await expect(page.locator(".home-art-plane--far")).toBeHidden();

  await page.setViewportSize({ width: 844, height: 390 });
  await emit(page, 40, 20);
  await emit(page, 70, 90);
  await page.clock.runFor(150);
  await expect(page.locator(".home-art")).not.toHaveAttribute("data-home-motion", "active");
  await expect(page.locator(".home-art-plane--mid")).toBeHidden();
});
