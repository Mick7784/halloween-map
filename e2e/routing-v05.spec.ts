import { test, expect, type Page } from "@playwright/test";
const houses = [0, 1].map((n) => ({
  id: `10000000-0000-4000-8000-00000000000${n}`,
  name: `Les lanternes ${n + 1}`,
  address: `${n + 1} rue des Lanternes`,
  latitude: 48.1 + n * 0.002,
  longitude: -1.67 + n * 0.002,
  activities: ["CANDY"],
  starts_at: new Date(Date.now() - 3600000).toISOString(),
  ends_at: new Date(Date.now() + 14400000).toISOString(),
  fear: n === 0 ? null : 2,
  adaptable: n === 0,
  rp: "Un jardin de lanternes",
  practical: "Entrée par le portail",
}));
const state = {
  state: "MAP_OPEN",
  instance: {
    id: "20000000-0000-4000-8000-000000000001",
    public_name: "Halloween",
    territory: "Saint-Martin",
    timezone: "Europe/Paris",
    latitude: 48.1,
    longitude: -1.67,
    zoom: 14,
  },
  season: {
    id: "30000000-0000-4000-8000-000000000001",
    opens_at: new Date(Date.now() - 7200000).toISOString(),
    closes_at: new Date(Date.now() + 18000000).toISOString(),
    registrations_open: true,
  },
  houses,
  documents: {
    GUIDELINES: {
      version: "2026.1",
      title: "Bonnes pratiques",
      body: "Respecter les horaires.",
    },
  },
  routeCandidates: houses,
  contents: {
    "home.open": "Les maisons vous attendent",
    "home.subtitle": "À pied, de maison en maison",
  },
};
async function arrange(page: Page) {
  await page.route("**/api/me", (r) =>
    r.fulfill({
      json: {
        id: "visitor",
        display_name: "Visiteur",
        permissions: [],
        role_name: "USER",
        email_status: "VERIFIED",
      },
    }),
  );
  await page.route("**/api/public*", (r) => r.fulfill({ json: state }));
  await page.route("https://basemaps.cartocdn.com/**", (r) =>
    r.fulfill({
      json: {
        version: 8,
        sources: {},
        layers: [
          {
            id: "night",
            type: "background",
            paint: { "background-color": "#151820" },
          },
        ],
      },
    }),
  );
  await page.route("**/api/route/availability*", (r) =>
    r.fulfill({
      json: {
        valid: true,
        checkedAt: new Date().toISOString(),
        steps: houses.map((h) => ({
          id: h.id,
          available: true,
          activities: h.activities,
        })),
      },
    }),
  );
  await page.route("**/api/route*", (r) => {
    if (r.request().url().includes("/availability"))
      return r.fulfill({
        json: {
          valid: true,
          checkedAt: new Date().toISOString(),
          steps: houses.map((h) => ({
            id: h.id,
            available: true,
            activities: h.activities,
          })),
        },
      });
    const input = r.request().postDataJSON(),
      start = +new Date(input.start);
    return r.fulfill({
      json: {
        stops: houses
          .filter((h) => !(input.excludedHouseIds ?? []).includes(h.id))
          .map((house, n) => ({
            house,
            arrival: new Date(start + (n * 420 + 120) * 1000).toISOString(),
            departure: new Date(start + (n + 1) * 420000).toISOString(),
            walkingMinutes: 2,
            walkingSeconds: 120,
            distanceMeters: 140,
          })),
        distanceMeters: 280,
        walkingMinutes: 4,
        walkingSeconds: 240,
        durationMinutes: 14,
        estimatedEnd: new Date(start + 840000).toISOString(),
        geometry: [
          [input.origin.longitude, input.origin.latitude],
          [-1.674, 48.102],
          [-1.67, 48.1],
          [-1.669, 48.103],
          [-1.668, 48.102],
        ],
        disclaimer:
          "Parcours à pied · openrouteservice / © OpenStreetMap contributors.",
      },
    });
  });
  await page.goto("/map");
  await expect(page.locator(".house-marker")).toHaveCount(2);
}
async function generate(page: Page) {
  if (
    !(await page
      .getByRole("dialog", { name: "Préparer mon parcours" })
      .isVisible())
  )
    await page
      .getByRole("button", { name: "Préparer mon parcours", exact: true })
      .click();
  await page.getByRole("button", { name: "Me localiser", exact: true }).click();
  await page.getByRole("checkbox", { name: "J’ai pris connaissance" }).check();
  await page
    .getByRole("button", { name: "Créer mon parcours", exact: true })
    .click();
  await expect(page.locator(".route-experience")).toHaveAttribute(
    "data-route-phase",
    "active",
  );
  await expect(page.locator(".route-sheet")).toBeVisible();
  await expect(page.locator(".route-marker-number")).toHaveCount(2);
  await expectRouteBadges(page);
}
async function expectRouteBadges(page: Page) {
  for (const visual of await page
    .locator(".route-house .house-marker-visual")
    .all()) {
    await expect
      .poll(() =>
        visual.evaluate((el) => {
          if (!(el instanceof HTMLElement)) return false;
          const badge = el.querySelector(".route-marker-number")!;
          const r = el.getBoundingClientRect(),
            b = badge.getBoundingClientRect();
          return (
            // Hover scales the visual and its badge together; compare screen
            // distances to the scaled 7px offsets, not unscaled CSS pixels.
            Math.abs(b.top - r.top + 7 * (r.height / el.offsetHeight)) < 1 &&
            Math.abs(b.right - r.right - 7 * (r.width / el.offsetWidth)) < 1
          );
        }),
      )
      .toBe(true);
  }
}
test("new house starts blank and requires explicit coordinate confirmation", async ({
  page,
}) => {
  await page.route("**/api/house", (r) => r.fulfill({ json: null }));
  await arrange(page);
  await page.goto("/participant");
  await page.route("**/api/location*", (r) => {
    const mode = new URL(r.request().url()).searchParams.get("mode");
    return r.fulfill({
      json:
        mode === "communes"
          ? [{ nom: "Rennes", code: "35238", codesPostaux: ["35000"] }]
          : {
              label: "12 Rue des Lanternes 35000 Rennes",
              street: "Rue des Lanternes",
              number: "12",
              postalCode: "35000",
              city: "Rennes",
              cityCode: "35238",
              point: [-1.67, 48.1],
            },
    });
  });
  await page.locator(".participation-coordinates summary").click();
  await expect(page.getByRole("spinbutton", { name: "Latitude" })).toHaveValue(
    "",
  );
  await expect(page.getByRole("spinbutton", { name: "Longitude" })).toHaveValue(
    "",
  );
  const confirm = page.getByRole("button", {
    name: "Confirmer le point de ma maison",
  });
  await expect(confirm).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Envoyer ma participation" }),
  ).toBeDisabled();
  await page.getByRole("spinbutton", { name: "Latitude" }).fill("48.1");
  await page.getByRole("spinbutton", { name: "Longitude" }).fill("-1.67");
  await page.getByLabel("Code postal", { exact: false }).fill("35000");
  await expect(page.getByLabel("Ville", { exact: false })).toHaveValue("35238");
  await expect(
    page.getByRole("button", { name: "Envoyer ma participation" }),
  ).toBeDisabled();
  await confirm.click();
  await expect(
    page.getByRole("button", { name: "Envoyer ma participation" }),
  ).toBeDisabled();
  await page.getByRole("checkbox", { name: /J’ai pris connaissance/ }).check();
  await expect(
    page.getByRole("button", { name: "Envoyer ma participation" }),
  ).toBeEnabled();
  await page.getByRole("spinbutton", { name: "Latitude" }).fill("48.2");
  await expect(
    page.getByRole("button", { name: "Envoyer ma participation" }),
  ).toBeDisabled();
});

