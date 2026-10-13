import Link from "next/link";
import Image from "next/image";
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
  if (compact) {
    return (
      <footer className="home-signature">
        <nav className="home-footer-links" aria-label="Informations légales">
          <Link href="/terms">Conditions d’utilisation</Link>
          <Link href="/privacy">Confidentialité</Link>
          <Link href="/guidelines">Bonnes pratiques</Link>
          <Link href="/legal">Mentions légales</Link>
          <ProjectSupport settings={state?.projectLinks} />
        </nav>
        <Link
          className="home-credit"
          href="/about"
          aria-label="Une création de DomotiK Studio — à propos"
        >
          <Image
            src="/art/dk-original.png"
            width={800}
            height={800}
            alt=""
            aria-hidden="true"
            unoptimized
          />
          <span>
            <small>Une création de</small>
            <strong>DomotiK Studio</strong>
          </span>
        </Link>
        <div className="home-footer-right">
          <span>Halloween Map</span>
          <span className="home-version">{version}</span>
        </div>
      </footer>
    );
  }
  return (
    <footer>
      <nav className="site-footer-links" aria-label="Informations légales">
        <Link href="/terms">Conditions d’utilisation</Link>
        <Link href="/privacy">Politique de confidentialité</Link>
        <Link href="/guidelines">Bonnes pratiques</Link>
        <Link href="/legal">Mentions légales</Link>
        <ProjectSupport settings={state?.projectLinks} />
      </nav>
      <Link href="/about">
        {state?.contents?.["footer.signature"] ?? "Une expérience DomotiK Studio"}
      </Link>
      <span>Halloween Map · {version}</span>
      <span>
        © {DateTime.now().setZone(state?.instance?.timezone ?? "Europe/Paris").year} DomotiK Studio
      </span>
    </footer>
  );
}
