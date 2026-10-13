import { test, expect, type Page } from "@playwright/test";
import { realSeasonFixture } from "./fixtures/real-season";
test.use({ hasTouch: true });
const choiceKey = "halloween-map:orientation-choice:v1";
const now = Date.now();
const season = realSeasonFixture({ now });
async function enter(page: Page, permission: "none" | "granted" | "denied" | "throws" | "pending" | "unsupported" = "none", desktop = false) {
  await page.setViewportSize(desktop ? { width: 1440, height: 900 } : { width: 390, height: 844 });
  await page.clock.install({ time: new Date(now) });
  await page.addInitScript(({ permission }) => {
    Object.defineProperty(navigator, "geolocation", { configurable: true, value: {
      getCurrentPosition: (ok: PositionCallback) => ok({ timestamp: Date.now(), coords: { latitude: 48.1, longitude: -1.67, accuracy: 12 } } as GeolocationPosition),
    } });
    const target = window as typeof window & {
      __orientationCalls: number; __orientationListeners: Set<EventListenerOrEventListenerObject>;
      __resolveOrientation?: (value: string) => void;
    };
    target.__orientationCalls = 0;
    target.__orientationListeners = new Set();
    const sensorWrappers = new Map<EventListenerOrEventListenerObject, EventListener>();
    const add = window.addEventListener.bind(window), remove = window.removeEventListener.bind(window);
    window.addEventListener = ((type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions) => {
      if (type === "deviceorientation") {
        target.__orientationListeners.add(listener);
        // Isolate the fixture stream from Chromium's native "sensor unavailable"
        // event. Invalid readings are injected explicitly in their own test.
        const wrapper: EventListener = (event) => {
          if (!event.isTrusted) {
            if (typeof listener === "function") listener.call(window, event);
            else listener.handleEvent(event);
          }
        };
        sensorWrappers.set(listener, wrapper);
        add(type, wrapper, options);
      } else add(type, listener, options);
    }) as typeof window.addEventListener;
    window.removeEventListener = ((type: string, listener: EventListenerOrEventListenerObject, options?: boolean | EventListenerOptions) => {
      if (type === "deviceorientation") {
        target.__orientationListeners.delete(listener);
        const wrapper = sensorWrappers.get(listener);
        if (wrapper) { remove(type, wrapper, options); sensorWrappers.delete(listener); }
      } else remove(type, listener, options);
    }) as typeof window.removeEventListener;
    class Sensor extends Event {}
    if (permission !== "none" && permission !== "unsupported") Object.defineProperty(Sensor, "requestPermission", { value: () => {
      target.__orientationCalls++;
      if (permission === "throws") return Promise.reject(new Error("Unavailable"));
      if (permission === "pending") return new Promise<string>((resolve) => { target.__resolveOrientation = resolve; });
      return Promise.resolve(permission);
    } });
    Object.defineProperty(window, "DeviceOrientationEvent", { configurable: true, value: permission === "unsupported" ? undefined : Sensor });
  }, { permission, desktop });
  await page.route("**/api/**", (route) => route.fulfill({ json: { ok: true } }));
  await page.route("**/api/me", (route) => route.fulfill({ json: {
    id: "orientation-user", instance_id: season.instance_id, role_name: "USER", permissions: [],
    account_status: "ACTIVE", email_status: "VERIFIED", display_name: "Camille", email: "camille@example.invalid",
  } }));
  await page.route("**/api/public*", (route) => route.fulfill({ json: {
    setupRequired: false, state: "OPEN", mapAccessible: true, publicMapOpen: true, collectionAccessible: true,
    serverTime: new Date(now).toISOString(), season, houses: [], routeCandidates: [], contents: {}, documents: {},
    instance: { id: season.instance_id, active_season_id: season.id, public_name: "Halloween Map", territory: "Saint-Martin", timezone: "Europe/Paris", latitude: 48.1, longitude: -1.67, zoom: 14 },
  } }));
  await page.route("https://basemaps.cartocdn.com/**", (route) => route.fulfill({ json: {
    version: 8, sources: { shape: { type: "geojson", data: { type: "Feature", properties: {}, geometry: {
      type: "LineString", coordinates: [[-1.674,48.098],[-1.673,48.104],[-1.666,48.103]],
    } } } }, layers: [{ id: "night", type: "background", paint: { "background-color": "#151820" } },
      { id: "shape", type: "line", source: "shape", paint: { "line-color": "#ff9d45", "line-width": 4 } }],
  } }));
  await page.goto("/map");
  await expect(page.locator(".maplibregl-canvas")).toBeVisible();
  await page.getByRole("button", { name: "Me localiser", exact: true }).click();
  await expect(page.getByRole("img", { name: "Position GPS actuelle", exact: true })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}
async function emit(page: Page, overrides: Record<string, number | boolean | null | undefined> = {}, count = 3) {
  await page.evaluate(({ overrides, count }) => {
    for (let i = 0; i < count; i++) {
      const event = new Event("deviceorientation");
      const values = { alpha: 270, absolute: false, beta: 20, gamma: 0, webkitCompassHeading: 90, webkitCompassAccuracy: 8, ...overrides };
      for (const [key, value] of Object.entries(values)) Object.defineProperty(event, key, { value });
      window.dispatchEvent(event);
    }
  }, { overrides, count });
  await page.clock.runFor(110);
}
const arrow = (page: Page) => page.locator(".current-position-direction");
const listenerCount = (page: Page) => page.evaluate(() => (window as typeof window & { __orientationListeners: Set<unknown> }).__orientationListeners.size);
const calls = (page: Page) => page.evaluate(() => (window as typeof window & { __orientationCalls: number }).__orientationCalls);
test("calibrated magnetic cone needs three readings and never moves or rotates the map", async ({ page }) => {
  await enter(page);
  await expect.poll(() => listenerCount(page)).toBe(1);
  await page.clock.runFor(700);
  const screenshot = { animations: "disabled" as const,
    style: ".current-position-marker,.map-orientation-offer,.map-orientation-note{visibility:hidden!important}" };
  const before = await page.locator(".maplibregl-canvas").screenshot(screenshot);
  await emit(page, {}, 2);
  await expect(arrow(page)).toBeHidden();
  await emit(page, {}, 1);
  await expect(arrow(page)).toBeVisible();
  await expect(page.locator(".current-position-marker")).toHaveAttribute("data-orientation", "magnetic");
  await expect(arrow(page)).toHaveCSS("transition-duration", "0s");
  // An element screenshot also contains overlaid DOM markers; hide the marker
  // only while capturing, so the comparison verifies the map's camera itself.
  expect(await page.locator(".maplibregl-canvas").screenshot(screenshot)).toEqual(before);
  expect(await calls(page)).toBe(0);
  await page.screenshot({ path: "test-results/orientation-v093/calibrated-mobile.png" });
});
test("relative gyro, uncalibrated compass, vertical posture and stale samples retain the GPS dot", async ({ page }) => {
  await enter(page);
  await expect.poll(() => listenerCount(page)).toBe(1);
  for (const overrides of [{ webkitCompassHeading: null }, { webkitCompassAccuracy: -1 }, { webkitCompassAccuracy: 40 }, { beta: 90 }]) {
    await emit(page, overrides);
    await expect(arrow(page)).toBeHidden();
  }
  await emit(page);
  await expect(arrow(page)).toBeVisible();
  await page.clock.runFor(2600);
  await expect(arrow(page)).toBeHidden();
  await expect(page.getByRole("img", { name: "Position GPS actuelle", exact: true })).toBeVisible();
});
test("permission explanation is voluntary, refusal is persistent and never invokes the browser prompt", async ({ page }) => {
  await enter(page, "granted");
  expect(await calls(page)).toBe(0);
  const offer = await page.getByRole("button", { name: "Afficher l’orientation", exact: true }).boundingBox();
  const prepare = await page.getByRole("button", { name: "Préparer ma collecte", exact: true }).boundingBox();
  expect(offer!.y + offer!.height).toBeLessThanOrEqual(prepare!.y);
  await page.screenshot({ path: "test-results/orientation-v093/offer-mobile.png" });
  await page.getByRole("button", { name: "Afficher l’orientation", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Orientation du téléphone" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("La carte reste fixe");
  await page.screenshot({ path: "test-results/orientation-v093/permission-mobile.png" });
  await page.getByRole("button", { name: "Conserver le marqueur GPS", exact: true }).click();
  expect(await calls(page)).toBe(0);
  await page.reload();
  await page.getByRole("button", { name: "Me localiser", exact: true }).click();
  await expect(page.locator(".current-position-marker")).toBeVisible();
  await expect(page.getByRole("button", { name: "Afficher l’orientation" })).toHaveCount(0);
  expect(await listenerCount(page)).toBe(0);
  expect(await page.evaluate((key) => localStorage.getItem(key), choiceKey)).toBe("declined");
});
test("consent invokes permission once; subsequent visits only listen passively", async ({ page }) => {
  await enter(page, "granted");
  await page.getByRole("button", { name: "Afficher l’orientation" }).click();
  await page.getByRole("button", { name: "Autoriser les capteurs" }).click();
  await expect(page.getByRole("dialog", { name: "Orientation du téléphone" })).toHaveCount(0);
  expect(await calls(page)).toBe(1);
  await expect.poll(() => listenerCount(page)).toBe(1);
  await emit(page);
  await expect(arrow(page)).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Me localiser", exact: true }).click();
  await expect.poll(() => listenerCount(page)).toBe(1);
  await emit(page);
  await expect(arrow(page)).toBeVisible();
  expect(await calls(page)).toBe(0);
});
for (const result of ["denied", "throws"] as const) test(`browser permission ${result} keeps GPS and records refusal`, async ({ page }) => {
  await enter(page, result);
  await page.getByRole("button", { name: "Afficher l’orientation" }).click();
  await page.getByRole("button", { name: "Autoriser les capteurs" }).click();
  await expect(page.getByRole("dialog", { name: "Orientation du téléphone" })).toHaveCount(0);
  await emit(page);
  await expect(arrow(page)).toBeHidden();
  await expect(page.locator(".current-position-marker")).toBeVisible();
  expect(await calls(page)).toBe(1);
  expect(await page.evaluate((key) => localStorage.getItem(key), choiceKey)).toBe("declined");
});
test("closing a pending request wins over a late granted response", async ({ page }) => {
  await enter(page, "pending");
  await page.getByRole("button", { name: "Afficher l’orientation" }).click();
  await page.getByRole("button", { name: "Autoriser les capteurs" }).click();
  await expect(page.getByRole("button", { name: "Demande en cours…" })).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Orientation du téléphone" })).toHaveCount(0);
  await page.evaluate(() => (window as typeof window & { __resolveOrientation: (value: string) => void }).__resolveOrientation("granted"));
  await emit(page);
  await expect(arrow(page)).toBeHidden();
  expect(await calls(page)).toBe(1);
  expect(await page.evaluate((key) => localStorage.getItem(key), choiceKey)).toBe("declined");
});
test("landscape, hidden page and account overlay detach; each resume needs fresh samples", async ({ page }) => {
  await enter(page);
  await expect.poll(() => listenerCount(page)).toBe(1);
  await emit(page);
  await expect(arrow(page)).toBeVisible();
  await page.setViewportSize({ width: 844, height: 390 });
  await expect.poll(() => listenerCount(page)).toBe(0);
  await expect(arrow(page)).toBeHidden();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => listenerCount(page)).toBe(1);
  await emit(page);
  await expect(arrow(page)).toBeVisible();
  await page.evaluate(() => { Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" }); document.dispatchEvent(new Event("visibilitychange")); });
  await expect.poll(() => listenerCount(page)).toBe(0);
  await expect(arrow(page)).toBeHidden();
  await page.evaluate(() => { Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" }); document.dispatchEvent(new Event("visibilitychange")); });
  await expect.poll(() => listenerCount(page)).toBe(1);
  await page.getByRole("button", { name: "Menu utilisateur", exact: true }).click();
  await expect.poll(() => listenerCount(page)).toBe(0);
  await page.keyboard.press("Escape");
  await expect.poll(() => listenerCount(page)).toBe(1);
  await expect(arrow(page)).toBeHidden();
  await emit(page);
  await expect(arrow(page)).toBeVisible();
});
for (const desktop of [false, true]) test(`unsupported device or desktop remains static ${desktop}`, async ({ page }) => {
  await enter(page, desktop ? "granted" : "unsupported", desktop);
  await emit(page);
  await expect(arrow(page)).toBeHidden();
  await expect(page.getByRole("button", { name: "Afficher l’orientation" })).toHaveCount(0);
  expect(await calls(page)).toBe(0);
  expect(await listenerCount(page)).toBe(0);
  await page.screenshot({ path: `test-results/orientation-v093/static-${desktop ? "desktop" : "mobile"}.png` });
});
test("reduced-motion retains informative readings without animated transitions, and GPS expiry removes them", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await enter(page);
  await expect.poll(() => listenerCount(page)).toBe(1);
  await emit(page);
  await expect(arrow(page)).toBeVisible();
  await expect(arrow(page)).toHaveCSS("transition-duration", "0s");
  await page.clock.runFor(16000);
  await expect(arrow(page)).toBeHidden();
  expect(await listenerCount(page)).toBe(0);
});
