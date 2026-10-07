import { afterEach, expect, it, vi } from "vitest";
import {
  frenchAddressReverse,
  frenchAddressSearch,
  frenchCommunes,
} from "../lib/french-address";
import {
  publicParticipationSettings,
  participationStatus,
  parseStoredAddress,
} from "../lib/participation-settings";
afterEach(() => vi.unstubAllGlobals());
it("prefills stored address parts without guessing a commune or confirming a point", () => {
  expect(parseStoredAddress("12 bis Rue de la République, 69002 Lyon")).toEqual(
    {
      number: "12 bis",
      street: "Rue de la République",
      postalCode: "69002",
      city: "Lyon",
      cityCode: "",
    },
  );
  expect(parseStoredAddress("12 A Rue des Lanternes")).toMatchObject({
    number: "12 A",
    street: "Rue des Lanternes",
    postalCode: "",
    cityCode: "",
  });
});
function provider() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (value: URL) => {
      const url = new URL(value);
      const arrondissement = {
        nom: "Lyon 2e Arrondissement",
        code: "69382",
        codesPostaux: ["69002"],
        type: "arrondissement-municipal",
        codeParent: "69123",
      };
      if (url.hostname === "geo.api.gouv.fr")
        return Response.json([
          {
            nom: "Lyon",
            code: "69123",
            codesPostaux: ["69002"],
            type: "commune-actuelle",
          },
          arrondissement,
        ]);
      return Response.json({
        features: [
          {
            properties: {
              label: "12 Rue de la République 69002 Lyon",
              street: "Rue de la République",
              housenumber: "12",
              postcode: "69002",
              citycode: "69382",
              city: "Lyon",
            },
            geometry: { coordinates: [4.8358, 45.7651] },
          },
        ],
      });
    }),
  );
}
it("uses official French arrondissement codes consistently and rejects a foreign point", async () => {
  provider();
  expect(await frenchCommunes("69002")).toEqual([
    { nom: "Lyon 2e Arrondissement", code: "69382", codesPostaux: ["69002"] },
  ]);
  expect(
    (await frenchAddressSearch("12 rue de la République", "69002", "69382"))[0]
      .city,
  ).toBe("Lyon 2e Arrondissement");
  expect((await frenchAddressReverse(45.7651, 4.8358)).cityCode).toBe("69382");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (value: URL) =>
      new URL(value).hostname === "geo.api.gouv.fr"
        ? Response.json([])
        : Response.json({ features: [] }),
    ),
  );
  await expect(frenchAddressReverse(51.5, -0.1)).rejects.toThrow(
    "Aucune adresse française",
  );
});
it("limits and projects future public settings without exposing secrets or inventing moderation", () => {
  const settings = publicParticipationSettings({
    descriptionLimit: 500,
    practicalLimit: 1000,
    activities: ["CANDY", "INVALID"],
    allowedCommuneCodes: ["69382", "foreign"],
    secret: "hidden",
  });
  expect(settings.descriptionLimit).toBe(180);
  expect(settings.practicalLimit).toBe(300);
  expect(settings.activities).toEqual(["CANDY"]);
  expect(settings.allowedCommuneCodes).toEqual(["69382"]);
  expect(settings).not.toHaveProperty("secret");
  expect(participationStatus({ status: "HIDDEN" }).label).toBe(
    "Participation enregistrée",
  );
  expect(
    participationStatus({ status: "HIDDEN", review_status: "REFUSED" }).label,
  ).toBe("Refusée");
});
