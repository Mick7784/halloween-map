import { test, expect, type Page } from "@playwright/test";
import {
  clickAccountAction,
  expandAccountGroup,
} from "./fixtures/account-menu";
import { realSeasonFixture } from "./fixtures/real-season";

async function arrange(page: Page, guest = false) {
  const season = realSeasonFixture({ opensIn: 86400000, closesIn: 172800000 });
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({
      json:
        path === "/api/me"
          ? guest
            ? null
            : {
                id: "compact-user",
                display_name: "Camille",
                email: "camille@example.invalid",
                email_status: "VERIFIED",
                role_name: "ADMIN",
                permissions: [],
              }
          : path === "/api/public"
            ? {
                setupRequired: false,
                state: "COUNTDOWN",
                season,
                serverTime: new Date().toISOString(),
                count: 12,
                mapAccessible: false,
                collectionAccessible: false,
                publicMapOpen: false,
                instance: {
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
                  contactEnabled: false,
                  bugEnabled: false,
                  supportEnabled: true,
                  supportUrl: "https://example.org/support",
                },
              }
            : path === "/api/house"
              ? null
              : path === "/api/history"
                ? [{ year: 2026 }]
                : {},
    });
  });
  await page.goto("/");
  await expect(page.locator(".home-reference")).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

for (const size of [
  { width: 320, height: 568 },
  { width: 360, height: 640 },
  { width: 390, height: 844 },
  { width: 1440, height: 600 },
  { width: 2048, height: 1042 },
]) {
  for (const guest of [false, true])
    test(`separate home frame and compact menu ${size.width}x${size.height} guest=${guest}`, async ({
      page,
    }) => {
      await page.setViewportSize(size);
      await arrange(page, guest);
      const header = (await page.locator(".home-header").boundingBox())!;
      const stage = (await page.locator(".home-stage").boundingBox())!;
      const art = (await page.locator(".home-art").boundingBox())!;
      const footer = (await page.locator(".home-signature").boundingBox())!;
      expect(stage.y).toBeGreaterThanOrEqual(header.y + header.height);
      expect(footer.y).toBeGreaterThanOrEqual(stage.y + stage.height - 1);
      expect(art).toEqual(stage);
      expect(footer.y + footer.height).toBeLessThanOrEqual(size.height + 1);
      await expect(
        page
          .getByRole("contentinfo")
          .getByRole("link", { name: "Mentions légales" }),
      ).toBeVisible();
      await expect(page.locator(".home-art")).toHaveCSS(
        "background-image",
        /halloween-village-v2/,
      );
      await expect(page.locator(".home-art")).toHaveCSS(
        "background-size",
        "cover",
      );
      if (guest) {
        // A clean first-open choice; the existing form is still accessible on demand.
        await expect(page.locator(".home-login")).toHaveCount(0);
        await expect(
          page.getByRole("button", { name: "Se connecter", exact: true }),
        ).toBeVisible();
        await expect(
          page.getByRole("link", { name: "Créer un compte", exact: true }),
        ).toBeVisible();
      }
      if (size.height >= 640)
        expect(
          await page
            .locator(".home-stage")
            .evaluate((el) => el.scrollHeight - el.clientHeight),
        ).toBeLessThanOrEqual(1);
      await page
        .getByRole("button", { name: "Menu utilisateur", exact: true })
        .click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      expect(
        await page
          .locator(".account-scroll")
          .evaluate((el) => el.scrollHeight - el.clientHeight),
      ).toBeLessThanOrEqual(1);
      await expect(
        dialog.getByRole("link", { name: "Administration", exact: true }),
      ).toHaveCount(0);
      if (!guest) {
        await expect(
          dialog.getByRole("button", { name: "Se déconnecter" }),
        ).toBeInViewport();
        await expandAccountGroup(page, "Mes participations");
        await expandAccountGroup(page, "Profil et sécurité");
        await expect(
          dialog.locator('.account-group-toggle[aria-expanded="true"]'),
        ).toHaveCount(1);
        await expect(
          dialog.getByRole("button", { name: "Ma participation", exact: true }),
        ).toHaveCount(0);
        await expect(
          dialog.getByRole("button", {
            name: "Supprimer mon compte",
            exact: true,
          }),
        ).toBeVisible();
      }
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "Menu utilisateur", exact: true }),
      ).toBeFocused();
      await page.screenshot({
        path: `test-results/v088/home-${size.width}-${size.height}-${guest ? "guest" : "member"}.png`,
      });
    });
}

