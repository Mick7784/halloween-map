import type { Activity } from "./domain";
export const participationDefaults = {
  activities: ["DECORATION", "CANDY", "ACTING"] as Activity[],
  fearLabels: ["Très doux", "Familial", "Modéré", "Frissonnant", "Intense"],
  descriptionLimit: 180,
  practicalLimit: 300,
  allowedCommuneCodes: [] as string[],
};
export type ParticipationSettings = typeof participationDefaults;
export type AddressParts = {
  postalCode: string;
  city: string;
  cityCode: string;
  number: string;
  street: string;
};
export type Commune = { code: string; nom: string; codesPostaux: string[] };
export type AddressSuggestion = {
  label: string;
  street: string;
  number: string;
  postalCode: string;
  city: string;
  cityCode: string;
  point: [number, number];
};
export function publicParticipationSettings(
  value: unknown,
): ParticipationSettings {
  const v =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const suppliedActivities = Array.isArray(v.activities) ? v.activities : [];
  const activities = participationDefaults.activities.filter((a) =>
    suppliedActivities.includes(a),
  );
  return {
    activities: activities.length
      ? activities
      : [...participationDefaults.activities],
    fearLabels:
      Array.isArray(v.fearLabels) &&
      v.fearLabels.length === 5 &&
      v.fearLabels.every(
        (s) => typeof s === "string" && s.trim() && s.length < 40,
      )
        ? v.fearLabels.map((s) => (s as string).trim())
        : [...participationDefaults.fearLabels],
    descriptionLimit:
      typeof v.descriptionLimit === "number" &&
      Number.isInteger(v.descriptionLimit) &&
      v.descriptionLimit > 0
        ? Math.min(180, v.descriptionLimit)
        : 180,
    practicalLimit:
      typeof v.practicalLimit === "number" &&
      Number.isInteger(v.practicalLimit) &&
      v.practicalLimit > 0
        ? Math.min(300, v.practicalLimit)
        : 300,
    allowedCommuneCodes: Array.isArray(v.allowedCommuneCodes)
      ? v.allowedCommuneCodes
          .filter(
            (s): s is string =>
              typeof s === "string" && /^(?:\d{5}|2[AB]\d{3})$/.test(s),
          )
          .slice(0, 500)
      : [],
  };
}
export function formatAddress(a: AddressParts) {
  return `${a.number.trim()} ${a.street.trim()}, ${a.postalCode} ${a.city.trim()}`;
}
export function parseStoredAddress(text: string): AddressParts {
  const postal = text.match(/(?:,\s*|\s+)(\d{5})\s+(.+)$/);
  const streetText = postal ? text.slice(0, postal.index).trim() : text.trim();
  const numbered = streetText.match(
    /^(\d+(?:\s*(?:bis|ter|quater)\b|\s+[A-Z]\b)?)\s+(.+)$/i,
  );
  return {
    postalCode: postal?.[1] ?? "",
    city: postal?.[2]?.trim() ?? "",
    cityCode: "",
    number: numbered?.[1] ?? "",
    street: numbered?.[2] ?? streetText,
  };
}
export function participationStatus(h: {
  status: string;
  review_status?: string;
}) {
  if (h.review_status === "PENDING")
    return { label: "En attente", tone: "pending" };
  if (h.review_status === "REFUSED")
    return { label: "Refusée", tone: "refused" };
  if (h.status === "VISIBLE") return { label: "Validée", tone: "valid" };
  return { label: "Participation enregistrée", tone: "pending" };
}
