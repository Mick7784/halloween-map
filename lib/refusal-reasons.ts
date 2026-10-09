export const refusalReasons = {
  ADDRESS: "Adresse incomplète ou incorrecte",
  AREA: "Commune hors de la zone autorisée",
  INFORMATION: "Informations insuffisantes",
  RULES: "Règles de participation non respectées",
  DUPLICATE: "Inscription en doublon",
  OTHER: "Autre motif",
} as const;
export type RefusalCode = keyof typeof refusalReasons;
export function refusalText(code: RefusalCode, details: string) {
  return code === "OTHER"
    ? details.trim()
    : refusalReasons[code] + (details.trim() ? " — " + details.trim() : "");
}
