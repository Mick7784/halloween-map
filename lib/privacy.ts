// Public, explicitly allowed fields only; never expose the instance config.
export type PrivacySettings = {
  intro?: string;
  accountRetention?: string;
  participationRetention?: string;
  routeRetention?: string;
  contactEmail?: string;
  policyUrl?: string;
};
export function publicPrivacySettings(value: unknown): PrivacySettings {
  if (!value || typeof value !== "object") return {};
  const input = value as Record<string, unknown>;
  const result: PrivacySettings = {};
  for (const key of [
    "intro",
    "accountRetention",
    "participationRetention",
    "routeRetention",
  ] as const) {
    if (typeof input[key] === "string" && input[key].trim())
      result[key] = input[key].trim().slice(0, 600);
  }
  if (
    typeof input.contactEmail === "string" &&
    /^[^\s@?&#]+@[^\s@?&#]+\.[^\s@?&#]+$/.test(input.contactEmail.trim())
  )
    result.contactEmail = input.contactEmail.trim();
  if (typeof input.policyUrl === "string") {
    try {
      const url = new URL(input.policyUrl);
      if (url.protocol === "https:" && !url.username && !url.password)
        result.policyUrl = url.href;
    } catch {
      /* Default to the existing /privacy page. */
    }
  }
  return result;
}
