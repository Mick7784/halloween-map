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

async function passiveSensor(page: Page, exposesPermissionApi = false) {
  // Model a browser that delivers readings without a permission API.
  // Recent Chromium versions expose requestPermission too; their native
  // constructor must not decide which capability this scenario exercises.
  await page.addInitScript((exposesPermissionApi) => {
    Object.defineProperty(window, "DeviceOrientationEvent", {
      configurable: true,
      value: exposesPermissionApi ? Object.assign(class extends Event {}, {
        requestPermission() { throw new Error("Decorative sensor permission requested"); },
      }) : class extends Event {},
    });
  }, exposesPermissionApi);
}

test("V0.9.1 static fallback never depends on sensor permissions or overlays", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await enter(page);
  const art = page.locator(".home-art");
  await expect(art).not.toHaveAttribute("data-home-motion", "active");
  await expect(art).toHaveCSS("background-size", "cover");
  await expect(art).toHaveCSS("background-image", /home-v091-shared\.webp/);
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
  await passiveSensor(page);
  await enter(page);
  const art = page.locator(".home-art");
  await expect(art).toHaveAttribute("data-home-sensor", "listening");

  // Invalid sensor values may never activate the motion mode.
  await emit(page, null, null);
  await emit(page, Number.NaN, 20);
  await expect(art).not.toHaveAttribute("data-home-motion", "active");

  // First valid sample anchors handheld posture; second one moves scenery.
  await emit(page, 35, 10);
  await expect(art).toHaveAttribute("data-home-motion", "active");
  await expect(page.locator(".home-art-plane--near")).toBeVisible();
  await expect(page.locator(".home-art-plane--near")).toHaveCSS("background-image", /home-v091-near\.webp/);
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
  await expect(page.locator(".home-art-plane--near")).not.toHaveCSS("transform", "none");
  await page.screenshot({ animations: "disabled", path: "test-results/home-v091-tilt-390.png" });

  // Resizing a formerly moving mobile to desktop removes every offset
  // and unregisters the sensor listener. Returning to portrait can re-arm.
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(art).not.toHaveAttribute("data-home-motion", "active");
  await expect(art).not.toHaveAttribute("data-home-sensor", "listening");
  await expect(art).toHaveCSS("--depth-near-x", "0.00px");
  await emit(page, 50, 60);
  await emit(page, 80, 90);
  await page.clock.runFor(100);
  await expect(art).not.toHaveAttribute("data-home-motion", "active");
  await page.setViewportSize({ width: 390, height: 844 });
  // Browser media-query notifications arrive asynchronously after resize.
  // Wait for the actual subscription before dispatching a one-off reading.
  await expect(art).toHaveAttribute("data-home-sensor", "listening");
  await emit(page, 35, 10);
  await expect(art).toHaveAttribute("data-home-motion", "active");
  await emit(page, 40, 20);
  await page.clock.runFor(200);

  // Changing to reduced motion immediately removes the effect.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(art).not.toHaveAttribute("data-home-motion", "active");
  await expect(art).not.toHaveAttribute("data-home-sensor", "listening");
  await expect(art).toHaveCSS("--depth-near-x", "0.00px");
  await expect(page.locator(".home-art-plane--near")).toBeHidden();
});


test("V0.9.7 mobile artwork filters sensor noise and returns smoothly to neutral", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await passiveSensor(page);
  await enter(page);
  const art = page.locator(".home-art");
  await emit(page, 35, 10);
  await expect(art).toHaveAttribute("data-home-motion", "active");
  // Repeated measurements settle on the same handheld tilt.
  for (let i = 0; i < 12; i++) await emit(page, 55, 40);
  await page.clock.runFor(500);
  const settled = await art.evaluate((node) =>
    parseFloat(node.style.getPropertyValue("--depth-near-x")),
  );
  expect(settled).toBeGreaterThan(3);
  expect(settled).toBeLessThanOrEqual(8);

  // A tiny noisy heading change should not make the scene jump.
  await emit(page, 55, 40.2);
  await page.clock.runFor(120);
  const jitter = await art.evaluate((node) =>
    parseFloat(node.style.getPropertyValue("--depth-near-x")),
  );
  expect(Math.abs(jitter - settled)).toBeLessThan(0.5);

  // When readings stop, the artwork eases to rest without moving any UI.
  await page.clock.runFor(2000);
  const neutral = await art.evaluate((node) =>
    parseFloat(node.style.getPropertyValue("--depth-near-x")),
  );
  expect(Math.abs(neutral)).toBeLessThan(0.2);
  await expect(page.getByRole("button", { name: "Se connecter", exact: true })).toBeVisible();
});

