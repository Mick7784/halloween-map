import { test, expect, type Page } from "@playwright/test";
const houses = [0, 1].map((n) => ({
  id: `house-${n}`,
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
    public_name: "Halloween",
    territory: "Saint-Martin",
    timezone: "Europe/Paris",
    latitude: 48.1,
    longitude: -1.67,
    zoom: 14,
  },
  season: {
    opens_at: new Date(Date.now() - 7200000).toISOString(),
    closes_at: new Date(Date.now() + 18000000).toISOString(),
    registrations_open: true,
  },
  houses,
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
    const input = r.request().postDataJSON(),
      start = +new Date(input.start);
    return r.fulfill({
      json: {
        stops: houses.map((house, n) => ({
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
    expect(
      await visual.evaluate((el) => {
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
    ).toBe(true);
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
  await page.route("**/api/public*", (r) =>
    r.fulfill({
      json: { ...state, houses: [houses[0]], routeCandidates: [houses[0]] },
    }),
  );
  await page
    .getByText("Modifier le départ et les horaires", { exact: true })
    .click();
  await page.getByRole("button", { name: "Recentrer sur le départ" }).click();
  // Polling uses the existing 30s schedule; advance only that browser timer.
  await page.clock.fastForward(31000);
  await expect(page.locator(".route-result")).toHaveCount(0);
  await expect(
    page.getByText(
      "Les maisons ou horaires ont changé. Recalculez votre parcours.",
    ),
  ).toBeVisible();
  await expect(page.locator(".route-marker-number")).toHaveCount(0);
});
test("new house starts blank and requires explicit coordinate confirmation", async ({
  page,
}) => {
  await page.route("**/api/house", (r) => r.fulfill({ json: null }));
  await arrange(page);
  await page.goto("/participant");
  await expect(page.getByRole("spinbutton", { name: "Latitude" })).toHaveValue(
    "",
  );
  await expect(page.getByRole("spinbutton", { name: "Longitude" })).toHaveValue(
    "",
  );
  const confirm = page.getByRole("checkbox", {
    name: "Je confirme que ce point correspond à ma maison.",
  });
  await expect(confirm).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Envoyer ma participation" }),
  ).toBeDisabled();
  await page.getByRole("spinbutton", { name: "Latitude" }).fill("48.1");
  await page.getByRole("spinbutton", { name: "Longitude" }).fill("-1.67");
  await expect(
    page.getByRole("button", { name: "Envoyer ma participation" }),
  ).toBeDisabled();
  await confirm.check();
  await expect(
    page.getByRole("button", { name: "Envoyer ma participation" }),
  ).toBeEnabled();
  await page.getByRole("spinbutton", { name: "Latitude" }).fill("48.2");
  await expect(confirm).not.toBeChecked();
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
