import { HttpError } from "./auth";
export const variables = [
  "territory",
  "season_year",
  "registration_date",
  "map_open_date",
  "map_close_date",
  "purge_date",
  "house_count",
  "user_name",
  "event_name",
] as const;
export const publicContentVariables = variables.filter(
  (v) => v !== "user_name",
);
export function sanitizeContent(
  value: string,
  allowed: readonly string[] = publicContentVariables,
) {
  if (
    /<\/?[a-z!]|javascript\s*:|data\s*:|vbscript\s*:|[\u0000-\u0008\u000b\u000c\u000e-\u001f]/i.test(
      value,
    )
  )
    throw new HttpError(400, "HTML, scripts et liens non sûrs interdits");
  for (const match of value.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g))
    if (!allowed.includes(match[1]))
      throw new HttpError(400, "Variable non autorisée : " + match[1]);
  for (const match of value.matchAll(/\]\(([^)]+)\)/g))
    if (!/^(https?:\/\/|\/(?!\/)|mailto:)[^\s]*$/i.test(match[1]))
      throw new HttpError(400, "Lien non autorisé");
  return value.trim();
}
