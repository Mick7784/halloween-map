import { test, expect } from "@playwright/test";
import { realSeasonFixture } from "./fixtures/real-season";
for (const width of [390, 1440])
  test(`shared floating navigation and unobstructed map ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const season = realSeasonFixture();
    const user = {
      id: "window-user",
      instance_id: season.instance_id,
      role_name: "USER",
      permissions: [],
      email_status: "VERIFIED",
      display_name: "Camille",
      email: "camille@example.invalid",
    };
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      const data =
        path === "/api/me"
          ? user
          : path === "/api/public"
            ? {
                setupRequired: false,
                state: "MAP_OPEN",
                mapAccessible: true,
                instance: {
                  id: season.instance_id,
                  active_season_id: season.id,
                  public_name: "Halloween",
                  territory: "Commune",
                  longitude: 2.8,
                  latitude: 48.8,
                  zoom: 14,
                  timezone: "Europe/Paris",
                },
                season,
                houses: [],
                routeCandidates: [],
                documents: {
                  GUIDELINES: {
                    title: "Bonnes pratiques",
                    version: "2026.1",
                    body: "Respectez les habitants.",
                  },
                },
              }
            : path === "/api/house"
              ? null
              : {};
      await route.fulfill({ json: data });
    });
    for (const path of ["/", "/map"]) {
      await page.goto(path);
      const trigger = page.getByRole("button", {
        name: "Menu utilisateur",
        exact: true,
      });
      for (const close of ["X", "backdrop", "Escape"]) {
        await trigger.click();
        const menu = page.getByRole("dialog", {
          name: "Menu utilisateur",
          exact: true,
        });
        await expect(
          menu.getByRole("link", { name: "La carte", exact: true }),
        ).toBeVisible();
        await menu.getByRole("heading", { name: "Menu utilisateur" }).click();
        await expect(menu).toBeVisible();
        await expect(
          menu.locator('a[href="/legal"],a[href="/privacy"],a[href="/terms"]'),
        ).toHaveCount(0);
        if (close === "X")
          await menu
            .getByRole("button", {
              name: "Fermer Menu utilisateur",
              exact: true,
            })
            .click();
        else if (close === "backdrop")
          await page
            .locator(".floating-overlay")
            .click({ position: { x: 4, y: 4 } });
        else await page.keyboard.press("Escape");
        await expect(menu).toHaveCount(0);
        await expect(trigger).toBeFocused();
      }
    }
    await expect(
      page.locator(".route-map-toolbar,.route-map-discovery,.route-house-list"),
    ).toHaveCount(0);
    await expect(page.locator(".site-header")).toBeVisible();
    await expect(page.locator(".maplibregl-ctrl-zoom-in")).toBeVisible();
    await page
      .getByRole("button", { name: "Options de la carte", exact: true })
      .click();
    const options = page.getByRole("dialog", {
      name: "Maisons et filtres",
      exact: true,
    });
    await expect(
      options.locator(".route-discovery-filters button"),
    ).toHaveCount(3);
    await options.locator(".route-discovery-filters button").first().click();
    await expect(options).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(options).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Options de la carte", exact: true }),
    ).toBeFocused();
    await page
      .getByRole("button", { name: "Préparer mon parcours", exact: true })
      .click();
    const prep = page.getByRole("dialog", {
      name: "Préparer mon parcours",
      exact: true,
    });
    await expect(prep).toBeVisible();
    await page
      .getByRole("button", { name: "bonnes pratiques", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Revenir à la préparation", exact: true })
      .click();
    await expect(prep).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(prep).toHaveCount(0);
  });
