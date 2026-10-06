import { test, expect, type Page } from "@playwright/test";
const output =
  process.env.PARTICIPATION_PREVIEW_OUTPUT ?? "test-results/participation";
const address = {
  postalCode: "69002",
  city: "Lyon 2e Arrondissement",
  cityCode: "69382",
  number: "12 bis",
  street: "Rue de la République",
};
const suggestion = {
  ...address,
  label: "12 bis Rue de la République 69002 Lyon",
  point: [4.8358, 45.7651],
};
const house = {
  id: "house",
  name: "Ma Maison Hantée",
  address: "12 bis Rue de la République, 69002 Lyon",
  address_parts: address,
  latitude: 45.7651,
  longitude: 4.8358,
  activities: ["CANDY", "ACTING"],
  starts_at: "2026-10-31T17:00:00Z",
  ends_at: "2026-10-31T20:30:00Z",
  fear: 3,
  adaptable: false,
  rp: "Une ambiance familiale et quelques surprises.",
  practical: "Portail blanc.",
  status: "VISIBLE",
  activity: "ACTIVE",
  candy_available: true,
};
async function arrange(page: Page, edit = false, candyOnly = false) {
  let current: Record<string, unknown> | null = edit
    ? { ...house, activities: candyOnly ? ["CANDY"] : [...house.activities] }
    : null;
  const calls: { path: string; body: Record<string, unknown> }[] = [];
  await page.route("**/api/me", (r) =>
    r.fulfill({
      json: {
        id: "user",
        display_name: "Visiteur",
        email: "visiteur@example.invalid",
        email_status: "VERIFIED",
        permissions: [],
        role_name: "USER",
      },
    }),
  );
  await page.route("**/api/public*", (r) =>
    r.fulfill({
      json: {
        setupRequired: false,
        state: "COUNTDOWN",
        count: 25,
        houses: [],
        routeCandidates: [],
        contents: {},
        instance: {
          public_name: "Halloween",
          territory: "Lyon",
          timezone: "Europe/Paris",
          longitude: 4.8358,
          latitude: 45.7651,
          zoom: 14,
        },
        season: {
          opens_at: "2026-10-31T17:00:00Z",
          closes_at: "2026-10-31T22:00:00Z",
          registrations_open: true,
        },
        documents: {
          TERMS: {
            version: "2026.1",
            title: "Conditions",
            body: "Respectez vos visiteurs.",
          },
          GUIDELINES: {
            version: "2026.1",
            title: "Bonnes pratiques",
            body: "Gardez les accès dégagés.",
          },
        },
      },
    }),
  );
  await page.route("**/api/house", async (r) => {
    if (r.request().method() === "GET") return r.fulfill({ json: current });
    const body = r.request().postDataJSON();
    calls.push({ path: "house", body });
    current = { ...current, ...body };
    return r.fulfill({ json: { ok: true } });
  });
  await page.route("**/api/participation", (r) => {
    const body = r.request().postDataJSON();
    calls.push({ path: "participation", body });
    current = { ...house, ...body.house };
    return r.fulfill({ json: { ok: true } });
  });
  await page.route("**/api/participant", (r) => {
    const body = r.request().postDataJSON();
    calls.push({ path: "participant", body });
    if (body.action === "delete") current = null;
    else if (current) {
      if (body.action === "deplete") {
        current.candy_available = false;
        if (body.choice === "close") current.activity = "ENDED";
      }
      if (body.action === "end") current.activity = "ENDED";
    }
    return r.fulfill({ json: { ok: true } });
  });
  await page.route("**/api/location*", (r) => {
    const url = new URL(r.request().url()),
      mode = url.searchParams.get("mode");
    return r.fulfill({
      json:
        mode === "communes"
          ? [
              {
                nom: address.city,
                code: address.cityCode,
                codesPostaux: [address.postalCode],
              },
            ]
          : mode === "search"
            ? [suggestion]
            : suggestion,
    });
  });
  await page.route("https://basemaps.cartocdn.com/**", (r) =>
    r.fulfill({
      json: {
        version: 8,
        sources: {},
        layers: [
          {
            id: "night",
            type: "background",
            paint: { "background-color": "#171a23" },
          },
        ],
      },
    }),
  );
  await page.goto("/");
  await page
    .getByRole("button", { name: "Menu utilisateur", exact: true })
    .click();
  await page
    .getByRole("link", {
      name: edit ? "Ma participation" : "Inscrire ma maison",
      exact: true,
    })
    .click();
  await expect(page.locator(".participation-dialog")).toBeVisible();
  await expect(page.locator("#participation-form")).toBeVisible();
  await page.locator(".participation-overlay").evaluate(async (el) => {
    await Promise.all(
      el.getAnimations({ subtree: true }).map((a) => a.finished),
    );
  });
  if (edit)
    await expect(
      page.getByRole("button", { name: "Point de ma maison", exact: true }),
    ).toBeVisible();
  return calls;
}
for (const width of [390, 1440]) {
  test(`create participation, location, fear and exact context ${width}`, async ({
    page,
    context,
  }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation({
      latitude: 45.7651,
      longitude: 4.8358,
      accuracy: 8,
    });
    const calls = await arrange(page);
    const dialog = page.locator(".participation-dialog");
    await expect(page).toHaveURL(/\/$/);
    await expect(
      page.getByRole("button", {
        name: "Envoyer ma participation",
        exact: true,
      }),
    ).toBeDisabled();
    await page
      .getByLabel("Code postal", { exact: false })
      .fill(address.postalCode);
    await expect(page.getByLabel("Ville", { exact: false })).toHaveValue(
      address.cityCode,
    );
    await page.getByLabel("Numéro", { exact: false }).fill("12 bis");
    await page.getByLabel("Rue", { exact: false }).fill(address.street);
    await page
      .getByRole("button", { name: suggestion.label, exact: false })
      .click();
    await page
      .getByRole("button", { name: "Placer manuellement", exact: true })
      .click();
    const map = page.locator(".participation-map-canvas");
    await map.click({ position: { x: 100, y: 100 } });
    await page
      .getByRole("button", {
        name: "Confirmer le point de ma maison",
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("button", { name: "Point confirmé", exact: true }),
    ).toBeVisible();
    await page
      .getByLabel("Nom de la maison", { exact: false })
      .fill("Le jardin des petits fantômes");
    await page
      .getByRole("checkbox", { name: "Mise en scène", exact: true })
      .check();
    const fear = page.getByRole("slider", { name: "Niveau de frayeur" });
    await fear.fill("4");
    await page
      .getByRole("switch", { name: "Je m’adapte à mes visiteurs", exact: true })
      .check();
    await expect(fear).toBeDisabled();
    await page.getByRole("switch").uncheck();
    await expect(fear).toHaveValue("4");
    const description = "Une ambiance douce et mystérieuse.";
    await page.locator('textarea[name="rp"]').fill(description);
    await expect(dialog).toContainText(`${description.length} / 180`);
    await expect(
      page.getByRole("button", {
        name: "Envoyer ma participation",
        exact: true,
      }),
    ).toBeDisabled();
    await expect(
      page.locator(".participation-consent input[type=checkbox]"),
    ).toHaveCount(1);
    await expect(
      page.getByText("Avant de participer", { exact: true }),
    ).toHaveCount(0);
    await page
      .getByRole("button", { name: "bonnes pratiques", exact: true })
      .click();
    await expect(
      page.getByRole("dialog", { name: "Bonnes pratiques", exact: true }),
    ).toContainText("Gardez les accès dégagés.");
    await page
      .getByRole("button", { name: "Retour au formulaire", exact: true })
      .click();
    await expect(
      page.getByRole("checkbox", { name: /J’ai pris connaissance/ }),
    ).not.toBeChecked();
    await page
      .getByRole("checkbox", { name: /J’ai pris connaissance/ })
      .check();
    await page.screenshot({
      animations: "disabled",
      path: `${output}/creation-${width}.png`,
    });
    await page
      .getByRole("button", { name: "Envoyer ma participation", exact: true })
      .click();
    await expect(
      dialog.getByRole("heading", { name: "Ma participation", exact: true }),
    ).toBeVisible();
    expect(calls[0].path).toBe("participation");
    expect(calls[0].body.acceptance).toEqual({
      mode: "GUIDELINES_ONLY",
      guidelines: true,
      guidelines_version: "2026.1",
    });
    expect(
      (calls[0].body.house as Record<string, unknown>).address_parts,
    ).toEqual(address);
    await expect(page.locator("input[name=name]")).toHaveValue(
      "Le jardin des petits fantômes",
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollHeight <= innerHeight + 1,
      ),
    ).toBe(true);
    await page.getByRole("button", { name: "Fermer ma participation" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator(".home-center")).toBeVisible();
  });
  test(`edit, save and quick confirmations ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    const calls = await arrange(page, true);
    await expect(page.locator("input[name=name]")).toHaveValue(house.name);
    await expect(page.locator(".participation-status-badge")).toHaveText(
      "Validée",
    );
    await page.screenshot({
      animations: "disabled",
      path: `${output}/edition-${width}.png`,
    });
    await page
      .getByRole("button", { name: "Modifier mes horaires", exact: true })
      .click();
    await expect(page.locator("input[name=starts_at]")).toBeFocused();
    await page.locator("input[name=name]").fill("Les lanternes du jardin");
    await page
      .getByRole("button", {
        name: "Enregistrer les modifications",
        exact: true,
      })
      .click();
    await expect(page.getByRole("status")).toContainText(
      "Modifications enregistrées",
    );
    await page
      .getByRole("button", { name: "Je n’ai plus de bonbons", exact: true })
      .click();
    expect(calls.filter((c) => c.path === "participant")).toHaveLength(0);
    await page.getByRole("button", { name: "Annuler", exact: true }).click();
    expect(calls.filter((c) => c.path === "participant")).toHaveLength(0);
    await page
      .getByRole("button", { name: "Je n’ai plus de bonbons", exact: true })
      .click();
    await page
      .getByRole("button", {
        name: "Continuer à accueillir sans bonbons",
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("button", {
        name: "Je n’ai plus de bonbons",
        exact: true,
      }),
    ).toHaveCount(0);
    expect(calls.at(-1)?.body).toEqual({
      action: "deplete",
      choice: "continue",
    });
    await page
      .getByRole("button", { name: "Terminer mon activité", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .last()
      .getByRole("button", { name: "Terminer mon activité", exact: true })
      .click();
    await expect(page.locator(".participation-status")).toContainText(
      "Votre accueil est terminé",
    );
    await page
      .getByRole("button", { name: "Supprimer ma participation", exact: true })
      .click();
    await page.getByRole("button", { name: "Annuler", exact: true }).click();
    expect(calls.some((c) => c.body.action === "delete")).toBe(false);
    await page
      .getByRole("button", { name: "Supprimer ma participation", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Supprimer définitivement", exact: true })
      .click();
    await expect(page.locator(".participation-dialog")).toHaveCount(0);
    expect(calls.at(-1)?.body).toEqual({
      action: "delete",
      confirm: "SUPPRIMER",
    });
  });
}
test("GPS resolves a French address and requires explicit point confirmation", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({
    latitude: 45.7651,
    longitude: 4.8358,
    accuracy: 8,
  });
  await arrange(page);
  await page.getByRole("button", { name: "Me localiser", exact: true }).click();
  await expect(page.getByLabel("Code postal", { exact: false })).toHaveValue(
    address.postalCode,
  );
  await expect(page.getByLabel("Ville", { exact: false })).toHaveValue(
    address.cityCode,
  );
  await expect(
    page.getByRole("button", { name: "Envoyer ma participation", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", {
      name: "Confirmer le point de ma maison",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("button", { name: "Point confirmé", exact: true }),
  ).toBeVisible();
});
test("candy alone offers confirmed closing only", async ({ page }) => {
  const calls = await arrange(page, true, true);
  await page
    .getByRole("button", { name: "Je n’ai plus de bonbons", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Continuer à accueillir sans bonbons",
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Annuler la confirmation", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(
    page.getByRole("button", { name: "Annuler", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.locator(".participation-confirm")).toHaveCount(0);
  expect(calls.filter((c) => c.path === "participant")).toHaveLength(0);
  await page
    .getByRole("button", { name: "Je n’ai plus de bonbons", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Fermer ma maison", exact: true })
    .click();
  await expect(page.locator(".participation-status")).toContainText(
    "Votre accueil est terminé",
  );
});
test("late address lookup never replaces an adjusted point and save errors retain values", async ({
  page,
}) => {
  await arrange(page, true);
  await page
    .getByRole("button", { name: "Placer manuellement", exact: true })
    .click();
  await page.locator(".participation-coordinates summary").click();
  await page.getByLabel("Latitude", { exact: true }).fill("45.7659");
  await page
    .getByLabel("Rue", { exact: false })
    .fill("Rue de la République nouvelle");
  await page
    .getByRole("button", { name: suggestion.label, exact: false })
    .click();
  await expect(page.getByLabel("Latitude", { exact: true })).toHaveValue(
    "45.7659",
  );
  await page
    .getByRole("button", {
      name: "Confirmer le point de ma maison",
      exact: true,
    })
    .click();
  await page.route("**/api/house", (r) =>
    r.request().method() === "POST"
      ? r.fulfill({
          status: 400,
          json: { error: "Les horaires doivent rester dans la saison." },
        })
      : r.fulfill({ json: house }),
  );
  await page.locator("input[name=name]").fill("Nom conservé après erreur");
  await page
    .getByRole("button", { name: "Enregistrer les modifications", exact: true })
    .click();
  await expect(
    page.locator(".participation-dialog").getByRole("alert"),
  ).toContainText("Les horaires");
  await expect(page.locator("input[name=name]")).toHaveValue(
    "Nom conservé après erreur",
  );
});