for (const viewport of [
  { width: 1280, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`geographical marker anchors during zoom/pan ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await arrange(page);
    const marker = page.locator(".house-marker").first();
    const map = page.locator(".map-canvas");
    const anchor = () =>
      marker.evaluate((el) => {
        const r = el.getBoundingClientRect();
        return {
          x: r.x + r.width / 2,
          y: r.bottom,
          position: getComputedStyle(el).position,
        };
      });
    const box = (await map.boundingBox())!;
    await expect
      .poll(async () => Math.abs((await anchor()).x - (box.x + box.width / 2)))
      .toBeLessThan(2);
    await expect
      .poll(async () => Math.abs((await anchor()).y - (box.y + box.height / 2)))
      .toBeLessThan(2);
    expect((await anchor()).position).toBe("absolute");
    expect(
      await marker.evaluate((el) =>
        Math.abs(
          el.getBoundingClientRect().bottom -
            el.querySelector(".house-marker-visual")!.getBoundingClientRect()
              .bottom,
        ),
      ),
    ).toBeLessThan(1);
    await page.locator(".maplibregl-ctrl-zoom-in").click();
    await page.waitForTimeout(600);
    await expect
      .poll(async () => Math.abs((await anchor()).x - (box.x + box.width / 2)))
      .toBeLessThan(2);
    await page.locator(".maplibregl-ctrl-zoom-out").click();
    await page.waitForTimeout(600);
    await expect
      .poll(async () => Math.abs((await anchor()).y - (box.y + box.height / 2)))
      .toBeLessThan(2);
    await marker.hover({ force: true });
    await marker.focus();
    expect(
      await marker.evaluate((el) => {
        const m = new DOMMatrix(getComputedStyle(el).transform);
        return [m.a, m.b, m.c, m.d];
      }),
    ).toEqual([1, 0, 0, 1]);
    const before = await anchor();
    const x = box.x + box.width / 2 - 80,
      y = box.y + box.height / 2 + 80;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 35, y + 25, { steps: 15 });
    await expect
      .poll(async () => Math.abs((await anchor()).x - before.x - 35))
      .toBeLessThan(3);
    await expect
      .poll(async () => Math.abs((await anchor()).y - before.y - 25))
      .toBeLessThan(3);
    await page.mouse.up();

    await expect(marker.locator(".house-marker-visual")).toHaveCSS("position", "relative");
  });
}

test("route badges remain anchored when a house is hovered", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 48.105, longitude: -1.675 });
  await arrange(page);
  await generate(page);
  // The route fit is animated; hover only after the marker is stationary and visible.
  let previousBox = "";
  const marker = page.locator(".route-house").first();
  await expect
    .poll(async () => {
      const box = await marker.boundingBox(),
        viewport = page.viewportSize()!;
      const current = JSON.stringify(box);
      const stable = current === previousBox;
      previousBox = current;
      return (
        !!box &&
        stable &&
        box.x >= 0 &&
        box.y >= 0 &&
        box.x + box.width <= viewport.width &&
        box.y + box.height <= viewport.height
      );
    })
    .toBe(true);
  await marker.hover();
  await expectRouteBadges(page);
});

declare global {
  interface Window {
    __routeGPS: {
      visible: boolean;
      created: number;
      cleared: number;
      callbacks: Map<
        number,
        { ok: PositionCallback; fail: PositionErrorCallback }
      >;
      emit: (accuracy: number, longitude?: number) => void;
      fail: (code: number) => void;
    };
  }
}
async function controlledGPS(page: Page) {
  await page.addInitScript(() => {
    const callbacks = new Map<
      number,
      { ok: PositionCallback; fail: PositionErrorCallback }
    >();
    const sample = (accuracy: number, longitude = -1.675) =>
      ({
        coords: { latitude: 48.105, longitude, accuracy },
        timestamp: Date.now(),
      }) as GeolocationPosition;
    window.__routeGPS = {
      visible: true,
      created: 0,
      cleared: 0,
      callbacks,
      emit: (accuracy, longitude) =>
        callbacks.forEach((c) => c.ok(sample(accuracy, longitude))),
      fail: (code) =>
        callbacks.forEach((c) => c.fail({ code } as GeolocationPositionError)),
    };
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => (window.__routeGPS.visible ? "visible" : "hidden"),
    });
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: (ok: PositionCallback) => ok(sample(12)),
        watchPosition: (ok: PositionCallback, fail: PositionErrorCallback) => {
          const id = ++window.__routeGPS.created;
          callbacks.set(id, { ok, fail });
          return id;
        },
        clearWatch: (id: number) => {
          window.__routeGPS.cleared++;
          callbacks.delete(id);
        },
      },
    });
  });
}

test("preparation gates creation, opens administrable guidelines and accepts every fear level", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await controlledGPS(page);
  await arrange(page);
  let payload: Record<string, unknown> | null = null;
  page.on("requestfinished", (r) => {
    if (new URL(r.url()).pathname === "/api/route") payload = r.postDataJSON();
  });
  await page
    .getByRole("button", { name: "Préparer mon parcours", exact: true })
    .click();
  const prep = page.getByRole("dialog", { name: "Préparer mon parcours" });
  await expect(prep).toBeVisible();
  await page.getByRole("button", { name: "Me localiser", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Créer mon parcours", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "bonnes pratiques", exact: true })
    .click();
  const guide = page.getByRole("dialog", {
    name: "Bonnes pratiques",
    exact: true,
  });
  await expect(guide).toContainText("Respecter les horaires.");
  await page
    .getByRole("button", { name: "J’ai compris", exact: false })
    .click();
  await expect(
    page.getByRole("button", { name: "Créer mon parcours", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("checkbox", { name: "Je m’adapte à tous les niveaux" })
    .check();
  await expect(
    page.getByRole("slider", { name: "Niveau de frayeur" }),
  ).toBeDisabled();
  await page.getByRole("checkbox", { name: "J’ai pris connaissance" }).check();
  await page.locator(".route-experience").evaluate(async (el) => {
    await Promise.allSettled(
      el.getAnimations({ subtree: true }).map((a) => a.finished),
    );
  });
  await page.screenshot({ path: "test-results/route-preparation-mobile.png" });
  await page
    .getByRole("button", { name: "Créer mon parcours", exact: true })
    .click();
  await expect(page.locator(".route-experience")).toHaveAttribute(
    "data-route-phase",
    "active",
  );
  expect(payload).not.toHaveProperty("maxFear");
  expect(payload).toMatchObject({
    acceptance: { guidelines: true, guidelines_version: "2026.1" },
  });
  expect(await page.evaluate(() => document.body.style.overflow)).toBe(
    "hidden",
  );
  const box = await page.locator(".route-experience").boundingBox();
  expect(box!.y).toBe(0);
  expect(box!.height).toBe(844);
  await expect(page.locator(".route-sheet")).toHaveAttribute(
    "data-sheet-position",
    "collapsed",
  );
});
test("manual departure keeps preferences and permission errors do not choose the communal centre", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await controlledGPS(page);
  await arrange(page);
  await page
    .getByRole("button", { name: "Préparer mon parcours", exact: true })
    .click();
  await page
    .getByRole("checkbox", { name: "Je m’adapte à tous les niveaux" })
    .check();
  await page.getByRole("checkbox", { name: "J’ai pris connaissance" }).check();
  await page
    .getByRole("button", { name: "Choisir sur la carte", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Préparer mon parcours" }),
  ).toBeHidden();
  await page.locator(".map-canvas").click({ position: { x: 140, y: 300 } });
  await page
    .getByRole("button", { name: "Valider le départ", exact: true })
    .click();
  await expect(
    page.getByRole("checkbox", { name: "Je m’adapte à tous les niveaux" }),
  ).toBeChecked();
  await expect(
    page.getByRole("checkbox", { name: "J’ai pris connaissance" }),
  ).toBeChecked();
  await expect(
    page.getByRole("button", { name: "Créer mon parcours", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Fermer la préparation" }).click();
  await page.evaluate(() => {
    navigator.geolocation.getCurrentPosition = (_ok, fail) =>
      fail?.({ code: 1 } as GeolocationPositionError);
  });
  await page
    .getByRole("button", { name: "Préparer mon parcours", exact: true })
    .click();
  await page.getByRole("button", { name: "Me localiser", exact: true }).click();
  await expect(
    page.locator(".route-preparation").getByRole("alert"),
  ).toContainText("refusée");
});
test("mobile panel snaps through three states; map and list open a one-screen house and restore the camera", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await controlledGPS(page);
  await arrange(page);
  await generate(page);
  await page.evaluate(() => window.__routeGPS.emit(10));
  await expect(
    page.getByRole("img", { name: "Position GPS actuelle" }),
  ).toBeVisible();
  const sheet = page.locator(".route-sheet"),
    handle = page.getByRole("button", {
      name: "Position du panneau parcours",
      exact: true,
    });
  await expect(sheet).toHaveAttribute("data-sheet-position", "collapsed");
  const grip = await handle.boundingBox();
  await page.mouse.move(grip!.x + 100, grip!.y + 20);
  await page.mouse.down();
  await page.mouse.move(grip!.x + 100, grip!.y - 210, { steps: 12 });
  await page.mouse.up();
  await expect(sheet).toHaveAttribute("data-sheet-position", "intermediate");
  await handle.press("ArrowUp");
  await expect(sheet).toHaveAttribute("data-sheet-position", "expanded");
  await page.locator(".route-experience").evaluate(async (el) => {
    await Promise.allSettled(
      el.getAnimations({ subtree: true }).map((a) => a.finished),
    );
  });
  const zoomControls = await page
    .locator(".maplibregl-ctrl-group")
    .boundingBox();
  expect(zoomControls!.y).toBeGreaterThanOrEqual(0);
  await page.screenshot({ path: "test-results/route-expanded-mobile.png" });
  const read = () =>
    page.evaluate(() =>
      JSON.parse(localStorage.getItem("halloween.active-route")!),
    );
  await page.waitForTimeout(350);
  const original = await read();
  await page.getByRole("button", { name: /Voir l’étape 1/ }).click();
  const card = page.getByRole("dialog", { name: houses[0].name, exact: true });
  await expect(card).toBeVisible();
  await expect(card).toContainText("S’adapte à ses visiteurs");
  await expect(card).toContainText("Étape n° 1");
  await page.locator(".route-experience").evaluate(async (el) => {
    await Promise.allSettled(
      el.getAnimations({ subtree: true }).map((a) => a.finished),
    );
  });
  await page.screenshot({ path: "test-results/route-house-mobile.png" });
  expect(await card.evaluate((el) => el.scrollHeight <= el.clientHeight)).toBe(
    true,
  );
  await page
    .getByRole("button", { name: "Fermer la fiche", exact: true })
    .click();
  expect((await read()).camera).toEqual(original.camera);
  expect((await read()).sheet).toBe("expanded");
  await handle.press("ArrowDown");
  await handle.press("ArrowDown");
  await expect(sheet).toHaveAttribute("data-sheet-position", "collapsed");
  await page
    .getByRole("button", { name: "Étape 2 · Les lanternes 2", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: houses[1].name, exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Voir sur la carte", exact: true })
    .click();
  await expect(sheet).toHaveAttribute("data-sheet-position", "collapsed");
});
test("live GPS preserves departure and camera; restoration, 60s polling, closure, recalculation and confirmed stop reuse phase 1", async ({
  page,
}) => {
  await page.clock.install();
  await controlledGPS(page);
  await arrange(page);
  await generate(page);
  const counts = { route: 0, availability: 0 };
  page.on("request", (r) => {
    const path = new URL(r.url()).pathname;
    if (path === "/api/route") counts.route++;
    if (path === "/api/route/availability") counts.availability++;
  });
  const read = () =>
    page.evaluate(() =>
      JSON.parse(localStorage.getItem("halloween.active-route")!),
    );
  await expect
    .poll(() => page.evaluate(() => window.__routeGPS.callbacks.size))
    .toBe(1);
  await page.evaluate(() => window.__routeGPS.emit(12));
  await page.waitForTimeout(600);
  const original = await read();
  await page.evaluate(() => window.__routeGPS.emit(180, -1.673));
  await expect(
    page.getByText("GPS approximatif", { exact: false }),
  ).toBeVisible();
  expect((await read()).camera).toEqual(original.camera);
  expect((await read()).parameters.origin).toEqual(original.parameters.origin);
  expect(counts.route).toBe(0);
  await page
    .getByRole("button", { name: "Recentrer sur ma position", exact: true })
    .click();
  await page.waitForTimeout(500);
  expect((await read()).camera.center[0]).toBeCloseTo(-1.673, 5);
  await page.evaluate(() => {
    window.__routeGPS.visible = false;
    document.dispatchEvent(new Event("visibilitychange"));
  });
  const before = counts.availability;
  await page.clock.fastForward(61000);
  expect(counts.availability).toBe(before);
  expect(await page.evaluate(() => window.__routeGPS.callbacks.size)).toBe(0);
  await page.evaluate(() => {
    window.__routeGPS.visible = true;
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect.poll(() => counts.availability).toBe(before + 1);
  // Let the hook consume the completed response before advancing its next interval.
  await page.waitForTimeout(100);
  await page.clock.fastForward(61000);
  await expect.poll(() => counts.availability).toBe(before + 2);
  await page.reload();
  await expect(page.locator(".route-experience")).toHaveAttribute(
    "data-route-phase",
    "active",
  );
  await expect
    .poll(() => page.evaluate(() => window.__routeGPS.callbacks.size))
    .toBe(1);
  await page.route("**/api/route/availability", (r) =>
    r.fulfill({
      json: {
        valid: true,
        checkedAt: new Date().toISOString(),
        steps: r
          .request()
          .postDataJSON()
          .steps.map((step: { id: string }) => ({
            id: step.id,
            available: step.id === houses[0].id,
            ...(step.id === houses[1].id
              ? { reason: "ended" }
              : { activities: ["CANDY"] }),
          })),
      },
    }),
  );
  await page.evaluate(() =>
    document.dispatchEvent(new Event("visibilitychange")),
  );
  const notice = page.getByText(
    "Une maison de votre parcours n’est plus disponible.",
    { exact: true },
  );
  await expect(notice).toBeVisible();
  expect((await read()).result.geometry).toEqual(original.result.geometry);
  await expect(page.locator(".house-marker.is-unavailable")).toHaveCount(1);
  await page.getByRole("button", { name: "Fermer la notification" }).click();
  await expect(notice).toHaveCount(0);
  await page
    .getByRole("button", { name: "Position du panneau parcours", exact: true })
    .press("ArrowUp");
  await page
    .getByRole("button", { name: "Position du panneau parcours", exact: true })
    .press("ArrowUp");
  await expect(page.getByText("Indisponible", { exact: true })).toBeVisible();
  // The expanded panel also exposes recalculation after dismissing the notice.
  await page
    .getByRole("button", { name: "Recalculer mon parcours", exact: true })
    .click();
  await expect.poll(async () => (await read()).result.stops.length).toBe(1);
  await expect(page.locator(".house-marker.is-unavailable")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Arrêter le parcours", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Arrêter ce parcours ?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Continuer", exact: true }).click();
  await expect(page.locator(".route-experience")).toHaveAttribute(
    "data-route-phase",
    "active",
  );
  await page
    .getByRole("button", { name: "Arrêter le parcours", exact: true })
    .click();
  await page.getByRole("button", { name: "Arrêter", exact: true }).click();
  await expect(page.locator(".route-sheet")).toHaveCount(0);
  expect(
    await page.evaluate(() => localStorage.getItem("halloween.active-route")),
  ).toBeNull();
  expect(await page.evaluate(() => window.__routeGPS.callbacks.size)).toBe(0);
});
test("compact visitor house fits small mobile screens with maximum text", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await controlledGPS(page);
  await arrange(page);
  const long = {
    ...houses[0],
    name: "La maison des lanternes mystérieuses et des ombres de la forêt enchantée pour Halloween",
    rp: "Une maison pleine de surprises accueille les visiteurs dans une ambiance magique et familiale. "
      .repeat(4)
      .slice(0, 300),
    practical:
      "Entrée par le portail, puis suivre les lanternes. Les enfants restent accompagnés. "
        .repeat(4)
        .slice(0, 300),
  };
  await page.route("**/api/public*", (r) =>
    r.fulfill({ json: { ...state, houses: [long], routeCandidates: [long] } }),
  );
  await page.reload();
  await page.getByRole("button", { name: long.name, exact: true }).click();
  const card = page.getByRole("dialog", { name: long.name, exact: true });
  await expect(card).toBeVisible();
  expect(await card.evaluate((el) => el.scrollHeight <= el.clientHeight)).toBe(
    true,
  );
  const c = await card.boundingBox(),
    button = await page
      .getByRole("button", { name: "Voir sur la carte", exact: true })
      .boundingBox();
  expect(button!.y + button!.height).toBeLessThanOrEqual(c!.y + c!.height);
  await page.locator(".route-experience").evaluate(async (el) => {
    await Promise.allSettled(
      el.getAnimations({ subtree: true }).map((a) => a.finished),
    );
  });
  await page.screenshot({ path: "test-results/route-house-small-mobile.png" });
});
test("desktop keeps the map central with a lateral panel and the same house dialog", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await controlledGPS(page);
  await arrange(page);
  await generate(page);
  const handle = page.getByRole("button", {
    name: "Position du panneau parcours",
    exact: true,
  });
  await handle.press("ArrowUp");
  await handle.press("ArrowUp");
  const sheet = await page.locator(".route-sheet").boundingBox();
  expect(sheet!.width).toBe(360);
  await expect
    .poll(
      async () => (await page.locator(".route-sheet").boundingBox())!.height,
    )
    .toBeGreaterThan(600);
  await page.locator(".route-experience").evaluate(async (el) => {
    await Promise.allSettled(
      el.getAnimations({ subtree: true }).map((a) => a.finished),
    );
  });
  await page.screenshot({ path: "test-results/route-desktop.png" });
  await page.getByRole("button", { name: /Voir l’étape 1/ }).click();
  const card = await page
    .getByRole("dialog", { name: houses[0].name, exact: true })
    .boundingBox();
  expect(card!.width).toBeLessThan(500);
  await page
    .getByRole("button", { name: "Fermer la fiche", exact: true })
    .click();
  await expect(page.locator(".route-sheet")).toHaveAttribute(
    "data-sheet-position",
    "expanded",
  );
});
