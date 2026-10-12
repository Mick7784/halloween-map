import { test, expect } from "@playwright/test";
import { realSeasonFixture } from "./fixtures/real-season";
for (const role of ["USER", "ADMIN", "SUPER_ADMIN", "CUSTOM"]) {
  test(`one menu on every public page, permissions for ${role}`, async ({
    page,
  }) => {
    test.setTimeout(60000);
    await page.setViewportSize({ width: 390, height: 844 });
    const season = realSeasonFixture({
      opensIn: 86400000,
      closesIn: 172800000,
    });
    const permissions = ["SUPER_ADMIN", "CUSTOM"].includes(role)
      ? ["admin.access"]
      : [];
    await page.route("**/api/**", (route) => {
      const path = new URL(route.request().url()).pathname;
      const data =
        path === "/api/me"
          ? {
              id: "global-user",
              instance_id: season.instance_id,
              display_name: "Camille",
              email: "camille@example.invalid",
              role_name: role,
              permissions,
              email_status: "VERIFIED",
            }
          : path === "/api/public"
            ? {
                setupRequired: false,
                state: "COUNTDOWN",
                mapAccessible: true,
                collectionAccessible: false,
                publicMapOpen: false,
                season,
                instance: {
                  id: season.instance_id,
                  active_season_id: season.id,
                  territory: "Commune",
                  timezone: "Europe/Paris",
                  longitude: 2.8,
                  latitude: 48.8,
                  zoom: 14,
                },
                houses: [],
                routeCandidates: [],
                documents: {},
                projectLinks: {
                  contactEnabled: true,
                  contactEmail: "organisateur@example.invalid",
                  bugEnabled: true,
                  bugEmail: "bug@example.invalid",
                },
              }
            : path === "/api/history"
              ? [{ year: 2026 }]
              : path === "/api/house"
                ? null
                : {};
      return route.fulfill({ json: data });
    });
    await page.route("https://basemaps.cartocdn.com/**", (r) =>
      r.fulfill({ json: { version: 8, sources: {}, layers: [] } }),
    );
    let baseline: string[] | null = null;
    for (const path of [
      "/",
      "/map",
      "/about",
      "/terms",
      "/privacy",
      "/guidelines",
      "/legal",
      "/login",
      "/register",
      "/forgot-password",
      "/account",
      "/participant",
    ]) {
      await page.goto(path);
      if (path === "/participant")
        await page
          .getByRole("button", { name: "Revenir à Mon compte", exact: true })
          .click();
      else if (path !== "/account")
        await page
          .getByRole("button", { name: "Menu utilisateur", exact: true })
          .click();
      const dialog = page.getByRole("dialog", {
        name: "Mon compte",
        exact: true,
      });
      await expect(dialog).toBeVisible();
      await expect(page.getByRole("dialog")).toHaveCount(1);
      await expect(
        dialog.locator(".account-row-copy small,details,form"),
      ).toHaveCount(0);
      await expect(
        dialog.getByRole("link", { name: "Administration", exact: true }),
      ).toHaveCount(permissions.length ? 1 : 0);
      await expect(
        dialog.getByRole("link", { name: "Préparer ma collecte", exact: true }),
      ).toHaveCount(0);
      const entries = await dialog
        .locator(".account-row strong,.account-session strong")
        .allTextContents();
      if (baseline) expect(entries).toEqual(baseline);
      else baseline = entries;
      await dialog.evaluate((el) => el.setAttribute("data-preserved", "yes"));
      await dialog
        .getByRole("button", { name: "Ma participation", exact: true })
        .click();
      await expect(page.locator(".account-dialog")).toHaveAttribute(
        "data-preserved",
        "yes",
      );
      await expect(page.getByRole("dialog")).toHaveCount(1);
      await page
        .getByRole("button", { name: "Revenir à Mon compte", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Fermer Mon compte", exact: true })
        .click();
      await expect(page.locator(".account-dialog")).toHaveCount(0);
    }
  });
}
