import Link from "next/link";
import { DateTime } from "luxon";
import ProjectSupport from "./ProjectSupport";
import type { PublicState } from "./common";

export default function PublicFooter({
  state,
  version,
  compact = false,
}: {
  state: PublicState | null;
  version: string;
  compact?: boolean;
}) {
  return (
    <footer className={compact ? "home-signature" : undefined}>
      <nav
        className={compact ? "home-footer-links" : "site-footer-links"}
        aria-label="Informations légales"
      >
        <Link href="/terms">
          {compact ? "Conditions" : "Conditions d’utilisation"}
        </Link>
        <Link href="/privacy">
          {compact ? "Confidentialité" : "Politique de confidentialité"}
        </Link>
        <Link href="/guidelines">Bonnes pratiques</Link>
        <Link href="/legal">Mentions légales</Link>
        <ProjectSupport settings={state?.projectLinks} />
      </nav>
      <Link href="/about">
        {state?.contents?.["footer.signature"] ??
          "Une expérience DomotiK Studio"}
      </Link>
      <span className={compact ? "home-version" : undefined}>
        Halloween Map · {version}
      </span>
      {!compact && (
        <span>
          ©{" "}
          {
            DateTime.now().setZone(state?.instance?.timezone ?? "Europe/Paris")
              .year
          }{" "}
          DomotiK Studio
        </span>
      )}
    </footer>
  );
}
