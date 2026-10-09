import { publicPrivacySettings } from "./privacy";
export const projectLinkDefaults = { bugEmail: "domotikpro77@gmail.com" };
export type ProjectLinks = {
  bugEnabled?: boolean;
  supportEnabled?: boolean;
  contactEnabled?: boolean;
  contactEmail?: string;
  contactUrl?: string;
  bugUrl?: string;
  bugEmail: string;
  supportUrl?: string;
};
export function publicProjectLinks(
  value: unknown,
  privacy?: unknown,
): ProjectLinks {
  const input =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const result: ProjectLinks = {
    bugEnabled: input.bugEnabled !== false,
    supportEnabled: input.supportEnabled !== false,
    contactEnabled: input.contactEnabled !== false,
    contactEmail:
      publicPrivacySettings({ contactEmail: input.contactEmail })
        .contactEmail ?? publicPrivacySettings(privacy).contactEmail,
    bugEmail:
      publicPrivacySettings({ contactEmail: input.bugEmail }).contactEmail ??
      publicPrivacySettings(privacy).contactEmail ??
      projectLinkDefaults.bugEmail,
  };
  for (const key of ["bugUrl", "supportUrl", "contactUrl"] as const) {
    if (typeof input[key] !== "string") continue;
    try {
      const url = new URL(input[key]);
      if (url.protocol === "https:" && !url.username && !url.password)
        result[key] = url.href;
    } catch {
      /* Ignore invalid optional destinations. */
    }
  }
  return result;
}
export function bugHref(links: ProjectLinks, version: string) {
  return (
    links.bugUrl ??
    `mailto:${links.bugEmail}?subject=${encodeURIComponent(`Halloween Map ${version} — Signaler un bug`)}&body=${encodeURIComponent("Page concernée :\nAppareil / navigateur :\nProblème rencontré :\nÉtapes pour le reproduire :\n")}`
  );
}
