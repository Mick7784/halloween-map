import { test, expect } from "@playwright/test";
import { expandAccountGroup } from "./fixtures/account-menu";
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
                collectionAccessible: true,
                publicMapOpen: true,
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
                houses: [
                  {
                    id: "compact-house",
                    name: "Maison citrouille",
                    address: "Adresse de test",
                    longitude: 2.8,
                    latitude: 48.8,
                    activities: ["DECORATION", "CANDY", "ACTING"],
                    starts_at: season.opens_at,
                    ends_at: season.closes_at,
                    fear: 2,
                    adaptable: true,
                    rp: "",
                    practical: "",
                  },
                ],
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
          name: "Mon compte",
          exact: true,
        });
        await expandAccountGroup(page, "Carte et collecte");
        await expect(
          menu.getByRole("link", { name: "La carte", exact: true }),
        ).toBeVisible();
        await menu.getByRole("heading", { name: "Mon compte" }).click();
        await expect(menu).toBeVisible();
        await expect(
          menu.locator('a[href="/legal"],a[href="/privacy"],a[href="/terms"]'),
        ).toHaveCount(0);
        if (close === "X")
          await menu
            .getByRole("button", {
              name: "Fermer Mon compte",
              exact: true,
            })
            .click();
        else if (close === "backdrop")
          await page
            .locator(".account-overlay")
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
      .getByRole("button", { name: "Les maisons à découvrir", exact: false })
      .click();
    const options = page.getByRole("dialog", {
      name: "Maisons et filtres",
      exact: true,
    });
    await expect(
      options.locator(".route-discovery-filters button"),
    ).toHaveCount(3);
    await expect(
      options.getByRole("button", { name: "Afficher la carte", exact: true }),
    ).toHaveCount(0);
    await expect(
      options.getByRole("button", {
        name: "Afficher la liste des maisons",
        exact: true,
      }),
    ).toHaveCount(0);
    const house = options.locator(".map-options-list > button");
    await expect(house).toHaveCount(1);
    await expect(house).toHaveAccessibleName(
      /Décoration.*Bonbons.*Mise en scène/,
    );
    await expect(house.locator(".discovery-house-activities svg")).toHaveCount(3);
    await expect(house).toHaveCSS("height", "52px");
    await expect(options).toHaveAttribute("aria-modal", "false");
    await expect(
      options.locator(".route-discovery-filters button").first(),
    ).toHaveText("Décoration");
    await options.locator(".route-discovery-filters button").first().click();
    await expect(options).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(options).toHaveCount(0);
    await expect(
      page.getByRole("button", {
        name: "Les maisons à découvrir",
        exact: false,
      }),
    ).toBeFocused();
    await page.evaluate(() => window.dispatchEvent(new Event("map-options")));
    await expect(options.locator(".map-options-list > button")).toHaveCount(1);
    await options
      .getByRole("button", { name: "Fermer Maisons et filtres", exact: true })
      .click();
    await expect(options).toHaveCount(0);
    await page
      .getByRole("button", { name: "Préparer ma collecte", exact: true })
      .click();
    const prep = page.getByRole("dialog", {
      name: "Préparer ma collecte",
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