test("identity and password drafts survive back; X, Escape and links cannot discard silently", async ({
  page,
}) => {
  await arrange(page);
  await page
    .getByRole("button", { name: "Menu utilisateur", exact: true })
    .click();
  await clickAccountAction(page, "Mes informations");
  const input = page.getByLabel("Nom d’affichage");
  await input.fill("Camille brouillon");
  await input.evaluate((el) => el.setAttribute("data-retained", "yes"));
  await page.getByRole("button", { name: "Revenir à Mon compte" }).click();
  await clickAccountAction(page, "Mot de passe");
  await page
    .getByLabel("Nouveau mot de passe", { exact: true })
    .fill("draft-password-123");
  await page.getByRole("button", { name: "Revenir à Mon compte" }).click();
  await clickAccountAction(page, "Mes informations");
  await expect(input).toHaveValue("Camille brouillon");
  await expect(input).toHaveAttribute("data-retained", "yes");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.keyboard.press("Escape");
  await expect(page.locator(".account-dialog")).toBeVisible();
  await page.getByRole("button", { name: "Revenir à Mon compte" }).click();
  await clickAccountAction(page, "Confidentialité et données");
  const legal = page
    .locator('.account-subview:not([hidden]) a[href="/legal"]')
    .first();
  await page
    .locator(".account-subview:not([hidden]) .account-contact summary")
    .click();
  page.once("dialog", (dialog) => dialog.dismiss());
  await legal.click();
  await expect(page).toHaveURL(/\/$/);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Fermer Mon compte" }).click();
  await expect(page.locator(".account-dialog")).toHaveCount(0);
});

test("participation draft remains mounted through menu and refuses accidental close", async ({
  page,
}) => {
  await arrange(page);
  await page
    .getByRole("button", { name: "Menu utilisateur", exact: true })
    .click();
  await clickAccountAction(page, "Ma participation");
  const name = page.locator('input[name="name"]');
  await name.fill("Le jardin des lanternes");
  await name.evaluate((el) => el.setAttribute("data-retained", "yes"));
  await page.getByRole("button", { name: "Revenir à Mon compte" }).click();
  await clickAccountAction(page, "Ma participation");
  await expect(name).toHaveValue("Le jardin des lanternes");
  await expect(name).toHaveAttribute("data-retained", "yes");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page
    .getByRole("button", { name: "Fermer ma participation", exact: true })
    .click();
  await expect(name).toHaveValue("Le jardin des lanternes");
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Fermer ma participation", exact: true })
    .click();
  await expect(page.locator(".account-dialog")).toHaveCount(0);
});

test("short viewport keeps authentication, footer and menu close reachable without losing input", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await arrange(page, true);
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  const email = page
    .locator(".home-login")
    .getByLabel("Email", { exact: false });
  await email.fill("keyboard@example.invalid");
  await email.focus();
  await page.setViewportSize({ width: 390, height: 360 });
  await expect(email).toHaveValue("keyboard@example.invalid");
  const submit = page
    .locator(".home-login")
    .getByRole("button", { name: "Se connecter", exact: true });
  await submit.scrollIntoViewIfNeeded();
  await expect(submit).toBeInViewport();
  await expect(page.locator(".home-signature")).toBeInViewport();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollHeight - innerHeight,
    ),
  ).toBeLessThanOrEqual(1);
  // Opening and closing the modal, unlike resizing, intentionally ends its form.
  await page.keyboard.press("Escape");
  await expect(page.locator(".home-login")).toHaveCount(0);
  await page.getByRole("button", { name: "Menu utilisateur", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Fermer Menu utilisateur" }),
  ).toBeInViewport();
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: "Menu utilisateur", exact: true })
    .click();
  // Mobile keyboards can shrink the visual viewport without changing layout height.
  await page.evaluate(() =>
    document.documentElement.style.setProperty("--app-height", "360px"),
  );
  const close = (await page
    .getByRole("button", { name: "Fermer Menu utilisateur" })
    .boundingBox())!;
  expect(close.y + close.height).toBeLessThanOrEqual(360);
  expect(
    (await page.locator(".account-dialog").boundingBox())!.height,
  ).toBeLessThanOrEqual(312);
});
