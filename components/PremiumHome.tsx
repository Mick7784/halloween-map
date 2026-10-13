"use client";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { DateTime } from "luxon";
import {
  ArrowRight,
  CalendarDays,
  Candy,
  House,
  Map,
  MapPin,
  Menu,
  X,
} from "lucide-react";
import PublicBrand, { PumpkinMark } from "./PublicBrand";
import PublicFooter from "./PublicFooter";
import { api, AsyncButton, Notice, type PublicState } from "./common";
import type { House as Participation, User } from "../lib/domain";
import "./PremiumHome.css";
import HomeAtmosphere from "./HomeAtmosphere";

/**
 * V0.9: visual-only landing. Authorization, server clock, TEST/REAL opening,
 * participation shortcuts and season rules stay owned by Application/service.
 * The three feature items are informative text, not links or interactive controls.
 */
export default function PremiumHome({
  state,
  user,
  now,
  version,
  login,
  error,
  onRetry,
  onOpenMenu,
  menuOpen,
}: {
  state: PublicState;
  user: User | null;
  now: number;
  version: string;
  login: ReactNode;
  error: string;
  onRetry: () => Promise<void>;
  onOpenMenu: () => void;
  menuOpen: boolean;
}) {
  const [participation, setParticipation] = useState<Participation | null>(null);
  const [loginOpen, setLoginOpen] = useState(false);

  useEffect(() => {
    let active = true;
    if (user) {
      void api<Participation | null>("house")
        .then((h) => {
          if (active) setParticipation(h);
        })
        .catch(() => {
          // Keep the ordinary participation entry reachable if loading fails.
        });
    }
    return () => { active = false; };
  }, [user]);

  const zone = state.instance?.timezone ?? "Europe/Paris";
  // Historic TEST seasons cannot invent a public opening date.
  const openingISO = state.season?.is_test
    ? state.nextOpening
    : (state.season?.opens_at ?? state.nextOpening);
  const candidate = openingISO
    ? DateTime.fromISO(openingISO).setZone(zone)
    : null;
  const opening = candidate?.isValid ? candidate : null;
  const closed = ["CLOSED", "ARCHIVED"].includes(state.state ?? "");
  const open = !!state.publicMapOpen;
  const countdownVisible = !!opening && opening.toMillis() > now && !closed && !open;
  const canPreview = !!user && !!state.mapAccessible && !open;
  const remaining = Math.max(0, (opening?.toMillis() ?? now) - now);
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

  const stateMessage = closed
    ? {
        title: "La saison est terminée",
        detail: "La carte des maisons n’est plus accessible pour cette saison.",
      }
    : open
      ? {
          title: "La carte est accessible",
          detail: "Consultez les maisons et choisissez librement vos visites.",
        }
      : !state.season
        ? {
            title: "La prochaine carte se prépare",
            detail: "Les maisons seront consultables lors de la prochaine saison.",
          }
        : {
            title: "La carte n’est pas encore accessible",
            detail: "Revenez consulter les maisons lorsque la carte sera ouverte.",
          };

  return (
    <div className="home-reference home-v09" data-home-state={
      closed ? "closed" : open ? "open" : countdownVisible ? "countdown" : "preparation"
    }>
      <div className="home-shell">
        <div className="home-scene">
        <HomeAtmosphere />
        <header className="home-header">
          <PublicBrand compact />
          <button
            type="button"
            className="home-menu-toggle"
            aria-label="Menu utilisateur"
            aria-expanded={menuOpen}
            aria-controls="user-menu"
            onClick={onOpenMenu}
          >
            <Menu size={22} aria-hidden="true" />
          </button>
        </header>

        <main className="home-stage">
          <section className="home-center" aria-labelledby="home-main-title">
            <h1 id="home-main-title">
              Halloween <span>Map</span>
            </h1>
            <div className="home-title-divider" aria-hidden="true">
              <i /><span><PumpkinMark /></span><i />
            </div>
            <p className="home-explanation">
              La cartographie des maisons participantes
              <br className="home-wide-break" />
              {" "}et votre outil personnel pour la collecte des bonbons.
            </p>

            {state.season?.is_test && (
              <div className="home-preview-label" role="status">
                Prévisualisation TEST
              </div>
            )}

            {countdownVisible && opening ? (
              <section className="home-countdown" aria-label="Décompte avant l’ouverture">
                <p className="home-countdown-heading">Ouverture dans</p>
                <div className="home-clock" role="group" aria-label="Temps restant avant l’ouverture">
                  {clock.map((value, index) => (
                    <div key={index}>
                      <strong>{String(value).padStart(2, "0")}</strong>
                      <small>{["Jours", "Heures", "Minutes", "Secondes"][index]}</small>
                    </div>
                  ))}
                </div>
                <div className="home-opening-date">
                  <CalendarDays size={15} aria-hidden="true" />
                  <span>
                    {opening.setLocale("fr").toFormat("d MMMM yyyy")}
                    {" à "}{opening.toFormat("HH:mm")}
                  </span>
                </div>
              </section>
            ) : (
              <section className="home-state-card" aria-live="polite">
                <h2>{stateMessage.title}</h2>
                <p>{stateMessage.detail}</p>
              </section>
            )}

            {user && !closed && (
              <p className="home-houses">
                <House size={16} aria-hidden="true" />
                <span>
                  <strong>{count} {count > 1 ? "maisons" : "maison"}</strong>
                  {" "}{state.season?.is_test
                    ? "de test · aperçu administrateur"
                    : count > 1 ? "référencées" : "référencée"}
                </span>
              </p>
            )}

            {!user ? (
              <div className="home-actions" aria-label="Accéder à votre compte">
                <button
                  type="button"
                  className="home-cta"
                  onClick={() => setLoginOpen(true)}
                  aria-haspopup="dialog"
                >
                  Se connecter <ArrowRight size={20} aria-hidden="true" />
                </button>
                <Link className="home-cta-secondary" href="/register">
                  Créer un compte
                </Link>
              </div>
            ) : (
              <Link className="home-cta" href={canPreview ? "/map" : cta.href}>
                {canPreview ? "Accéder à la carte" : cta.label}
                <ArrowRight size={20} aria-hidden="true" />
              </Link>
            )}

            {error && (
              <div className="home-refresh-error">
                <Notice error="Actualisation indisponible." />
                <AsyncButton onClick={onRetry}>Réessayer</AsyncButton>
              </div>
            )}
          </section>
        </main>
        </div>

        <aside className="home-features" aria-label="Fonctionnalités de l’application">
          <div className="home-feature">
            <span className="home-feature-icon"><Map size={22} aria-hidden="true" /></span>
            <p>Consultez les maisons <small>participantes autour de vous.</small></p>
          </div>
          <div className="home-feature">
            <span className="home-feature-icon"><MapPin size={22} aria-hidden="true" /></span>
            <p>Découvrez les décorations <small>et activités proposées.</small></p>
          </div>
          <div className="home-feature">
            <span className="home-feature-icon"><Candy size={22} aria-hidden="true" /></span>
            <p>Gérez votre collecte <small>individuellement avec des outils simples.</small></p>
          </div>
        </aside>

        <PublicFooter state={state} version={version} compact />
      </div>

      {loginOpen && !user && (
        <div className="home-auth-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setLoginOpen(false);
        }}>
          <section
            className="home-auth-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="home-auth-title"
          >
            <header>
              <h2 id="home-auth-title">Se connecter</h2>
              <button
                type="button"
                aria-label="Fermer la connexion"
                onClick={() => setLoginOpen(false)}
              ><X size={20} aria-hidden="true" /></button>
            </header>
            <div className="home-login">{login}</div>
          </section>
        </div>
      )}
    </div>
  );
}