test("V0.9.1 desktop and mobile landscape always remain still", async ({ page }) => {
  await passiveSensor(page);
  const depthRequests: string[] = [];
  page.on("request", (request) => {
    if (/home-v091-(far|mid|near)\.webp/.test(request.url())) depthRequests.push(request.url());
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await enter(page);
  await emit(page, 30, 20);
  await emit(page, 70, 90);
  await page.clock.runFor(150);
  await expect(page.locator(".home-art")).not.toHaveAttribute("data-home-motion", "active");
  await expect(page.locator(".home-art-plane--far")).toBeHidden();
  await expect(page.locator(".home-art")).not.toHaveAttribute("data-home-sensor", "listening");

  await page.setViewportSize({ width: 844, height: 390 });
  await emit(page, 40, 20);
  await emit(page, 70, 90);
  await page.clock.runFor(150);
  await expect(page.locator(".home-art")).not.toHaveAttribute("data-home-motion", "active");
  await expect(page.locator(".home-art-plane--mid")).toBeHidden();
  await expect(page.locator(".home-art")).not.toHaveAttribute("data-home-sensor", "listening");
  expect(depthRequests).toEqual([]);
});

test("V0.9.1 unavailable optional plane keeps the master static", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await passiveSensor(page);
  await page.route("**/art/home-v091-mid.webp", (route) => route.abort());
  await enter(page);
  await expect(page.locator(".home-art")).toHaveAttribute("data-home-sensor", "listening");
  await emit(page, 35, 10);
  await emit(page, 55, 40);
  await page.clock.runFor(420);
  await expect(page.locator(".home-art")).not.toHaveAttribute("data-home-motion", "active");
  await expect(page.locator(".home-art-plane--near")).toBeHidden();
  await expect(page.getByRole("button", { name: "Se connecter", exact: true })).toBeVisible();
});

for (const mode of ["missing", "permission-required"] as const) {
  test(`V0.9.1 ${mode} sensor stays static without asking permission`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript((mode) => {
      Object.defineProperty(window, "DeviceOrientationEvent", {
        configurable: true,
        value: mode === "missing" ? undefined : Object.assign(class {}, {
          requestPermission() { throw new Error("Decorative sensor permission requested"); },
        }),
      });
    }, mode);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await enter(page);
    // A permission-gated browser withholds usable readings. Merely
    // exposing requestPermission must never trigger a call or prompt.
    await emit(page, mode === "missing" ? 35 : null, mode === "missing" ? 10 : null);
    await emit(page, mode === "missing" ? 55 : Number.NaN, 40);
    await page.clock.runFor(420);
    await expect(page.locator(".home-art")).not.toHaveAttribute("data-home-motion", "active");
    if (mode === "missing") {
      await expect(page.locator(".home-art")).not.toHaveAttribute("data-home-sensor", "listening");
    }
    await expect(page.locator(".home-art-plane--near")).toBeHidden();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}

test("V0.9.1 already available readings work without invoking an exposed permission API", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await passiveSensor(page, true);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await enter(page);
  const art = page.locator(".home-art");
  await expect(art).toHaveAttribute("data-home-sensor", "listening");
  await emit(page, 35, 10);
  await expect(art).toHaveAttribute("data-home-motion", "active");
  await emit(page, 55, 40);
  await page.clock.runFor(420);
  const near = await art.evaluate((node) => parseFloat(node.style.getPropertyValue("--depth-near-x")));
  expect(near).toBeGreaterThan(0.5);
  expect(near).toBeLessThanOrEqual(8);
  await expect(page.locator(".home-art-plane--near")).not.toHaveCSS("transform", "none");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("V0.9.1 hidden page resets tilt and resumes from a fresh baseline", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await passiveSensor(page);
  await enter(page);
  const art = page.locator(".home-art");
  await expect(art).toHaveAttribute("data-home-sensor", "listening");
  const title = page.locator(".home-center h1");
  const originalTitle = await title.boundingBox();
  await emit(page, 35, 10);
  await emit(page, 55, 40);
  await page.clock.runFor(420);
  await expect(art).toHaveAttribute("data-home-motion", "active");
  expect(await title.boundingBox()).toEqual(originalTitle);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(art).not.toHaveAttribute("data-home-motion", "active");
  await expect(art).not.toHaveAttribute("data-home-sensor", "listening");
  await expect(art).toHaveCSS("--depth-near-x", "0.00px");
  await emit(page, 80, 80);
  await page.clock.runFor(420);
  await expect(art).not.toHaveAttribute("data-home-motion", "active");
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(art).toHaveAttribute("data-home-sensor", "listening");
  await emit(page, 80, 80);
  await expect(art).toHaveAttribute("data-home-motion", "active");
  await expect(art).toHaveCSS("--depth-near-x", "0.00px");
  expect(await title.boundingBox()).toEqual(originalTitle);
});
