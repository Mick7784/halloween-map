import { test, expect, type Page } from "@playwright/test";
import { DateTime } from "luxon";
import { mapAccessible, seasonState, type Activity } from "../lib/domain";
import {
  realSeasonFixture,
  assertOpenRealFixture,
} from "./fixtures/real-season";
const season = realSeasonFixture({
  opensIn: 2 * 86400000,
  closesIn: 3 * 86400000,
});
const purgeLabel = DateTime.fromISO(season.purge_at)
  .setZone("Europe/Paris")
  .setLocale("fr");
const output = process.env.ACCOUNT_PREVIEW_OUTPUT ?? "test-results/account";
const person = {
  id: "account-user",
  instance_id: season.instance_id,
  account_status: "ACTIVE",
  display_name: "Mickael",
  email: "mickael@example.invalid",
  role_name: "ADMIN",
  permissions: ["admin.access"],
  email_status: "VERIFIED",
};
const state = {
  setupRequired: false,
  state: seasonState(season),
  mapAccessible: mapAccessible(season),
  count: 24,
  instance: {
    id: season.instance_id,
    active_season_id: season.id,
    public_name: "Halloween",
    territory: "Villiers-sur-Morin",
    timezone: "Europe/Paris",
    latitude: 48.8,
    longitude: 2.8,
    zoom: 14,
  },
  season,
  houses: [],
  routeCandidates: [],
  contents: {
    "privacy.account":
      "Votre compte est conservé pour les prochaines éditions. Les données de votre maison sont supprimées à la purge.",
  },
  documents: {
    PRIVACY: {
      title: "Politique de confidentialité",
      version: "1",
      body: "Votre compte est durable. La participation est éphémère.",
    },
  },
};
async function arrange(page: Page, path = "/", unverified = false) {
  const user = {
    ...person,
    ...(unverified ? { email_status: "UNVERIFIED" } : {}),
  };
  await page.route("**/api/public*", (r) => r.fulfill({ json: state }));
  await page.route("**/api/me", (r) => r.fulfill({ json: user }));
  await page.route("**/api/house", (r) => r.fulfill({ json: null }));
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
  const calls: Record<string, string>[] = [];
  await page.route("**/api/account", (r) => {
    const input = r.request().postDataJSON();
    calls.push(input);
    if (input.action === "name") user.display_name = input.display_name.trim();
    if (input.action === "email") {
      user.email = input.email.trim().toLowerCase();
      user.email_status = "UNVERIFIED";
    }
    return r.fulfill({ json: { ok: true } });
  });
  await page.goto(path);
  await expect(
    page.getByRole("button", { name: "Menu utilisateur", exact: true }),
  ).toBeVisible();
  return calls;
}
async function open(page: Page) {
  await page
    .getByRole("button", { name: "Menu utilisateur", exact: true })
    .click();
  await page.getByRole("link", { name: "Mon compte", exact: true }).click();
  await expect(page.locator(".account-dialog")).toBeVisible();
  await page.locator(".account-overlay").evaluate(async (el) => {
    await Promise.all(
      el.getAnimations({ subtree: true }).map((a) => a.finished),
    );
  });
}
for (const size of [
  { width: 360, height: 640 },
  { width: 390, height: 844 },
  { width: 820, height: 1180 },
  { width: 1440, height: 900 },
]) {
  test(`contextual layout, focus and closing ${size.width}`, async ({
    page,
  }) => {
    await page.setViewportSize(size);
    await arrange(page);
    await open(page);
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("dialog")).toHaveCount(1);
    await expect(page.getByRole("dialog")).toContainText("Administrateur");
    await expect(page.getByRole("dialog")).not.toContainText(
      "Ma participation",
    );
    await expect(
      page.getByRole("button", { name: "Fermer Mon compte" }),
    ).toBeFocused();
    const rect = (await page.locator(".account-dialog").boundingBox())!;
    if (size.width < 768) {
      expect(rect.height).toBe(size.height);
      expect(rect.width).toBe(size.width);
      await expect(
        page.getByRole("button", { name: /Mes informations/ }),
      ).toBeVisible();
    } else {
      expect(rect.height).toBeLessThanOrEqual(size.height * 0.85 + 1);
      await expect(page.getByLabel("Nom d’affichage")).toBeVisible();
      await expect(
        page.getByLabel("Nouveau mot de passe", { exact: true }),
      ).toBeVisible();
    }
    await page.mouse.wheel(0, 600);
    expect(await page.evaluate(() => scrollY)).toBe(0);
    await page.locator(".account-scroll").evaluate((el) => (el.scrollTop = 0));
    await page.screenshot({ path: `${output}/mon-compte-${size.width}.png` });
    await page.keyboard.press("Escape");
    await expect(page.locator(".account-dialog")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Menu utilisateur", exact: true }),
    ).toBeFocused();
    await expect(page.locator(".home-reference")).toBeVisible();
    expect(await page.evaluate(() => document.body.style.overflow)).toBe("");
  });
}
test("mobile information, security, verification, privacy and deletion confirmation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const calls = await arrange(page, "/", true);
  await open(page);
  await page.getByRole("button", { name: /Mes informations/ }).click();
  await page.getByLabel("Nom d’affichage").fill("Mickael Martin");
  await page
    .getByRole("button", { name: "Enregistrer les modifications" })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Modifications enregistrées",
  );
  await page.getByRole("button", { name: "Renvoyer la vérification" }).click();
  await expect(page.getByRole("status").last()).toContainText(
    "vérification programmé",
  );
  await page.getByRole("button", { name: "Revenir à Mon compte" }).click();
  await expect(page.locator(".account-identity")).toContainText(
    "Mickael Martin",
  );
  await page.getByRole("button", { name: /Mot de passe Modifier/ }).click();
  await page
    .getByLabel("Mot de passe actuel", { exact: true })
    .fill("current-password-123");
  await page
    .getByLabel("Nouveau mot de passe", { exact: true })
    .fill("new-password-1234");
  await page
    .getByLabel("Confirmation du nouveau mot de passe", { exact: true })
    .fill("different-password");
  await page
    .getByRole("button", { name: "Modifier le mot de passe", exact: true })
    .click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "ne correspondent pas",
  );
  expect(calls.filter((c) => c.action === "password")).toHaveLength(0);
  await page
    .getByLabel("Confirmation du nouveau mot de passe", { exact: true })
    .fill("new-password-1234");
  await page
    .getByRole("button", { name: "Afficher nouveau mot de passe", exact: true })
    .click();
  await expect(
    page.getByLabel("Nouveau mot de passe", { exact: true }),
  ).toHaveAttribute("type", "text");
  await page
    .getByRole("button", { name: "Modifier le mot de passe", exact: true })
    .click();
  await expect(page.getByRole("status").first()).toContainText(
    "Mot de passe modifié",
  );
  await page.getByRole("button", { name: "Revenir à Mon compte" }).click();
  await page
    .getByRole("button", { name: /Confidentialité et données/ })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    purgeLabel.toFormat("d MMMM yyyy"),
  );
  await expect(
    page.getByRole("button", { name: /Politique de confidentialité/ }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).not.toContainText(
    "La participation est éphémère",
  );
  await page.getByRole("button", { name: "Revenir à Mon compte" }).click();
  await page
    .getByRole("button", { name: /Supprimer mon compte Action/ })
    .click();
  expect(calls.filter((c) => c.action === "delete")).toHaveLength(0);
  await page
    .getByRole("button", { name: "Supprimer définitivement mon compte" })
    .click();
  expect(calls.filter((c) => c.action === "delete")).toHaveLength(0);
  await page
    .getByLabel("Mot de passe actuel", { exact: true })
    .fill("current-password-123");
  await page
    .getByLabel("Saisissez SUPPRIMER MON COMPTE")
    .fill("SUPPRIMER MON COMPTE");
  await page.getByRole("checkbox").check();
  await page
    .getByRole("button", { name: "Supprimer définitivement mon compte" })
    .click();
  await expect
    .poll(() => calls.filter((c) => c.action === "delete").length)
    .toBe(1);
  await page.getByRole("button", { name: "Annuler" }).click();
  await page.getByRole("button", { name: "Fermer Mon compte" }).click();
  await expect(page.locator(".account-dialog")).toHaveCount(0);
});
test("desktop email change uses current password and keeps context", async ({
  page,
}) => {
  const calls = await arrange(page);
  await open(page);
  await page.getByLabel("Email", { exact: true }).fill("new@example.invalid");
  const current = page
    .locator(".account-forms .account-card")
    .first()
    .getByLabel("Mot de passe actuel", { exact: true });
  await expect(current).toBeVisible();
  await current.fill("current-password-1234");
  await page
    .getByRole("button", { name: "Enregistrer les modifications" })
    .click();
  await expect(page.locator(".account-identity")).toContainText(
    "new@example.invalid",
  );
  expect(calls[0]).toMatchObject({
    action: "email",
    current_password: "current-password-1234",
  });
  await expect(
    page.getByRole("button", { name: "Renvoyer la vérification" }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
});
test("map canvas, filters and active route remain mounted across account", async ({
  page,
}) => {
  await arrange(page, "/map");
  const openSeason = realSeasonFixture({
    instanceId: season.instance_id,
    closesIn: 86400000,
  });
  const house = {
    id: "11111111-1111-4111-8111-111111111111",
    instance_id: openSeason.instance_id,
    season_id: openSeason.id,
    user_id: person.id,
    review_status: "VALIDATED" as const,
    status: "VISIBLE",
    activity: "ACTIVE",
    candy_available: true,
    name: "Les lanternes",
    address: "1 rue des Lanternes",
    latitude: 48.802,
    longitude: 2.802,
    activities: ["CANDY"] as Activity[],
    starts_at: new Date(Date.now() - 3600000).toISOString(),
    ends_at: openSeason.closes_at,
    fear: 2,
    adaptable: false,
    rp: "",
    practical: "",
  };
  assertOpenRealFixture(openSeason, [house], person, openSeason.id);
  await page.route("**/api/public*", (r) =>
    r.fulfill({
      json: {
        ...state,
        state: seasonState(openSeason),
        mapAccessible: mapAccessible(openSeason),
        houses: [house],
        routeCandidates: [house],
        instance: {
          ...state.instance,
          active_season_id: openSeason.id,
        },
        documents: {
          ...state.documents,
          GUIDELINES: {
            title: "Bonnes pratiques",
            version: "1",
            body: "Respecter les lieux.",
          },
        },
        season: openSeason,
      },
    }),
  );
  await page.context().grantPermissions(["geolocation"]);
  await page
    .context()
    .setGeolocation({ latitude: 48.8, longitude: 2.8, accuracy: 10 });
  await page.route("**/api/route/availability*", (r) =>
    r.fulfill({
      json: {
        valid: true,
        checkedAt: new Date().toISOString(),
        steps: [
          { id: house.id, available: true, activities: house.activities },
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
          steps: [
            {
              id: house.id,
              available: true,
              activities: house.activities,
              house,
            },
          ],
        },
      });
    const input = r.request().postDataJSON();
    const arrival = new Date(+new Date(input.start) + 120000).toISOString();
    const departure = new Date(+new Date(input.start) + 420000).toISOString();
    return r.fulfill({
      json: {
        stops: [
          {
            house,
            arrival,
            departure,
            walkingMinutes: 2,
            walkingSeconds: 120,
            distanceMeters: 140,
          },
        ],
        distanceMeters: 140,
        walkingMinutes: 2,
        durationMinutes: 7,
        estimatedEnd: departure,
        geometry: [
          [2.8, 48.8],
          [2.802, 48.802],
        ],
        disclaimer: "Parcours à pied.",
      },
    });
  });
  await page.reload();
  await page
    .getByRole("button", { name: "Préparer ma collecte", exact: true })
    .click();
  const canvas = page.locator("canvas.maplibregl-canvas");
  await expect(canvas).toBeVisible();
  await canvas.evaluate((el) => el.setAttribute("data-preserved", "yes"));
  await page.getByRole("slider", { name: "Niveau de frayeur" }).fill("3");
  await page.getByRole("button", { name: "Me localiser", exact: true }).click();
  await page.getByRole("checkbox", { name: /J’ai pris connaissance/ }).check();
  await page
    .getByRole("button", { name: "Préparer ma collecte", exact: true })
    .click();
  await expect(page.locator(".route-sheet")).toBeVisible();
  const read = () =>
    page.evaluate(() =>
      JSON.parse(localStorage.getItem("halloween.active-route")!),
    );
  // Wait for this fixture’s fitBounds result, not a snapshot midway through its animation.
  await expect.poll(async () => (await read())?.camera?.zoom).toBe(16);
  await page
    .getByRole("button", { name: "Commencer ma collecte", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "J’ai compris — commencer ma collecte",
      exact: true,
    })
    .click();
  const resultBefore = await page.locator(".route-sheet").textContent();
  const routeBefore = await read();
  await page.locator(".route-account-link").click();
  await expect(page.locator(".account-dialog")).toBeVisible();
  await page.getByRole("button", { name: "Fermer Mon compte" }).click();
  await expect(page.locator(".account-dialog")).toHaveCount(0);
  await expect(canvas).toHaveAttribute("data-preserved", "yes");
  await expect(page.locator(".route-sheet")).toHaveText(resultBefore!);
  expect((await read()).camera).toEqual(routeBefore.camera);
  expect((await read()).parameters).toEqual(routeBefore.parameters);
  await expect(page).toHaveURL(/\/map$/);
});

test("account native PWA offer and installed hiding", async ({ page }) => {
  await arrange(page);
  await page.evaluate(() => {
    const event = new Event("beforeinstallprompt", { cancelable: true });
    Object.assign(event, {
      prompt: async () => {
        document.body.dataset.installCalls = "1";
      },
      userChoice: Promise.resolve({ outcome: "accepted" }),
    });
    window.dispatchEvent(event);
  });
  await open(page);
  const install = page.locator(".account-install .install-cta");
  await install.click();
  await expect(page.locator("body")).toHaveAttribute("data-install-calls", "1");
  await expect(install).toHaveCount(0);
});
for (const installed of [false, true]) {
  test(`account iOS floating help and standalone ${installed}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript((value) => {
      Object.defineProperty(navigator, "userAgent", {
        value:
          "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1",
      });
      Object.defineProperty(navigator, "standalone", { value });
    }, installed);
    await arrange(page);
    await open(page);
    const install = page.locator(".account-install .install-cta");
    if (installed) await expect(install).toHaveCount(0);
    else {
      await install.click();
      await expect(page.locator(".install-help-window")).toContainText(
        "Touchez Partager",
      );
      await expect(page.getByRole("dialog")).toHaveCount(2);
      await page
        .getByRole("button", { name: "Fermer Ajouter à l’écran d’accueil" })
        .click();
      await expect(page.getByRole("dialog")).toHaveCount(1);
      await page.screenshot({
        path: `${output}/mon-compte-ios.png`,
        animations: "disabled",
      });
    }
  });
}
test("reduced motion and direct account URL", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await arrange(page, "/account?created=1&link=expired");
  await expect(page.locator(".account-dialog")).toBeVisible();
  await expect(page.getByRole("dialog")).toContainText("Votre compte est créé");
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "invalide ou expiré",
  );
  expect(
    await page
      .locator(".account-dialog")
      .evaluate((el) => getComputedStyle(el).animationName),
  ).toBe("none");
  await page.getByRole("button", { name: "Fermer Mon compte" }).click();
  await expect(page.locator(".home-reference")).toBeVisible();
  await expect(page.locator(".account-dialog")).toHaveCount(0);
});
test("logout reuses authentication action", async ({ page }) => {
  await arrange(page);
  let logout = 0;
  await page.route("**/api/logout", (r) => {
    logout++;
    return r.fulfill({ json: { ok: true } });
  });
  await open(page);
  await page.getByRole("button", { name: /Se déconnecter/ }).click();
  await expect.poll(() => logout).toBe(1);
  await expect(page).toHaveURL(/\/$/);
});

for (const width of [390, 1440]) {
  test(`privacy real data, contact, same modal and shared deletion ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    const calls = await arrange(page);
    await page.route("**/api/house", (r) =>
      r.fulfill({
        json: {
          name: "Les lanternes",
          address: "1 rue des Lanternes",
          latitude: 48.802,
          longitude: 2.802,
          starts_at: season.opens_at,
          ends_at: new Date(
            +new Date(season.opens_at) + 3 * 3600000,
          ).toISOString(),
          activities: ["CANDY", "DECORATION"],
          rp: "Un jardin de citrouilles.",
          practical: "Entrée par le portail.",
          fear: 2,
          adaptable: true,
          status: "VISIBLE",
          activity: "ACTIVE",
          candy_available: true,
          password_hash: "do-not-display-this",
        },
      }),
    );
    await page.route("**/api/public*", (r) =>
      r.fulfill({
        json: {
          ...state,
          privacy: {
            contactEmail: "organisateur@example.invalid",
            contactSubject: "Halloween Map — Question",
            ...(width === 1440
              ? {
                  policyBody:
                    "## Politique configurée\n\nTexte administré depuis les paramètres.",
                }
              : {}),
            accountRetention:
              "Votre compte reste disponible pour les prochaines éditions.",
          },
        },
      }),
    );
    await page.reload();
    await open(page);
    const dialog = page.locator(".account-dialog");
    await dialog.evaluate((el) => el.setAttribute("data-preserved", "yes"));
    if (width === 1440) {
      await expect(
        page.locator(".account-email-status.is-verified"),
      ).toHaveText("Email vérifié");
      expect(
        await page
          .locator(".account-session button")
          .evaluate((el) => getComputedStyle(el).borderColor),
      ).not.toBe(
        await page
          .locator(".account-danger .account-row")
          .evaluate((el) => getComputedStyle(el).borderColor),
      );
    }
    await page
      .getByRole("button", { name: /Confidentialité et données/ })
      .click();
    await expect(dialog).toHaveAttribute("data-preserved", "yes");
    await expect(page.getByRole("dialog")).toHaveCount(1);
    await expect(dialog).toContainText("Les lanternes");
    await expect(dialog).toContainText(
      `${DateTime.fromISO(season.opens_at).setZone("Europe/Paris").toFormat("HH:mm")} – ${DateTime.fromISO(season.opens_at).setZone("Europe/Paris").plus({ hours: 3 }).toFormat("HH:mm")}`,
    );
    await expect(dialog).toContainText("Bonbons, Décoration");
    await expect(dialog).toContainText("Un jardin de citrouilles");
    await page.locator(".account-participation-details summary").click();
    await expect(
      dialog.getByText("Un jardin de citrouilles.", { exact: true }),
    ).toBeVisible();
    await page.locator(".account-participation-details summary").click();
    await page.locator(".account-scroll").evaluate((el) => (el.scrollTop = 0));
    await expect(dialog).toContainText(
      purgeLabel.toFormat("d MMMM yyyy à HH:mm"),
    );
    await expect(dialog).not.toContainText("do-not-display-this");
    await expect(
      dialog.getByRole("link", { name: /Nous contacter/ }),
    ).toHaveAttribute(
      "href",
      `mailto:organisateur@example.invalid?subject=${encodeURIComponent("Halloween Map — Question")}`,
    );
    await expect(
      dialog.getByRole("button", { name: /Politique de confidentialité/ }),
    ).toBeVisible();
    const accountUrl = page.url();
    await dialog
      .getByRole("button", { name: /Politique de confidentialité/ })
      .click();
    await expect(dialog).toHaveAttribute("data-preserved", "yes");
    await expect(page.getByRole("dialog")).toHaveCount(1);
    await expect(page).toHaveURL(accountUrl);
    await expect(dialog).toContainText(
      width === 1440
        ? "Texte administré depuis les paramètres."
        : state.documents.PRIVACY.body,
    );
    await page.screenshot({
      animations: "disabled",
      path: `${output}/politique-${width}.png`,
    });
    await dialog
      .getByRole("button", { name: "Revenir à Confidentialité et données" })
      .click();
    await expect(dialog).toContainText("Vos données personnelles");
    await page.locator(".account-subview").evaluate(async (el) => {
      await Promise.all(
        el.getAnimations({ subtree: true }).map((a) => a.finished),
      );
    });
    await page.screenshot({ path: `${output}/confidentialite-${width}.png` });
    await page
      .locator(".account-scroll")
      .evaluate((el) => (el.scrollTop = el.scrollHeight));
    await page.screenshot({
      path: `${output}/confidentialite-actions-${width}.png`,
    });
    await dialog
      .getByRole("button", { name: /Supprimer mon compte Action/ })
      .click();
    await expect(dialog).toContainText("Confirmation de suppression");
    expect(calls.filter((c) => c.action === "delete")).toHaveLength(0);
    await dialog.getByRole("button", { name: "Annuler" }).click();
    await dialog
      .getByRole("button", { name: /Confidentialité et données/ })
      .click();
    await dialog.getByRole("button", { name: "Revenir à Mon compte" }).click();
    await expect(dialog).toHaveAttribute("data-preserved", "yes");
    await expect(
      dialog.getByRole("button", { name: /Confidentialité et données/ }),
    ).toBeVisible();
    await dialog.getByRole("button", { name: "Fermer Mon compte" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page).toHaveURL(/\/$/);
  });
}
test("privacy honest fallbacks without house, contact or valid purge date", async ({
  page,
}) => {
  await arrange(page);
  await page.route("**/api/public*", (r) =>
    r.fulfill({
      json: {
        ...state,
        season: { ...state.season, purge_at: "invalid" },
        privacy: { contactEmail: "invalid", policyUrl: "javascript:alert(1)" },
      },
    }),
  );
  await page.reload();
  await open(page);
  await page
    .getByRole("button", { name: /Confidentialité et données/ })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Aucune participation enregistrée");
  await expect(dialog).toContainText("Date non encore disponible");
  await page.locator(".account-contact summary").click();
  await expect(dialog).toContainText("ne sont pas encore renseignées");
  await expect(
    dialog.getByRole("link", { name: /mentions légales/ }),
  ).toHaveAttribute("href", "/legal");
  await expect(
    dialog.getByRole("button", { name: /Politique de confidentialité/ }),
  ).toBeVisible();
  await expect(dialog).not.toContainText("Invalid DateTime");
});
