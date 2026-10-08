import { test, expect, type Page } from "@playwright/test";
const output = process.env.HOME_PREVIEW_OUTPUT ?? "test-results/home-reference";
const opening = "2026-10-31T11:00:00Z";
const state = {
  setupRequired: false,
  state: "COUNTDOWN",
  count: 37,
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
    closes_at: new Date(+new Date(opening) + 5 * 3600000).toISOString(),
    registrations_open: true,
  },
  contents: {},
  houses: [],
  routeCandidates: [],
  demoAvailable: false,
};
const person = {
  id: "visitor",
  display_name: "Claire Dubois",
  email: "claire.dubois@example.invalid",
  role_name: "USER",
  permissions: [],
  email_status: "VERIFIED",
};
async function arrange(
  page: Page,
  mode = "guest",
  alternate: Record<string, unknown> = {},
) {
  await page.clock.install({ time: new Date("2026-10-18T20:32:24Z") });
  await page.route("**/api/public*", (r) =>
    r.fulfill({
      json: { ...state, ...alternate, demoAvailable: mode === "admin" },
    }),
  );
  await page.route("**/api/me", (r) =>
    r.fulfill({
      json:
        mode === "guest"
          ? null
          : {
              ...person,
              ...(mode === "admin"
                ? {
                    display_name: "Thomas Martin",
                    role_name: "SUPER_ADMIN",
                    permissions: ["admin.access"],
                  }
                : {}),
            },
    }),
  );
  await page.route("**/api/house", (r) =>
    r.fulfill({
      json: ["house", "admin"].includes(mode)
        ? { id: "house", status: "VISIBLE" }
        : null,
    }),
  );
  await page.goto("/");
  await expect(page.locator(".home-reference")).toBeVisible();
  await page.locator(".home-art").evaluate(async () => {
    await document.fonts.ready;
    const img = new Image();
    img.src = "/art/home-reference-v2.webp";
    await img.decode();
  });
}
for (const size of [
  { width: 360, height: 640 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
  { width: 820, height: 1180 },
  { width: 1440, height: 900 },
]) {
  test(`home composition and no page scrolling ${size.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(size);
    await arrange(page);
    await expect(page.locator("h1")).toContainText("La carte ouvre");
    await expect(page.locator(".home-explanation")).toHaveText(
      "Découvrez les maisons participantes et préparez votre parcours d’Halloween.",
    );
    await expect(page.locator(".home-houses")).toContainText("37 maisons");
    await expect(
      page.getByRole("link", { name: "Inscrire ma maison", exact: true }),
    ).toHaveAttribute("href", "/register");
    const boxes = await page
      .locator(".home-clock>div")
      .evaluateAll((items) => items.map((e) => e.getBoundingClientRect().top));
    expect(new Set(boxes).size).toBe(1);
    for (const selector of [
      ".home-center h1",
      ".home-clock",
      ".home-houses",
      ".home-explanation",
      ".home-cta",
    ]) {
      const b = (await page.locator(selector).boundingBox())!;
      expect(b.y).toBeGreaterThan(60);
      expect(b.y + b.height).toBeLessThan(size.height - 20);
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.x + b.width).toBeLessThanOrEqual(size.width);
    }
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollHeight <= innerHeight &&
          document.body.scrollHeight <= innerHeight,
      ),
    ).toBe(true);
    await page.mouse.wheel(0, 600);
    expect(await page.evaluate(() => scrollY)).toBe(0);
    await page.screenshot({
      animations: "disabled",
      path: `${output}/accueil-${size.width}.png`,
    });
  });
}
test("desktop compact menu uses the same grid for account, install and logout", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await arrange(page, "admin");
  await page.evaluate(() => {
    const event = new Event("beforeinstallprompt");
    Object.assign(event, {
      prompt: async () => {},
      userChoice: Promise.resolve({ outcome: "accepted" }),
    });
    window.dispatchEvent(event);
  });
  await page
    .getByRole("button", { name: "Menu utilisateur", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("link", { name: "Signaler un bug", exact: true }),
  ).toHaveAttribute("href", /^mailto:domotikpro77@gmail\.com\?subject=/);
  await expect(
    dialog.locator(
      'a[href="/terms"], a[href="/privacy"], a[href="/guidelines"], a[href="/legal"]',
    ),
  ).toHaveCount(0);
  await dialog.evaluate(async (el) => {
    await Promise.all(
      el.getAnimations({ subtree: true }).map((a) => a.finished),
    );
  });
  const actions = [
    dialog.getByRole("link", { name: "Mon compte", exact: true }),
    dialog.getByRole("button", { name: "Ajouter l’application", exact: true }),
    dialog.getByRole("button", { name: "Se déconnecter", exact: true }),
  ];
  const positions = [];
  for (const action of actions) {
    await expect(action).toBeVisible();
    positions.push(
      await action
        .locator("span")
        .evaluate((el) => el.getBoundingClientRect().x),
    );
  }
  expect(Math.max(...positions) - Math.min(...positions)).toBeLessThan(1);
  expect((await dialog.boundingBox())!.height).toBeLessThan(650);
  const center = (await page.locator(".home-clock").boundingBox())!;
  expect(Math.abs(center.x + center.width / 2 - 720)).toBeLessThan(1);
  await page.screenshot({
    animations: "disabled",
    path: `${output}/menu-desktop.png`,
  });
  await page.evaluate(() => window.dispatchEvent(new Event("appinstalled")));
  await expect(actions[1]).toHaveCount(0);
  await page
    .getByRole("button", { name: "Fermer Menu utilisateur", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Soutenir le projet", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Soutenir le projet", exact: true }),
  ).toContainText("Un lien de soutien sera proposé");
  await expect(
    page.getByRole("link", {
      name: "Nous contacter pour proposer votre soutien",
    }),
  ).toHaveAttribute("href", /^mailto:domotikpro77@gmail\.com/);
  await page
    .getByRole("button", { name: "Fermer le soutien au projet" })
    .click();
});

for (const mode of ["guest", "member", "house", "admin"]) {
  test(`right overlay menu ${mode}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await arrange(page, mode);
    const before = await page.locator(".home-center").boundingBox();
    await page
      .getByRole("button", { name: "Menu utilisateur", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole("link", { name: "Signaler un bug", exact: true }),
    ).toHaveAttribute("href", /^mailto:domotikpro77@gmail\.com/);
    await expect(
      dialog.locator(
        'a[href="/terms"], a[href="/privacy"], a[href="/guidelines"], a[href="/legal"]',
      ),
    ).toHaveCount(0);
    if (mode === "guest") {
      await expect(dialog.getByLabel("Email", { exact: false })).toBeVisible();
      await expect(
        dialog.getByLabel("Mot de passe", { exact: false }),
      ).toBeVisible();
      for (const name of [
        "La carte",
        "Inscrire ma maison",
        "Ma participation",
        "Administration",
        "Préparer ma collecte",
      ]) {
        await expect(
          dialog.getByRole("link", { name, exact: true }),
        ).toHaveCount(0);
      }
      await page.route("**/api/login", (r) =>
        r.fulfill({ status: 401, json: { error: "Identifiants incorrects" } }),
      );
      await dialog
        .getByLabel("Email", { exact: false })
        .fill("visitor@example.invalid");
      await dialog
        .getByLabel("Mot de passe", { exact: false })
        .fill("incorrect-password");
      await dialog
        .getByRole("button", { name: "Se connecter", exact: true })
        .click();
      await expect(dialog.getByRole("alert")).toContainText(
        "Identifiants incorrects",
      );
    } else {
      await expect(
        dialog.getByRole("link", { name: "La carte", exact: true }),
      ).toBeVisible();
      await expect(
        dialog.getByRole("link", {
          name: mode === "member" ? "Inscrire ma maison" : "Ma participation",
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        dialog.getByRole("link", { name: "Administration", exact: true }),
      ).toHaveCount(mode === "admin" ? 1 : 0);
      await expect(
        dialog.getByRole("button", { name: "Se déconnecter", exact: true }),
      ).toBeVisible();
    }
    expect(await page.locator(".home-center").boundingBox()).toEqual(before);
    if (mode === "guest") {
      await page.keyboard.press("Escape");
      await page
        .getByRole("button", { name: "Menu utilisateur", exact: true })
        .click();
    }
    await page.screenshot({
      animations: "disabled",
      path: `${output}/menu-${mode}.png`,
    });
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Menu utilisateur", exact: true }),
    ).toBeFocused();
    await page
      .getByRole("button", { name: "Menu utilisateur", exact: true })
      .click();
    await page
      .locator(".floating-overlay")
      .click({ position: { x: 10, y: 200 } });
    await expect(dialog).toHaveCount(0);
  });
}
for (const width of [390, 1440]) {
  test(`shared compact menu and configured support ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await arrange(page, "member", {
      projectLinks: {
        bugEmail: "domotikpro77@gmail.com",
        supportUrl: "https://example.org/support",
      },
    });
    await page.goto("/map");
    await page
      .getByRole("button", { name: "Menu utilisateur", exact: true })
      .click();
    const menu = page.getByRole("dialog", {
      name: "Menu utilisateur",
      exact: true,
    });
    await expect(
      menu.getByRole("link", { name: "Signaler un bug", exact: true }),
    ).toHaveAttribute("href", /^mailto:domotikpro77@gmail\.com/);
    await expect(
      menu.locator(
        'a[href="/terms"], a[href="/privacy"], a[href="/guidelines"], a[href="/legal"]',
      ),
    ).toHaveCount(0);
    await expect(
      page
        .getByRole("contentinfo")
        .getByRole("link", { name: "Soutenir le projet", exact: true }),
    ).toHaveAttribute("href", "https://example.org/support");
    await expect(menu).toBeVisible();
    await menu.evaluate(async (el) => {
      await Promise.all(
        el.getAnimations({ subtree: true }).map((a) => a.finished),
      );
    });
    expect((await menu.boundingBox())!.width).toBeLessThanOrEqual(400);
    await page.screenshot({
      animations: "disabled",
      path: `${output}/menu-shared-${width}.png`,
    });
  });
}
test("configured date, ticking seconds, zero count and safe unconfigured state", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await arrange(page);
  const initial = await page.locator(".home-clock>div").last().textContent();
  await expect
    .poll(() => page.locator(".home-clock>div").last().textContent())
    .not.toBe(initial);
  await page.unroute("**/api/public*");
  await page.route("**/api/public*", (r) =>
    r.fulfill({
      json: { ...state, season: null, count: 0, state: "PREPARATION" },
    }),
  );
  await page.reload();
  await expect(page.locator(".home-houses")).toContainText("0 maison");
  await expect(page.locator("h1")).toContainText("31 octobre à 12:00");
  await expect(
    page.getByRole("link", { name: "Créer un compte", exact: true }),
  ).toBeVisible();
});

for (const mode of ["guest", "member", "house", "admin"]) {
  test(`native install offer survives a closed drawer: ${mode}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await arrange(page, mode);
    await page.evaluate(() => {
      const event = new Event("beforeinstallprompt", { cancelable: true });
      Object.assign(event, {
        prompt: async () => {
          document.body.dataset.nativeInstallCalls = "1";
        },
        userChoice: Promise.resolve({ outcome: "accepted" }),
      });
      window.dispatchEvent(event);
    });
    await page
      .getByRole("button", { name: "Menu utilisateur", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Ajouter l’application", exact: true })
      .click();
    await expect(page.locator("body")).toHaveAttribute(
      "data-native-install-calls",
      "1",
    );
    await expect(
      page.getByRole("button", { name: "Ajouter l’application", exact: true }),
    ).toHaveCount(0);
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollHeight <= innerHeight && scrollY === 0,
      ),
    ).toBe(true);
  });
}

test("unsupported browser and completed installation have no inactive action", async ({
  page,
}) => {
  await arrange(page);
  await page
    .getByRole("button", { name: "Menu utilisateur", exact: true })
    .click();
  const action = page.getByRole("button", {
    name: "Ajouter l’application",
    exact: true,
  });
  await expect(action).toHaveCount(0);
  await page.evaluate(() => {
    const event = new Event("beforeinstallprompt", { cancelable: true });
    Object.assign(event, {
      prompt: async () => {},
      userChoice: Promise.resolve({ outcome: "dismissed" }),
    });
    window.dispatchEvent(event);
  });
  await expect(action).toBeVisible();
  await action.click();
  await expect(action).toHaveCount(0);
  await page.evaluate(() => {
    const event = new Event("beforeinstallprompt", { cancelable: true });
    Object.assign(event, {
      prompt: async () => {},
      userChoice: Promise.resolve({ outcome: "accepted" }),
    });
    window.dispatchEvent(event);
  });
  await expect(action).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event("appinstalled")));
  await expect(action).toHaveCount(0);
});

for (const standalone of [false, true]) {
  test(`iOS installation help and standalone hiding: ${standalone}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript((installed) => {
      Object.defineProperty(navigator, "userAgent", {
        value:
          "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1",
      });
      Object.defineProperty(navigator, "standalone", { value: installed });
    }, standalone);
    await arrange(page);
    await page
      .getByRole("button", { name: "Menu utilisateur", exact: true })
      .click();
    const action = page.getByRole("button", {
      name: "Ajouter l’application",
      exact: true,
    });
    if (standalone) {
      await expect(action).toHaveCount(0);
    } else {
      await action.click();
      await expect(page.getByRole("status")).toContainText(
        "Touchez Partager puis « Sur l’écran d’accueil ».",
      );
      expect(
        await page.evaluate(
          () =>
            document.documentElement.scrollHeight <= innerHeight &&
            scrollY === 0,
        ),
      ).toBe(true);
      await page
        .getByRole("button", { name: "Fermer l’aide à l’installation" })
        .click();
      await expect(page.getByRole("status")).toHaveCount(0);
    }
  });
}
