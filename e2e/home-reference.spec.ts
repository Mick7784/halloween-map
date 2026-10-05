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
        "Préparer mon parcours",
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
      .locator(".home-menu-overlay")
      .click({ position: { x: 10, y: 200 } });
    await expect(dialog).toHaveCount(0);
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
