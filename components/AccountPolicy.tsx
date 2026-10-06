import { DateTime } from "luxon";
import { LockKeyhole } from "lucide-react";
import { legalDefaults } from "../lib/legal-defaults";
import { publicPrivacySettings } from "../lib/privacy";
import type { PublicState } from "./common";
import Editorial from "./Editorial";

export default function AccountPolicy({ state }: { state: PublicState }) {
  const settings = publicPrivacySettings(state.privacy);
  const document = state.documents?.PRIVACY;
  const configured = !!settings.policyBody;
  const body =
    settings.policyBody ?? document?.body ?? legalDefaults.PRIVACY.body;
  const published = document?.published_at
    ? DateTime.fromISO(document.published_at).setLocale("fr")
    : null;
  return (
    <section className="account-card account-policy">
      <h2 tabIndex={-1}>
        <LockKeyhole size={20} />
        {document?.title ?? legalDefaults.PRIVACY.title}
      </h2>
      {!configured && document?.version && (
        <p className="account-policy-meta">
          Version {document.version}
          {published?.isValid
            ? ` · publiée le ${published.toFormat("d LLLL yyyy")}`
            : ""}
        </p>
      )}
      <Editorial text={body} />
    </section>
  );
}
