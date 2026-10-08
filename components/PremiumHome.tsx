"use client";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { DateTime } from "luxon";
import { Menu, House, ArrowRight } from "lucide-react";
import ManorMark from "./ManorMark";
import UserMenu from "./UserMenu";
import ProjectSupport from "./ProjectSupport";
import { publicProjectLinks } from "../lib/project-links";
import { api, AsyncButton, Notice, type PublicState } from "./common";
import type { House as Participation, User } from "../lib/domain";
import "./PremiumHome.css";

export default function PremiumHome({
  state,
  user,
  now,
  version,
  login,
  error,
  onRetry,
}: {
  state: PublicState;
  user: User | null;
  now: number;
  version: string;
  login: ReactNode;
  error: string;
  onRetry: () => Promise<void>;
}) {
  const [menu, setMenu] = useState(false);
  const projectLinks = publicProjectLinks(state.projectLinks, state.privacy);
  const [participation, setParticipation] = useState<Participation | null>(
    null,
  );
  const [participationKnown, setParticipationKnown] = useState(false);
  useEffect(() => {
    let active = true;
    if (user)
      void api<Participation | null>("house")
        .then((h) => {
          if (active) {
            setParticipation(h);
            setParticipationKnown(true);
          }
        })
        .catch(() => {
          if (active) setParticipationKnown(false);
        });
    return () => {
      active = false;
    };
  }, [user]);
  const zone = state.instance?.timezone ?? "Europe/Paris";
  const configured = state.season?.opens_at
    ? DateTime.fromISO(state.season.opens_at).setZone(zone)
    : null;
  const fallback = DateTime.fromMillis(now).setZone(zone).set({
    month: 10,
    day: 31,
    hour: 12,
    minute: 0,
    second: 0,
    millisecond: 0,
  });
  const opening = configured?.isValid
    ? configured
    : fallback.toMillis() > now
      ? fallback
      : fallback.plus({ years: 1 });
  const closed = ["CLOSED", "ARCHIVED"].includes(state.state ?? "");
  const open = state.state === "MAP_OPEN";
  const remaining = Math.max(0, opening.toMillis() - now);
  const clock = [
    Math.floor(remaining / 86400000),
    Math.floor(remaining / 3600000) % 24,
    Math.floor(remaining / 60000) % 60,
    Math.floor(remaining / 1000) % 60,
  ];
  const count = state.count ?? 0;
  const canRegister = state.season?.registrations_open ?? false;
  const cta = participation
    ? { label: "Ma participation", href: "/participant" }
    : closed
      ? { label: "Mon compte", href: user ? "/account" : "/register" }
      : open
        ? {
            label: user ? "Découvrir la carte" : "Se connecter",
            href: user ? "/map" : "/login",
          }
        : canRegister
          ? {
              label: "Inscrire ma maison",
              href: user ? "/participant" : "/register",
            }
          : {
              label: user ? "Mon compte" : "Créer un compte",
              href: user ? "/account" : "/register",
            };
  return (
    <div className="home-reference">
      <div className="home-art" aria-hidden="true" />
      <header className="home-header">
        <Link href="/" className="home-brand" aria-label="Halloween — accueil">
          <span className="home-brand-mark">
            <ManorMark />
          </span>
          <span>
            <strong>Halloween</strong>
            <small>CARTE DES MAISONS</small>
          </span>
        </Link>
        <button
          className="home-menu-toggle"
          aria-label="Menu utilisateur"
          aria-expanded={menu}
          aria-controls="user-menu"
          onClick={() => setMenu(true)}
        >
          <Menu size={26} />
        </button>
      </header>
      <main className="home-stage" inert={menu} aria-hidden={menu || undefined}>
        <div className="home-center">
          <h1>
            {closed ? (
              <>
                La nuit s’achève.
                <br />
                <span>À l’année prochaine.</span>
              </>
            ) : open ? (
              <>
                La carte est ouverte.
                <br />
                <span>Halloween vous attend.</span>
              </>
            ) : (
              <>
                La carte ouvre
                <br />
                <span>
                  le {opening.setLocale("fr").toFormat("d MMMM")} à{" "}
                  {opening.toFormat("HH:mm")}
                </span>
              </>
            )}
          </h1>
          {!closed && !open && (
            <div
              className="home-clock"
              role="group"
              aria-label="Temps restant avant l’ouverture"
            >
              {clock.map((value, n) => (
                <div key={n}>
                  <strong>{String(value).padStart(2, "0")}</strong>
                  <small>{["Jours", "Heures", "Minutes", "Secondes"][n]}</small>
                </div>
              ))}
            </div>
          )}
          {!closed && (
            <div className="home-houses">
              <House size={40} strokeWidth={1.8} />
              <div>
                <strong>
                  {count} {count > 1 ? "maisons" : "maison"}
                </strong>
                <span>déjà {count > 1 ? "inscrites" : "inscrite"}</span>
              </div>
            </div>
          )}
          <p className="home-explanation">
            Découvrez les maisons participantes et préparez votre collecte
            d’Halloween.
          </p>
          <Link className="home-cta" href={cta.href}>
            {cta.label}
            <ArrowRight size={21} />
          </Link>
          {error && (
            <div className="home-refresh-error">
              <Notice error="Actualisation indisponible." />
              <AsyncButton onClick={onRetry}>Réessayer</AsyncButton>
            </div>
          )}
        </div>
      </main>
      <footer className="home-signature">
        <nav className="home-footer-links" aria-label="Informations légales">
          <Link href="/terms">Conditions</Link>
          <Link href="/privacy">Confidentialité</Link>
          <Link href="/guidelines">Bonnes pratiques</Link>
          <Link href="/legal">Mentions légales</Link>
          <ProjectSupport settings={projectLinks} />
        </nav>
        <Link href="/about">
          Une expérience <strong>DomotiK Studio</strong>
        </Link>
        <span className="home-version">{version}</span>
      </footer>
      {menu && (
        <UserMenu
          user={user}
          state={state}
          version={version}
          onClose={() => setMenu(false)}
          login={login}
          participationLabel={
            participation ? "Ma participation" : "Inscrire ma maison"
          }
          participationSubtitle={
            participation
              ? participation.status === "VISIBLE"
                ? "Maison visible"
                : "Maison masquée"
              : !participationKnown
                ? "Consulter ma participation"
                : undefined
          }
        />
      )}
    </div>
  );
}
