import { vi } from "vitest";
export const addressParts = {
  number: "12",
  street: "Rue des Lanternes",
  postalCode: "35000",
  city: "Rennes",
  cityCode: "35238",
};
export function installFrenchAddressFixture() {
  const original = globalThis.fetch;
  vi.stubGlobal(
    "fetch",
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      if (!["geo.api.gouv.fr", "data.geopf.fr"].includes(url.hostname))
        return original(input, init);
      const lat = Number(url.searchParams.get("lat") ?? 48.1),
        lon = Number(url.searchParams.get("lon") ?? -1.67);
      const nearby = Math.abs(lat - 48.1) < 0.02 && Math.abs(lon + 1.67) < 0.02;
      const commune = {
        nom: "Rennes",
        code: "35238",
        codesPostaux: ["35000"],
        type: "commune-actuelle",
      };
      const data =
        url.hostname === "geo.api.gouv.fr"
          ? (!url.searchParams.has("lat") || nearby) &&
            (!url.searchParams.has("codePostal") ||
              url.searchParams.get("codePostal") === "35000")
            ? [commune]
            : []
          : {
              features: nearby
                ? [
                    {
                      properties: {
                        label: "12 Rue des Lanternes 35000 Rennes",
                        street: addressParts.street,
                        housenumber: "12",
                        postcode: "35000",
                        city: "Rennes",
                        citycode: "35238",
                      },
                      geometry: { coordinates: [lon, lat] },
                    },
                  ]
                : [],
            };
      return Response.json(data);
    },
  );
}
