import { expect, it } from "vitest";
import { publicPrivacySettings } from "../lib/privacy";
it("supersedes obsolete secondary anonymous-only summaries without editing the published policy", () => {
  const policyBody = "Document publié administré";
  const result = publicPrivacySettings({
    participationRetention:
      "Après purge, seuls des totaux anonymes sont conservés.",
    policyBody,
  });
  expect(result.participationRetention).toContain("cinq ans");
  expect(result.participationRetention).toContain("supprimer le compte");
  expect(result.policyBody).toBe(policyBody);
});
it("exposes only public privacy settings and accepts real contact and HTTPS policy", () => {
  expect(
    publicPrivacySettings({
      contactEmail: " contact@example.invalid ",
      policyUrl: "https://example.invalid/privacy",
      accountRetention: " Conservation administrée. ",
      smtpPassword: "secret",
      password_hash: "private",
    }),
  ).toEqual({
    contactEmail: "contact@example.invalid",
    policyUrl: "https://example.invalid/privacy",
    accountRetention: "Conservation administrée.",
  });
});
it("rejects unsafe or incomplete contact and policy links", () => {
  for (const policyUrl of [
    "javascript:alert(1)",
    "http://example.invalid",
    "https://user:password@example.invalid",
    "invalid",
  ])
    expect(
      publicPrivacySettings({
        policyUrl,
        contactEmail: "contact@example.invalid?subject=spoofed",
      }),
    ).toEqual({});
});
it("uses empty settings for an unconfigured or invalid source", () => {
  for (const source of [
    null,
    undefined,
    "",
    { contactEmail: "not-an-email", accountRetention: 42 },
  ])
    expect(publicPrivacySettings(source)).toEqual({});
});
