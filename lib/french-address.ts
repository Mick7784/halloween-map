import { HttpError } from "./auth";
import type { Commune, AddressSuggestion } from "./participation-settings";
async function source(url: URL) {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(6000),
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok) throw new Error();
    return await response.json();
  } catch {
    throw new HttpError(
      503,
      "Recherche d’adresse indisponible. Réessayez dans un instant.",
    );
  }
}
export async function frenchCommunes(postalCode: string): Promise<Commune[]> {
  if (!/^\d{5}$/.test(postalCode))
    throw new HttpError(400, "Saisissez un code postal français à 5 chiffres.");
  const url = new URL("https://geo.api.gouv.fr/communes");
  url.search = new URLSearchParams({
    codePostal: postalCode,
    fields: "nom,code,codesPostaux,type,codeParent",
    type: "commune-actuelle,arrondissement-municipal",
    format: "json",
  }).toString();
  const rows = await source(url);
  const parents = new Set(
    Array.isArray(rows)
      ? rows
          .filter((c) => c.type === "arrondissement-municipal")
          .map((c) => c.codeParent)
      : [],
  );
  return Array.isArray(rows)
    ? rows
        .filter((c) => !parents.has(c.code))
        .filter((c) => c.codesPostaux?.includes(postalCode))
        .map((c) => ({
          code: String(c.code),
          nom: String(c.nom),
          codesPostaux: c.codesPostaux,
        }))
    : [];
}
type Feature = {
  properties: Record<string, string>;
  geometry: { coordinates: number[] };
};
function suggestions(data: { features?: Feature[] }): AddressSuggestion[] {
  return (data.features ?? [])
    .filter(
      (f) =>
        /^\d{5}$/.test(f.properties.postcode ?? "") &&
        /^(?:\d{5}|2[AB]\d{3})$/.test(f.properties.citycode ?? "") &&
        f.geometry?.coordinates?.length === 2 &&
        f.geometry.coordinates.every(Number.isFinite),
    )
    .map((f) => ({
      label: f.properties.label,
      street: f.properties.street ?? f.properties.name,
      number: f.properties.housenumber ?? "",
      postalCode: f.properties.postcode,
      city: f.properties.city,
      cityCode: f.properties.citycode,
      point: f.geometry.coordinates as [number, number],
    }));
}
export async function frenchAddressSearch(
  query: string,
  postalCode: string,
  cityCode: string,
) {
  if (
    query.trim().length < 3 ||
    query.length > 180 ||
    !/^\d{5}$/.test(postalCode) ||
    !/^(?:\d{5}|2[AB]\d{3})$/.test(cityCode)
  )
    throw new HttpError(400, "Précisez la commune et la rue.");
  const url = new URL("https://data.geopf.fr/geocodage/search");
  url.search = new URLSearchParams({
    q: query,
    index: "address",
    postcode: postalCode,
    citycode: cityCode,
    limit: "6",
  }).toString();
  const communes = await frenchCommunes(postalCode);
  return suggestions(await source(url))
    .map((a) => ({
      ...a,
      city: communes.find((c) => c.code === a.cityCode)?.nom ?? a.city,
    }))
    .filter((a) => a.postalCode === postalCode && a.cityCode === cityCode);
}
export async function frenchAddressReverse(
  latitude: number,
  longitude: number,
) {
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180
  )
    throw new HttpError(400, "Point invalide.");
  const url = new URL("https://data.geopf.fr/geocodage/reverse");
  url.search = new URLSearchParams({
    lat: String(latitude),
    lon: String(longitude),
    index: "address",
    limit: "1",
  }).toString();
  const boundary = new URL("https://geo.api.gouv.fr/communes");
  boundary.search = new URLSearchParams({
    lat: String(latitude),
    lon: String(longitude),
    type: "commune-actuelle,arrondissement-municipal",
    fields: "nom,code,codesPostaux,type,codeParent",
  }).toString();
  const [geocoded, areas] = await Promise.all([source(url), source(boundary)]);
  const a = suggestions(geocoded)[0];
  if (
    !a ||
    !Array.isArray(areas) ||
    !areas.length ||
    Math.hypot(
      (a.point[0] - longitude) * Math.cos((latitude * Math.PI) / 180),
      a.point[1] - latitude,
    ) *
      111320 >
      1000
  )
    throw new HttpError(
      400,
      "Aucune adresse française proche de ce point. Vérifiez votre position.",
    );
  const commune =
    areas.find((c) => c.code === a.cityCode) ??
    areas.find((c) => c.type === "arrondissement-municipal") ??
    areas[0];
  return { ...a, cityCode: commune.code, city: commune.nom };
}
