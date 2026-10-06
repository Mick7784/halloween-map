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
  fear: 2,
  adaptable: false,
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
  await page.getByRole("checkbox", { name: "J’ai pris connaissance" }).check();
  await page.getByRole("button", { name: "Ma position", exact: true }).click();
  await expect(
    page.getByRole("img", { name: "Point de départ retenu" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Créer mon parcours", exact: true })
    .click();
  await expect(page.locator(".route-result")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Étape 1 · Les lanternes 1" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Étape 2 · Les lanternes 2" }),
  ).toBeVisible();
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
test("GPS departure, numbered stops, framed route, and all input invalidations", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({
    latitude: 48.105,
    longitude: -1.675,
    accuracy: 12,
  });
  await arrange(page);
  await expect(
    page.getByRole("button", { name: "Créer mon parcours", exact: true }),
  ).toBeDisabled();
  await generate(page);
  await expect(page.locator(".origin")).toContainText("48.10500, -1.67500");
  await expect(page.locator(".origin")).toContainText("±12 m");
  const bounds = await page.locator(".map-canvas").boundingBox();
  const marker = await page
    .getByRole("img", { name: "Point de départ retenu" })
    .boundingBox();
  expect(marker!.x).toBeGreaterThan(bounds!.x);
  expect(marker!.x + marker!.width).toBeLessThan(bounds!.x + bounds!.width);
  await page.getByRole("button", { name: "Bonbons", exact: true }).click();
  await expect(page.locator(".route-result")).toHaveCount(0);
  await expect(page.locator(".route-marker-number")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Créer mon parcours", exact: true })
    .click();
  await expect(page.locator(".route-result")).toBeVisible();
  await page.getByLabel("Frayeur maximale").selectOption("3");
  await expect(page.locator(".route-result")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Créer mon parcours", exact: true })
    .click();
  await expect(page.locator(".route-result")).toBeVisible();
  await page
    .getByText("Modifier le départ et les horaires", { exact: true })
    .click();
  const departureTime = page.getByLabel("Départ : heure", { exact: true });
  const [hour, minute] = (await departureTime.inputValue()).split(":");
  // Keep the changed departure inside the fixture's relative opening window.
  const changedMinute = Number(minute) === 59 ? 58 : Number(minute) + 1;
  await departureTime.fill(`${hour}:${String(changedMinute).padStart(2, "0")}`);
  await expect(page.locator(".route-result")).toHaveCount(0);
  await generate(page);
  await page
    .getByText("Modifier le départ et les horaires", { exact: true })
    .click();
  await page.getByRole("button", { name: "Ma position", exact: true }).click();
  await expect(page.locator(".route-result")).toHaveCount(0);
});
test("mobile point selection frees the map and supports cancel and explicit confirmation", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 48.105, longitude: -1.675 });
  await arrange(page);
  await page
    .getByRole("button", { name: "Préparer mon parcours", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Choisir sur la carte", exact: true })
    .click();
  await expect(page.locator(".route-panel")).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Valider le départ" }),
  ).toBeDisabled();
  await page.locator(".map-canvas").click({ position: { x: 100, y: 160 } });
  await page.getByRole("button", { name: "Valider le départ" }).click();
  await expect(page.locator(".route-panel")).toBeVisible();
  await expect(page.locator(".origin")).toContainText(
    "Point choisi sur la carte",
  );
  await page
    .getByRole("button", { name: "Choisir sur la carte", exact: true })
    .click();
  await page.getByRole("button", { name: "Annuler", exact: true }).click();
  await expect(page.locator(".origin")).toContainText(
    "Point choisi sur la carte",
  );
  await generate(page);
  const panel = await page.locator(".route-panel").boundingBox();
  for (const label of [
    "Étape 1 · Les lanternes 1",
    "Étape 2 · Les lanternes 2",
    "Point de départ retenu",
  ]) {
    await expect
      .poll(async () => {
        const box = await page
          .getByRole(label.startsWith("Étape") ? "button" : "img", {
            name: label,
          })
          .boundingBox();
        return box ? box.y + box.height : Infinity;
      })
      .toBeLessThan(panel!.y);
  }
  await page.screenshot({ path: "test-results/v05-mobile-route.png" });
});
test("location failures and unavailable API never silently choose the communal centre", async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "geolocation", {
      value: {
        getCurrentPosition: (
          _ok: unknown,
          fail: (e: { code: number }) => void,
        ) => fail({ code: 1 }),
      },
      configurable: true,
    }),
  );
  await arrange(page);
  await page.getByRole("button", { name: "Ma position", exact: true }).click();
  await expect(page.locator(".route-panel").getByRole("alert")).toContainText(
    "refusée",
  );
  await expect(
    page.getByRole("button", { name: "Créer mon parcours", exact: true }),
  ).toBeDisabled();
});
test("waiting GPS blocks submission; late routing responses and changed houses stay hidden", async ({
  page,
  context,
}) => {
  await page.clock.install();
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 48.105, longitude: -1.675 });
  await page.addInitScript(() => {
    const geo = navigator.geolocation,
      original = geo.getCurrentPosition.bind(geo);
    geo.getCurrentPosition = (...args) => {
      setTimeout(() => original(...args), 300);
    };
  });
  await arrange(page);
  await page.getByRole("button", { name: "Ma position", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Recherche de position…" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Créer mon parcours", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Créer mon parcours", exact: true }),
  ).toBeEnabled();
  await page.getByRole("checkbox", { name: "J’ai pris connaissance" }).check();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/route*", async (r) => {
    await gate;
    await r.fallback();
  });
  await page
    .getByRole("button", { name: "Créer mon parcours", exact: true })
    .click();
  await page.getByLabel("Frayeur maximale").selectOption("3");
  release();
  await expect(
    page.getByRole("button", { name: "Créer mon parcours", exact: true }),
  ).toBeEnabled();
  await expect(page.locator(".route-result")).toHaveCount(0);
  await page.unroute("**/api/route*", undefined);
  await arrange(page);
  await generate(page);
  await page.route("**/api/route/availability", (r) =>
    r.fulfill({
      json: {
        valid: true,
        checkedAt: new Date().toISOString(),
        steps: houses.map((h, n) => ({
          id: h.id,
          available: n === 0,
          ...(n ? { reason: "unavailable" } : {}),
        })),
      },
    }),
  );
  await page.getByRole("button", { name: "Démarrer mon parcours" }).click();
  await page.clock.fastForward(61000);
  await expect(page.locator(".route-result")).toBeVisible();
  await expect(
    page.getByText("Une maison de votre parcours n’est plus disponible", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator(".route-marker-number")).toHaveCount(2);
});
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
      y = box.y + 120;
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

    expect(
      await marker
        .locator(".house-marker-visual")
        .evaluate((el) => getComputedStyle(el).position),
    ).toBe("relative");
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
  await page.locator(".route-house").first().hover({ force: true });
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
test("active route persists, polls only in foreground, follows GPS without moving the departure and recalculates atomically", async ({
  page,
}) => {
  await page.clock.install();
  await controlledGPS(page);
  const calls = { public: 0, me: 0, route: 0, availability: 0 };
  page.on("request", (r) => {
    const path = new URL(r.url()).pathname;
    if (path === "/api/public") calls.public++;
    if (path === "/api/me") calls.me++;
    if (path === "/api/route") calls.route++;
    if (path === "/api/route/availability") calls.availability++;
  });
  await arrange(page);
  await page.getByRole("button", { name: "Ma position", exact: true }).click();
  await page
    .getByRole("button", { name: "Créer mon parcours", exact: true })
    .click();
  expect(calls.route).toBe(0);
  await generate(page);
  expect(await page.evaluate(() => window.__routeGPS.callbacks.size)).toBe(0);
  await page.getByRole("button", { name: "Démarrer mon parcours" }).click();
  await expect.poll(() => calls.availability).toBe(1);
  await expect
    .poll(() => page.evaluate(() => window.__routeGPS.callbacks.size))
    .toBe(1);
  await expect
    .poll(() =>
      page.evaluate(() => !!localStorage.getItem("halloween.active-route")),
    )
    .toBe(true);
  const read = () =>
    page.evaluate(() =>
      JSON.parse(localStorage.getItem("halloween.active-route")!),
    );
  const original = await read();
  await page.evaluate(() => window.__routeGPS.emit(12));
  await expect(
    page.getByRole("img", { name: "Position GPS actuelle" }),
  ).toBeVisible();
  const canvas = page.locator(".map-canvas");
  await canvas.dragTo(canvas, {
    sourcePosition: { x: 180, y: 130 },
    targetPosition: { x: 210, y: 160 },
  });
  await page.waitForTimeout(600);
  const camera = (await read()).camera;
  await page.evaluate(() => window.__routeGPS.emit(180, -1.674));
  await expect(
    page.getByText("Position approximative", { exact: false }),
  ).toBeVisible();
  expect((await read()).camera).toEqual(camera);
  expect((await read()).parameters.origin).toEqual(original.parameters.origin);
  expect(calls.route).toBe(1);
  await page.evaluate(() => window.__routeGPS.fail(2));
  await expect(
    page.getByText("Signal GPS indisponible", { exact: false }),
  ).toBeVisible();
  await expect(page.locator(".route-result")).toBeVisible();
  await page.evaluate(() => window.__routeGPS.emit(10, -1.673));
  await page
    .getByRole("button", { name: "Recentrer sur ma position", exact: true })
    .click();
  await page.waitForTimeout(600);
  expect((await read()).camera.center[0]).toBeCloseTo(-1.673, 5);
  const beforeSheet = await read();
  await page.getByRole("button", { name: "Étape 1 · Les lanternes 1" }).click();
  await expect(
    page.getByRole("dialog", { name: "Les lanternes 1" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Fermer la fiche" }).click();
  expect((await read()).camera).toEqual(beforeSheet.camera);
  expect((await read()).sheet).toBe(beforeSheet.sheet);
  await page.clock.fastForward(50000);
  expect(calls.availability).toBe(1);
  await page.clock.fastForward(11000);
  await expect.poll(() => calls.availability).toBe(2);
  await page.evaluate(() => {
    window.__routeGPS.visible = false;
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect
    .poll(() => page.evaluate(() => window.__routeGPS.callbacks.size))
    .toBe(0);
  await page.clock.fastForward(120000);
  expect(calls.availability).toBe(2);
  await page.evaluate(() => {
    window.__routeGPS.visible = true;
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect.poll(() => calls.availability).toBe(3);
  await expect
    .poll(() => page.evaluate(() => window.__routeGPS.callbacks.size))
    .toBe(1);
  expect(calls.public).toBe(1);
  expect(calls.me).toBe(1);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Arrêter mon parcours" }),
  ).toBeVisible();
  await expect.poll(() => calls.availability).toBe(4);
  await expect
    .poll(() => page.evaluate(() => window.__routeGPS.callbacks.size))
    .toBe(1);
  let unavailable = true;
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
            available: !unavailable || step.id === houses[0].id,
            ...(unavailable && step.id === houses[1].id
              ? { reason: "ended" }
              : {}),
          })),
      },
    }),
  );
  await page.evaluate(() =>
    document.dispatchEvent(new Event("visibilitychange")),
  );
  await expect(
    page.getByText("Une maison de votre parcours n’est plus disponible", {
      exact: true,
    }),
  ).toBeVisible();
  expect((await read()).result.geometry).toEqual(original.result.geometry);
  expect((await read()).result.stops).toHaveLength(2);
  await page
    .getByRole("button", { name: "Recalculer mon parcours", exact: true })
    .click();
  await expect.poll(async () => (await read()).result.stops.length).toBe(1);
  await expect(
    page.getByText("Une maison de votre parcours n’est plus disponible", {
      exact: true,
    }),
  ).toHaveCount(0);
  expect((await read()).parameters.excludedHouseIds).toContain(houses[1].id);
  unavailable = false;
  await page.getByRole("button", { name: "Arrêter mon parcours" }).click();
  await expect
    .poll(() => page.evaluate(() => window.__routeGPS.callbacks.size))
    .toBe(0);
  expect(
    await page.evaluate(() => localStorage.getItem("halloween.active-route")),
  ).toBeNull();
  const count = calls.availability;
  await page.clock.fastForward(61000);
  expect(calls.availability).toBe(count);
  await expect(page.locator(".route-result")).toHaveCount(0);
});
test("GPS refusal preserves the active route and expiry clears storage and watch", async ({
  page,
}) => {
  await page.clock.install();
  await controlledGPS(page);
  await arrange(page);
  await generate(page);
  await page.getByRole("button", { name: "Démarrer mon parcours" }).click();
  await expect
    .poll(() => page.evaluate(() => window.__routeGPS.callbacks.size))
    .toBe(1);
  await page.evaluate(() => window.__routeGPS.fail(1));
  await expect(
    page.getByText("Suivi GPS refusé", { exact: false }),
  ).toBeVisible();
  await expect(page.locator(".route-result")).toBeVisible();
  expect(await page.evaluate(() => window.__routeGPS.callbacks.size)).toBe(0);
  await page.clock.fastForward(3 * 3600000);
  await expect(page.locator(".route-result")).toHaveCount(0);
  expect(
    await page.evaluate(() => localStorage.getItem("halloween.active-route")),
  ).toBeNull();
});

