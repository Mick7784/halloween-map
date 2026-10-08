"use client";
import MapExperience from "./MapExperience";
import PasswordRecovery from "./PasswordRecovery";
import Account, { Signup, Activation } from "./Account";
import UserMenu from "./UserMenu";
import "./FloatingWindow.css";
import ProjectSupport from "./ProjectSupport";

import Editorial from "./Editorial";
import { useDialogFocus } from "./useDialogFocus";
import ManorMark from "./ManorMark";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { DateTime } from "luxon";
import {
  Map,
  CircleUserRound,
  House as HouseIcon,
  ArrowRight,
  Route,
} from "lucide-react";
import type { User } from "../lib/domain";
import {
  api,
  Field,
  Notice,
  AsyncButton,
  values,
  type PublicState,
} from "./common";
import Setup from "./Setup";
import Scene from "./Scene";
import PremiumHome from "./PremiumHome";
import ParticipationOverlay from "./ParticipationOverlay";
import Admin from "./Admin";
import useCollectionReports from "./useCollectionReports";
export default function Application({
  view,
  version,
  mapStyle,
}: {
  view: string;
  version: string;
  mapStyle: string;
}) {
  useDialogFocus();
  const [state, setState] = useState<PublicState | null>(null),
    [user, setUser] = useState<User | null>(null),
    [error, setError] = useState(""),
    [menu, setMenu] = useState(false),
    [accountOpen, setAccountOpen] = useState(view === "account"),
    [participationOpen, setParticipationOpen] = useState(
      view === "participant",
    ),
    [now, setNow] = useState(() => Date.now());
  useCollectionReports(user?.id, user?.instance_id);
  const refresh = useCallback(async () => {
    const [s, u] = await Promise.all([
      api<PublicState>("public"),
      api<User | null>("me"),
    ]);
    setState(s);
    setUser(u);
    setError("");
  }, []);
  useEffect(() => {
    void refresh().catch((e) => setError(e.message));
    const sync = () => {
      if (document.visibilityState !== "hidden")
        void refresh().catch((e) => setError(e.message));
    };
    const poll = setInterval(sync, 60000);
    window.addEventListener("pageshow", sync);
    document.addEventListener("visibilitychange", sync);
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(clock);
      clearInterval(poll);
      window.removeEventListener("pageshow", sync);
      document.removeEventListener("visibilitychange", sync);
    };
  }, [refresh]);
  useEffect(() => {
    const viewport = window.visualViewport;
    const resize = () =>
      document.documentElement.style.setProperty(
        "--app-height",
        (viewport?.height ?? window.innerHeight) + "px",
      );
    resize();
    viewport?.addEventListener("resize", resize);
    return () => viewport?.removeEventListener("resize", resize);
  }, []);

  const background = useRef<HTMLDivElement>(null);
  const accountOrigin = useRef<HTMLElement | null>(null);
  const accountVisible = (accountOpen || participationOpen) && !!user;
  useEffect(() => {
    if (!accountVisible) return;
    const previousBackground = background.current;
    return () => {
      const origin = accountOrigin.current;
      if (origin?.isConnected) origin.focus({ preventScroll: true });
      else
        previousBackground
          ?.querySelector<HTMLElement>('[aria-label="Menu utilisateur"]')
          ?.focus({ preventScroll: true });
    };
  }, [accountVisible]);
  const contextual = (children: React.ReactNode) => (
    <>
      <div
        ref={background}
        inert={(accountOpen || participationOpen) && !!user}
        onClickCapture={(e) => {
          const link = (e.target as HTMLElement).closest<HTMLAnchorElement>(
            "a[href]",
          );
          if (
            !user ||
            !link ||
            !["/account", "/participant"].includes(
              new URL(link.href).pathname,
            ) ||
            e.button !== 0 ||
            e.ctrlKey ||
            e.metaKey ||
            e.shiftKey ||
            e.altKey
          )
            return;
          e.preventDefault();
          accountOrigin.current = document.activeElement as HTMLElement;
          setMenu(false);
          if (new URL(link.href).pathname === "/participant")
            setParticipationOpen(true);
          else setAccountOpen(true);
        }}
      >
        {children}
      </div>
      {participationOpen && user && state && (
        <ParticipationOverlay
          user={user}
          state={state}
          refresh={refresh}
          styleUrl={mapStyle}
          onClose={() => setParticipationOpen(false)}
        />
      )}
      {accountOpen && user && state && (
        <Account
          user={user}
          state={state}
          refresh={refresh}
          onClose={() => setAccountOpen(false)}
        />
      )}
    </>
  );

  const effectiveNow = now;
  const closed =
    !!state?.season && effectiveNow >= +new Date(state.season.closes_at);
  const liveState = state
    ? {
        ...state,
        state: closed ? "CLOSED" : state.state,
        houses: closed
          ? []
          : state.state !== "MAP_OPEN"
            ? (state.houses ?? [])
            : (state.houses ?? []).filter(
                (h) =>
                  effectiveNow >= +new Date(h.starts_at) &&
                  effectiveNow < +new Date(h.ends_at),
              ),
      }
    : null;
  let content: React.ReactNode;
  if (!state)
    content = (
      <main className="narrow">
        <h1>Préparons la nuit…</h1>
        <Notice error={error} />
        {error && <AsyncButton onClick={refresh}>Réessayer</AsyncButton>}
      </main>
    );
  else if (state.setupRequired) content = <SetupGate />;
  else if (view === "setup")
    content = (
      <main className="narrow">
        <h1>Configuration terminée</h1>
        <p>
          Le premier lancement est verrouillé. Les réglages se trouvent dans
          l’administration.
        </p>
        <Link className="button primary" href="/admin">
          Ouvrir le back-office
        </Link>
      </main>
    );
  else if (view === "login") content = <Login />;
  else if (view === "forgot-password" || view === "reset-password")
    content = <PasswordRecovery reset={view === "reset-password"} />;
  else if (view === "register") content = <Signup state={state} />;
  else if (view === "activation") content = <Activation state={state} />;
  else if (view === "account") content = user ? null : <Login />;
  else if (["terms", "privacy", "guidelines", "legal"].includes(view)) {
    const kind = (
      {
        terms: "TERMS",
        privacy: "PRIVACY",
        guidelines: "GUIDELINES",
        legal: "NOTICE",
      } as const
    )[view as "terms" | "privacy" | "guidelines" | "legal"];
    const d = state.documents?.[kind];
    content = (
      <main className="narrow">
        <h1>{d?.title}</h1>
        <section className="panel">
          <p className="muted small">
            Version {d?.version}
            {d?.published_at
              ? " · publiée le " +
                DateTime.fromISO(d.published_at)
                  .setLocale("fr")
                  .toFormat("dd LLLL yyyy")
              : ""}
          </p>
          <Editorial text={d?.body ?? ""} />
        </section>
      </main>
    );
  } else if (view === "participant")
    content = user ? null : (
      <main className="narrow">
        <h1>Ma participation</h1>
        <p>Connectez-vous pour retrouver votre maison.</p>
        <Link href="/login" className="button primary">
          Me connecter
        </Link>
      </main>
    );
  else if (view === "admin")
    content = user?.permissions.includes("admin.access") ? (
      <Admin
        user={user}
        state={liveState!}
        refresh={refresh}
        mapStyle={mapStyle}
      />
    ) : (
      <main className="narrow">
        <h1>Accès à l’administration</h1>
        <p>Un compte disposant des permissions nécessaires est requis.</p>
        <Link className="button primary" href="/login">
          Me connecter
        </Link>
      </main>
    );
  else if (view === "about")
    content = (
      <main className="narrow">
        <div className="eyebrow">UNE COMMUNE PLUS VIVANTE</div>
        <h1>Halloween, à partager.</h1>
        <section className="panel">
          <h2>À propos</h2>
          <p>
            Halloween Map permet aux communes et associations de réunir les
            maisons accueillantes pour une soirée conviviale.
          </p>
          <p>
            Les adresses sont publiées pendant les horaires d’accueil. À la
            purge programmée de la saison, les données de participation sont
            supprimées. Les comptes durables et les statistiques anonymes sont
            conservés.
          </p>
          <h2>En toute sécurité</h2>
          <p>
            Les enfants restent accompagnés. Respectez les horaires, les
            propriétés privées, les indications d’accès et le niveau de frayeur.
            Les parcours sont des estimations : empruntez les voies publiques.
          </p>
          <p>
            Fond cartographique : © OpenStreetMap contributors · © CARTO. Les
            fournisseurs de tuiles reçoivent les requêtes nécessaires à
            l’affichage de la carte. La géolocalisation est facultative.
          </p>
          <p>Une expérience DomotiK Studio · {version}</p>
        </section>
      </main>
    );
  else
    content =
      !user && view === "map" ? (
        <Login destination="/map" />
      ) : (
        <PublicMap
          refresh={refresh}
          state={liveState!}
          mapStyle={mapStyle}
          now={effectiveNow}
          showMap={
            !!user &&
            !!state.mapAccessible &&
            (view === "map" || state.state === "MAP_OPEN")
          }
          user={user}
        />
      );
  if (
    (view === "home" || (["account", "participant"].includes(view) && user)) &&
    state &&
    !state.setupRequired
  )
    return contextual(
      <PremiumHome
        state={liveState!}
        user={user}
        now={effectiveNow}
        version={version}
        login={<LoginForm destination="/map" />}
        error={error}
        onRetry={refresh}
      />,
    );
  return contextual(
    <div
      className={
        "application " +
        (view === "map" && user ? "map-app" : "") +
        (view === "admin" && user?.permissions.includes("admin.access")
          ? " admin-app"
          : "")
      }
    >
      <header
        className={
          view === "admin" ? "site-header admin-header" : "site-header"
        }
      >
        <Link href="/" className="brand">
          <span className="brand-mark">
            <ManorMark />
          </span>
          <span>
            <strong>Halloween</strong>
            <small>CARTE DES MAISONS</small>
            <em>{state?.instance?.territory ?? "Une commune plus vivante"}</em>
          </span>
        </Link>
        <div className="header-account">
          {view === "map" && user && (
            <>
              <button
                className="map-header-prepare"
                aria-label="Préparer mon parcours"
                onClick={() => {
                  window.location.hash = "parcours";
                }}
              >
                <Route size={20} />
                <span>Préparer mon parcours</span>
              </button>
              <button
                aria-label="Options de la carte"
                onClick={() => window.dispatchEvent(new Event("map-options"))}
              >
                <Map size={20} />
              </button>
            </>
          )}
          {!user ? (
            <div className="desktop-login">
              <LoginForm compact destination="/map" />
            </div>
          ) : (
            <Link className="account-name" href="/account">
              {user.display_name || "Mon compte"}
            </Link>
          )}
          <button
            className="user-menu-toggle"
            aria-label="Menu utilisateur"
            aria-expanded={menu}
            aria-controls="user-menu"
            onClick={() => setMenu(!menu)}
          >
            <CircleUserRound size={22} />
          </button>
        </div>
      </header>
      {error && state && (
        <div className="notice global-notice" role="alert">
          Actualisation indisponible.{" "}
          <button
            onClick={() => void refresh().catch((e) => setError(e.message))}
          >
            Réessayer
          </button>
        </div>
      )}
      {content}
      {menu && (
        <UserMenu
          user={user}
          state={state}
          version={version}
          onClose={() => setMenu(false)}
          login={<LoginForm compact={false} destination="/map" />}
        />
      )}
      <footer>
        <span>Halloween Map · {version}</span>
        <span>
          {state?.contents?.["footer.signature"] ??
            "Une expérience DomotiK Studio"}
        </span>
        <Link href="/terms">Conditions d’utilisation</Link>
        <Link href="/privacy">Politique de confidentialité</Link>
        <Link href="/guidelines">Bonnes pratiques</Link>
        <Link href="/legal">Mentions légales</Link>
        <ProjectSupport settings={state?.projectLinks} />
        <span>
          © {DateTime.now().setZone("Europe/Paris").year} DomotiK Studio
        </span>
      </footer>
    </div>,
  );
}
function SetupGate() {
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  useEffect(() => {
    void api<{ authorized: boolean }>("setup-access")
      .then((r) => setAuthorized(r.authorized))
      .catch(() => setAuthorized(false));
  }, []);
  if (authorized) return <Setup />;
  return (
    <main className="narrow setup-intro">
      <div className="eyebrow">VOTRE PREMIÈRE NUIT COMMENCE ICI</div>
      <h1>Bienvenue dans votre commune.</h1>
      <section className="panel">
        <h2>
          {authorized === null
            ? "Vérification du lien…"
            : "Ouvrez votre lien de bienvenue"}
        </h2>
        <p>
          Le lien personnel de configuration se trouve dans les logs du service
          migrate. Il ouvre directement les quatre étapes de préparation de
          votre événement.
        </p>
        <p className="muted">
          Ce lien est à usage unique. Une fois ouvert, vous disposez de deux
          heures pour terminer la configuration.
        </p>
      </section>
    </main>
  );
}
function Login({ destination }: { destination?: string }) {
  return (
    <main className="narrow login">
      <h1>Bienvenue à la maison.</h1>
      <section className="panel">
        <LoginForm destination={destination} />
      </section>
    </main>
  );
}
function LoginForm({
  compact = false,
  destination,
}: {
  compact?: boolean;
  destination?: string;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <form
      className={compact ? "compact-login" : "login-form"}
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        try {
          await api("login", values(e.currentTarget));
          const next = new URLSearchParams(window.location.search).get("next");
          window.location.href =
            next && /^\/(?!\/)/.test(next) && !next.includes("\\")
              ? next
              : (destination ?? "/map");
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="login-fields">
        <Field label="Email" name="email" type="email" placeholder="Email" />
        <Field
          label="Mot de passe"
          name="password"
          type="password"
          placeholder="Mot de passe"
        />
        <button className="primary" disabled={busy}>
          {busy ? "Connexion…" : "Se connecter"}
        </button>
      </div>
      <div className="login-links">
        <Link href="/forgot-password">Mot de passe oublié ?</Link>
        <Link href="/register">Créer un compte</Link>
      </div>
      <Notice error={error} />
    </form>
  );
}
function PublicMap({
  refresh,
  state,
  mapStyle,
  now,
  showMap,
  user,
}: {
  refresh: () => Promise<void>;
  showMap: boolean;
  user: User | null;
  state: PublicState;
  mapStyle: string;
  now: number;
}) {
  const i = state.instance!,
    s = state.season,
    open = state.state === "MAP_OPEN";
  if (!showMap) {
    const closed = state.state === "CLOSED" || state.state === "ARCHIVED";
    const remaining = s ? Math.max(0, +new Date(s.opens_at) - now) : 0;
    const countdown = [
      Math.floor(remaining / 86400000),
      Math.floor(remaining / 3600000) % 24,
      Math.floor(remaining / 60000) % 60,
      Math.floor(remaining / 1000) % 60,
    ];
    return (
      <main className="countdown">
        <Scene />
        <div className="countdown-content">
          <span className="eyebrow">{state.contents?.["home.eyebrow"]}</span>
          <h1>
            {closed
              ? state.contents?.["home.closed"]
              : open
                ? state.contents?.["home.open"]
                : state.contents?.["home.title"]}
          </h1>
          <p>
            {closed
              ? state.contents?.["home.closedBody"]
              : open
                ? "Connectez-vous pour découvrir les maisons participantes."
                : state.state === "PREPARATION"
                  ? state.contents?.["home.preparation"]
                  : s
                    ? `La carte ouvre le ${DateTime.fromISO(s.opens_at).setZone(i.timezone).setLocale("fr").toFormat("d MMMM à HH:mm")}`
                    : "La première saison est en préparation."}
          </p>
          {!closed && state.state === "COUNTDOWN" && (
            <div className="countdown-boxes">
              {countdown.map((n, k) => (
                <div key={k}>
                  <strong>{String(n).padStart(2, "0")}</strong>
                  <small>{["Jours", "Heures", "Minutes", "Secondes"][k]}</small>
                </div>
              ))}
            </div>
          )}
          {!closed && (
            <p className="house-count">
              <HouseIcon />
              <strong>
                {state.count ?? 0}{" "}
                {(state.count ?? 0) > 1
                  ? state.contents?.["home.houses"]
                  : state.contents?.["home.house"]}
              </strong>
              <span>{state.contents?.["home.count"]}</span>
            </p>
          )}
          {!closed && s?.registrations_open && (
            <Link
              href={user ? "/participant" : "/register"}
              className="button primary"
            >
              {state.contents?.["home.register"]}
              <ArrowRight size={18} />
            </Link>
          )}
          <div className="actions">
            <Link href="/map" className="button">
              La carte
            </Link>
          </div>
          <p className="tagline">{state.contents?.["home.final"]}</p>
        </div>
      </main>
    );
  }
  return (
    <MapExperience
      state={state}
      user={user}
      mapStyle={mapStyle}
      refresh={refresh}
    />
  );
}
