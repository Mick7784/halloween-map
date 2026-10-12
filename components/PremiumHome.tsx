"use client";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { DateTime } from "luxon";
import { Menu, House, ArrowRight } from "lucide-react";
import PublicBrand from "./PublicBrand";
import PublicFooter from "./PublicFooter";
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
  const [participation, setParticipation] = useState<Participation | null>(
    null,
  );
  useEffect(() => {
    let active = true;
    if (user)
      void api<Participation | null>("house")
        .then((h) => {
          if (active) {
            setParticipation(h);
          }
        })
        .catch(() => {
          // The participation shortcut remains available if loading fails.
        });
    return () => {
      active = false;
    };
  }, [user]);
  const zone = state.instance?.timezone ?? "Europe/Paris";
  // A legacy TEST preview must not supply a fictitious public opening date.
  const openingISO = state.season?.is_test
    ? state.nextOpening
    : (state.season?.opens_at ?? state.nextOpening);
  const configured = openingISO
    ? DateTime.fromISO(openingISO).setZone(zone)
    : null;
  const opening = configured?.isValid ? configured : null;
  const closed = ["CLOSED", "ARCHIVED"].includes(state.state ?? "");
  const open = !!state.publicMapOpen;
  const countdownVisible =
    !!opening && opening.toMillis() > now && !closed && !open;
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
  return (
    <div className="home-reference">
      <header className="home-header">
        <PublicBrand compact />
        <button
          className="home-menu-toggle"
          aria-label="Menu utilisateur"
          aria-expanded={menuOpen}
          aria-controls="user-menu"
          onClick={onOpenMenu}
        >
          <Menu size={26} />
        </button>
      </header>
      <main className="home-stage">
        <div className="home-art" aria-hidden="true" />
        <div className="home-center">
          <h1>
            {closed ? (
              <>
                Merci d’avoir partagé
                <br />
                <span>cette nuit d’Halloween !</span>
              </>
            ) : open ? (
              <>
                La carte est ouverte.
                <br />
                <span>Halloween vous attend.</span>
              </>
            ) : countdownVisible && opening ? (
              <>
                La carte ouvre
                <br />
                <span>
                  le {opening.setLocale("fr").toFormat("d MMMM")} à{" "}
                  {opening.toFormat("HH:mm")}
                </span>
              </>
            ) : (
              <>
                Halloween se prépare…
                <br />
                <span>Revenez dans quelques jours !</span>
              </>
            )}
          </h1>
          {countdownVisible && (
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
          {user && !closed && (
            <div className="home-houses">
              <House size={40} strokeWidth={1.8} />
              <div>
                <strong>
                  {count} {count > 1 ? "maisons" : "maison"}
                </strong>
                <span>
                  {state.season?.is_test
                    ? "de test · aperçu administrateur"
                    : `déjà ${count > 1 ? "inscrites" : "inscrite"}`}
                </span>
              </div>
            </div>
          )}
          <p className="home-explanation">
            {closed
              ? "Merci aux habitants, aux familles et à toutes les maisons participantes. À l’année prochaine !"
              : !state.season
                ? "La prochaine édition est en préparation."
                : !open && !countdownVisible
                  ? "La prochaine édition se prépare. La carte sera disponible prochainement."
                  : "Découvrez les maisons participantes et préparez votre collecte d’Halloween."}
          </p>
          {!user && (
            <section className="home-login" aria-label="Connexion">
              {login}
              <Link className="button secondary" href="/register">
                Créer mon compte
              </Link>
            </section>
          )}
          {user && (
            <Link className="home-cta" href={canPreview ? "/map" : cta.href}>
              {canPreview ? "Accéder à la carte" : cta.label}
              <ArrowRight size={21} />
            </Link>
          )}
          {error && (
            <div className="home-refresh-error">
              <Notice error="Actualisation indisponible." />
              <AsyncButton onClick={onRetry}>Réessayer</AsyncButton>
            </div>
          )}
        </div>
      </main>
      <PublicFooter state={state} version={version} compact />
    </div>
  );
}
