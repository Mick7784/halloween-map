import { DateTime } from "luxon";
import type { House } from "./domain";
import { localISO } from "./domain";
import { houseSchema } from "./validation";
import {
  parseStoredAddress,
  publicParticipationSettings,
  type AddressParts,
  type ParticipationSettings,
} from "./participation-settings";
export type HouseLocationValue = {
  address: AddressParts;
  point: [number, number] | null;
  confirmed: boolean;
};
// Minute-only inputs must stay inside the exact season timestamps.
export function houseScheduleBounds(
  opens: string,
  closes: string,
  zone: string,
) {
  const minute = 60_000;
  const format = (time: number) =>
    DateTime.fromMillis(time).setZone(zone).toFormat("yyyy-MM-dd'T'HH:mm");
  return {
    starts: format(Math.ceil(+new Date(opens) / minute) * minute),
    ends: format(Math.floor(+new Date(closes) / minute) * minute),
  };
}
export function initialHouseLocation(house?: House): HouseLocationValue {
  return {
    address: house?.address_parts ?? parseStoredAddress(house?.address ?? ""),
    point: house ? [Number(house.longitude), Number(house.latitude)] : null,
    confirmed: !!house?.address_parts,
  };
}
export function validateHouseForm(
  input: unknown,
  context: {
    zone: string;
    opens: string;
    closes: string;
    isTest?: boolean;
    adminEdit?: boolean;
    settings?: ParticipationSettings;
  },
) {
  const result = houseSchema.safeParse(input);
  if (!result.success) {
    const fields: Record<string, string> = {
      name: "Nom",
      address: "Adresse",
      address_parts: "Adresse structurée",
      latitude: "Latitude",
      longitude: "Longitude",
      activities: "Activités",
      fear: "Frayeur",
      rp: "Description",
      practical: "Infos pratiques",
      starts_at: "Début",
      ends_at: "Fin",
    };
    throw new Error(
      result.error.issues
        .map((i) => (fields[String(i.path[0])] ?? "Maison") + " : " + i.message)
        .join(" · "),
    );
  }
  const house = result.data;
  if (!house.position_confirmed)
    throw new Error("Vérifiez et confirmez le point de votre maison.");
  const start = +new Date(localISO(house.starts_at, context.zone)),
    end = +new Date(localISO(house.ends_at, context.zone));
  if (end <= start) throw new Error("La fin d’accueil doit suivre le début.");
  if (
    !context.isTest &&
    (start < +new Date(context.opens) || end > +new Date(context.closes))
  )
    throw new Error(
      "Les horaires doivent rester dans la période d’ouverture de la saison.",
    );
  // Admin editing keeps the existing server exception for historical content and activities.
  if (!context.adminEdit) {
    const settings = publicParticipationSettings(context.settings);
    if (house.rp.length > settings.descriptionLimit)
      throw new Error(
        "Raccourcissez la description à " +
          settings.descriptionLimit +
          " caractères.",
      );
    if (house.practical.length > settings.practicalLimit)
      throw new Error(
        "Raccourcissez les informations pratiques à " +
          settings.practicalLimit +
          " caractères.",
      );
    if (
      house.address_parts &&
      settings.allowedCommuneCodes.length &&
      !settings.allowedCommuneCodes.includes(house.address_parts.cityCode)
    )
      throw new Error("Cette commune n’est pas autorisée.");
  }
  return house;
}