test("deleting a prepared route and an empty recalculation clean up without deleting houses", async ({
  page,
}) => {
  await controlledGPS(page);
  await arrange(page);
  await generate(page);
  await page
    .getByRole("button", { name: "Supprimer le parcours préparé" })
    .click();
  await expect(page.locator(".route-result")).toHaveCount(0);
  expect(
    await page.evaluate(() => localStorage.getItem("halloween.active-route")),
  ).toBeNull();
  await expect(page.locator(".house-marker")).toHaveCount(2);
  await generate(page);
  await page.getByRole("button", { name: "Démarrer mon parcours" }).click();
  await expect
    .poll(() => page.evaluate(() => window.__routeGPS.callbacks.size))
    .toBe(1);
  const result = await page.evaluate(
    () => JSON.parse(localStorage.getItem("halloween.active-route")!).result,
  );
  await page.route("**/api/route/availability", (r) =>
    r.fulfill({
      json: {
        valid: true,
        checkedAt: new Date().toISOString(),
        steps: houses.map((h) => ({
          id: h.id,
          available: false,
          reason: "unavailable",
        })),
      },
    }),
  );
  await page.evaluate(() =>
    document.dispatchEvent(new Event("visibilitychange")),
  );
  await expect(
    page.getByText("Une maison de votre parcours n’est plus disponible", {
      exact: true,
    }),
  ).toBeVisible();
  await page.route("**/api/route", (r) =>
    r.fulfill({
      json: {
        ...result,
        stops: [],
        geometry: [],
        distanceMeters: 0,
        walkingSeconds: 0,
        walkingMinutes: 0,
        durationMinutes: 0,
        message: "Aucune maison disponible pour ces horaires.",
      },
    }),
  );
  await page
    .getByRole("button", { name: "Recalculer mon parcours", exact: true })
    .click();
  await expect
    .poll(() => page.evaluate(() => window.__routeGPS.callbacks.size))
    .toBe(0);
  await expect(page.locator(".route-result")).toHaveCount(0);
  expect(
    await page.evaluate(() => localStorage.getItem("halloween.active-route")),
  ).toBeNull();
  await expect(page.locator(".house-marker")).toHaveCount(2);
});
