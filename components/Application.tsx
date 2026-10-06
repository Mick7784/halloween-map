"use client";
import { routeIsCurrent } from "../lib/route-state";
import { locateOrigin } from "../lib/geolocation";
import PasswordRecovery from "./PasswordRecovery";
import Account, { Signup, Activation } from "./Account";
import InstallApp from "./InstallApp";
import Editorial from "./Editorial";
import { useDialogFocus } from "./useDialogFocus";
import ManorMark from "./ManorMark";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { DateTime } from "luxon";
import {
  House as HouseIcon,
  Map,
  ShieldCheck,
  Settings,
  Route,
  CircleUserRound,
  X,
  ArrowRight,
  Info,
  Ghost,
  Clock,
  LogOut,
  Navigation,
  CheckCircle2,
  Candy,
  Pause,
  Play,
  Power,
  Trash2,
} from "lucide-react";
import type { House, User, Activity } from "../lib/domain";
import {
  api,
  labels,
  fears,
  Field,
  Notice,
  AsyncButton,
  Badges,
  time,
  values,
  type PublicState,
  type PublicHouse,
  type RouteResult,
} from "./common";
import Setup from "./Setup";
import Scene from "./Scene";
import PremiumHome from "./PremiumHome";
import MapView from "./Map";
import HouseForm from "./HouseForm";
import Admin from "./Admin";
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
    [now, setNow] = useState(() => Date.now());
  const refresh = useCallback(async () => {
    const [s, u] = await Promise.all([
      api<PublicState>(view === "preview" ? "public?preview=1" : "public"),
      api<User | null>("me"),
    ]);
    setState(s);
    setUser(u);
    setError("");
  }, [view]);
  useEffect(() => {
    void refresh().catch((e) => setError(e.message));
    const poll = setInterval(
      () => void refresh().catch((e) => setError(e.message)),
      30000,
    );
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(poll);
      clearInterval(clock);
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
  const accountVisible = accountOpen && !!user;
  useEffect(() => {
    if (!accountVisible) return;
    const previousBackground = background.current;
    const body = document.body,
      html = document.documentElement;
    const y = window.scrollY,
      x = window.scrollX;
    const oldBody = body.style.overflow,
      oldHtml = html.style.overflow;
    const oldPadding = body.style.paddingRight;
    const gap = window.innerWidth - html.clientWidth;
    body.style.overflow = "hidden";
    html.style.overflow = "hidden";
    if (gap) body.style.paddingRight = gap + "px";
    return () => {
      body.style.overflow = oldBody;
      html.style.overflow = oldHtml;
      body.style.paddingRight = oldPadding;
      window.scrollTo({ left: x, top: y, behavior: "instant" });
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
        inert={accountOpen && !!user}
        onClickCapture={(e) => {
          const link = (e.target as HTMLElement).closest<HTMLAnchorElement>(
            "a[href]",
          );
          if (
            !user ||
            !link ||
            new URL(link.href).pathname !== "/account" ||
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
          setAccountOpen(true);
        }}
      >
        {children}
      </div>
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

  const effectiveNow = state?.preview ? +new Date(state.serverTime!) : now;
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
    content = user ? (
      <Participant user={user} state={liveState!} refresh={refresh} />
    ) : (
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
      !user && ["map", "preview"].includes(view) ? (
        <Login destination="/map" />
      ) : (
        <PublicMap
          state={liveState!}
          mapStyle={mapStyle}
          now={effectiveNow}
          showMap={
            !!user &&
            (view === "map" || view === "preview" || state.state === "MAP_OPEN")
          }
          user={user}
        />
      );
  if (
    (view === "home" || (view === "account" && user)) &&
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
        (["map", "preview"].includes(view) && user ? "map-app" : "")
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
        {menu && (
          <nav
            className="user-menu open"
            id="user-menu"
            aria-label="Menu utilisateur"
          >
            {!user && (
              <div className="mobile-login">
                <LoginForm compact={false} destination="/map" />
              </div>
            )}
            <Link href="/map" onClick={() => setMenu(false)}>
              <Map size={20} />
              <span>La carte</span>
              <ArrowRight size={15} />
            </Link>
            <Link
              href={user ? "/participant" : "/login?next=/participant"}
              onClick={() => setMenu(false)}
            >
              <HouseIcon size={20} />
              <span>Inscrire ma maison</span>
              <ArrowRight size={15} />
            </Link>
            <Link href="/map#parcours" onClick={() => setMenu(false)}>
              <Route size={20} />
              <span>Préparer mon parcours</span>
              <ArrowRight size={15} />
            </Link>
            {user?.permissions.includes("admin.access") && (
              <div className="user-menu-group">
                <Link href="/admin">
                  <ShieldCheck size={20} />
                  <span>Administration</span>
                  <ArrowRight size={15} />
                </Link>
              </div>
            )}
            <div className="user-menu-account">
              {user && (
                <Link href="/account" onClick={() => setMenu(false)}>
                  <Settings size={20} />
                  <span>Mon compte</span>
                  <ArrowRight size={15} />
                </Link>
              )}
              <InstallApp />
              {user && (
                <AsyncButton
                  onClick={async () => {
                    await api("logout", {});
                    window.location.href = "/";
                  }}
                >
                  <LogOut size={20} />
                  <span>Se déconnecter</span>
                </AsyncButton>
              )}
            </div>
          </nav>
        )}
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
      {state?.preview && (
        <div className="demo-banner" role="status">
          <Ghost /> MODE DÉMONSTRATION — heure simulée :{" "}
          {DateTime.fromISO(state.serverTime!)
            .setZone(state.instance!.timezone)
            .setLocale("fr")
            .toFormat("dd LLLL yyyy · HH:mm")}{" "}
          <AsyncButton
            onClick={async () => {
              await api("admin", {
                action: "preview",
                payload: { enabled: false },
              });
              window.location.href = "/";
            }}
          >
            Quitter le mode démo
          </AsyncButton>
        </div>
      )}
      {content}
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
  state,
  mapStyle,
  now,
  showMap,
  user,
}: {
  showMap: boolean;
  user: User | null;
  state: PublicState;
  mapStyle: string;
  now: number;
}) {
  const [selected, setSelected] = useState<PublicHouse | null>(null),
    [legend, setLegend] = useState(false),
    [filters, setFilters] = useState<Activity[]>([]),
    [maxFear, setMaxFear] = useState(5),
    [route, setRoute] = useState<RouteResult | null>(null),
    [origin, setOrigin] = useState<[number, number] | null>(null),
    [originLabel, setOriginLabel] = useState(
      "Choisissez votre point de départ",
    ),
    [focusToken, setFocusToken] = useState(0),
    [draftOrigin, setDraftOrigin] = useState<[number, number] | null>(null),
    [pick, setPick] = useState(false),
    [tab, setTab] = useState("map"),
    [routeOpen, setRouteOpen] = useState(false);
  useEffect(() => {
    if (window.location.hash === "#parcours") setRouteOpen(true);
    const open = () => setRouteOpen(window.location.hash === "#parcours");
    window.addEventListener("hashchange", open);
    return () => window.removeEventListener("hashchange", open);
  }, []);
  const revision = useRef(0);
  const invalidate = useCallback(() => {
    revision.current++;
    setRoute(null);
  }, []);
  const changeOrigin = (p: [number, number], label: string) => {
    invalidate();
    setOrigin(p);
    setOriginLabel(label);
    setFocusToken((n) => n + 1);
  };
  const i = state.instance!,
    s = state.season,
    open = state.state === "MAP_OPEN";
  const houses = useMemo(
    () =>
      (state.houses ?? []).filter(
        (h) =>
          (!filters.length || filters.some((a) => h.activities.includes(a))) &&
          (h.adaptable || (h.fear ?? 0) <= maxFear),
      ),
    [state.houses, filters, maxFear],
  );
  const selectedLive = selected
    ? ([...(state.houses ?? []), ...(state.routeCandidates ?? [])].find(
        (h) => h.id === selected.id,
      ) ?? null)
    : null;
  const safeRoute =
    route &&
    routeIsCurrent(route, state.routeCandidates ?? state.houses ?? [], now) &&
    (!s || +new Date(route.estimatedEnd) <= +new Date(s.closes_at))
      ? route
      : null;
  const routeHouses = useMemo(
    () => safeRoute?.stops.map((stop) => stop.house) ?? [],
    [safeRoute],
  );
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
          {!closed && s?.registrations_open && !state.preview && (
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
            {state.demoAvailable && (
              <AsyncButton
                onClick={async () => {
                  await api("admin", {
                    action: "preview",
                    payload: { enabled: true },
                  });
                  window.location.href = "/preview";
                }}
              >
                Mode démo
              </AsyncButton>
            )}
          </div>
          <p className="tagline">{state.contents?.["home.final"]}</p>
        </div>
      </main>
    );
  }
  return (
    <main
      className={
        "public-layout " +
        (routeOpen ? "route-open " : "") +
        (pick ? "map-picking" : "")
      }
    >
      <section className="map-section">
        {!open && (
          <div className="notice info map-opening">
            Pour le moment, seule votre maison est visible. Les autres maisons
            participantes seront disponibles le{" "}
            {s
              ? DateTime.fromISO(s.opens_at)
                  .setZone(i.timezone)
                  .setLocale("fr")
                  .toFormat("d MMMM yyyy")
              : "jour de l’ouverture"}{" "}
            à {s ? time(s.opens_at, i.timezone) : ""}.{" "}
            {!state.houses?.length && (
              <Link href="/participant">Inscrire ma maison</Link>
            )}
          </div>
        )}
        <div className="map-heading">
          <div>
            <div className="eyebrow">DÉCOUVRIR · {i.territory}</div>
            <h1>{state.contents?.["home.open"]}</h1>
            <p className="muted">{state.contents?.["home.subtitle"]}</p>
          </div>
          <div className="view-tabs">
            <button
              className={tab === "map" ? "active" : ""}
              onClick={() => setTab("map")}
            >
              Carte
            </button>
            <button
              className={tab === "list" ? "active" : ""}
              onClick={() => setTab("list")}
            >
              Liste
            </button>
          </div>
        </div>
        {open && (
          <button
            className="mobile-route-toggle"
            onClick={() => setRouteOpen(!routeOpen)}
          >
            Préparer mon parcours
          </button>
        )}
        <div className="map-filters">
          <button
            className={!filters.length ? "active" : ""}
            onClick={() => {
              invalidate();
              setFilters([]);
            }}
          >
            Toutes
          </button>
          {(["DECORATION", "CANDY", "ACTING"] as Activity[]).map((a) => (
            <button
              key={a}
              className={filters.includes(a) ? "active" : ""}
              onClick={() => {
                invalidate();
                setFilters(
                  filters.includes(a)
                    ? filters.filter((x) => x !== a)
                    : [...filters, a],
                );
              }}
            >
              {labels[a]}
            </button>
          ))}
          <label>
            Frayeur ≤{" "}
            <select
              aria-label="Frayeur maximale"
              value={maxFear}
              onChange={(e) => {
                invalidate();
                setMaxFear(Number(e.target.value));
              }}
            >
              {fears.map((f, n) => (
                <option key={f} value={n + 1}>
                  {f}
                </option>
              ))}
            </select>
          </label>
          <button onClick={() => setLegend(true)}>
            <Info size={15} /> Légende
          </button>
        </div>
        {pick && (
          <div className="point-picker" role="status">
            <span>
              {draftOrigin
                ? "Point choisi. Confirmez le départ."
                : "Touchez la carte pour placer le départ."}
            </span>
            <div>
              <button
                onClick={() => {
                  setPick(false);
                  setDraftOrigin(null);
                  setRouteOpen(true);
                }}
              >
                Annuler
              </button>
              <button
                className="primary"
                disabled={!draftOrigin}
                onClick={() => {
                  if (draftOrigin)
                    changeOrigin(draftOrigin, "Point choisi sur la carte");
                  setPick(false);
                  setDraftOrigin(null);
                  setRouteOpen(true);
                }}
              >
                Valider le départ
              </button>
            </div>
          </div>
        )}
        {tab === "map" ? (
          <MapView
            houses={houses}
            center={[i.longitude, i.latitude]}
            zoom={i.zoom}
            styleUrl={mapStyle}
            onSelect={setSelected}
            geometry={safeRoute?.geometry}
            origin={(pick ? draftOrigin : origin) ?? undefined}
            focusToken={pick ? 0 : focusToken}
            routeSteps={routeHouses}
            routePanelOpen={routeOpen && !pick}
            onPoint={
              pick
                ? (lat, lng) => {
                    setDraftOrigin([lng, lat]);
                  }
                : undefined
            }
          />
        ) : (
          <div className="house-list">
            {houses.map((h) => (
              <button key={h.id} onClick={() => setSelected(h)}>
                <HouseIcon />
                <div>
                  <strong>{h.name}</strong>
                  <span>{h.address}</span>
                  <Badges activities={h.activities} />
                </div>
                <span>{time(h.ends_at, i.timezone)}</span>
              </button>
            ))}
          </div>
        )}
        <Notice error={state.demoError ?? ""} />
        {!houses.length && !state.demoError && (
          <p className="empty">{state.contents?.["home.empty"]}</p>
        )}
        <p className="muted small">
          Les maisons en pause ou hors horaires sont masquées. Actualisation
          toutes les 30 secondes.
        </p>
      </section>
      {open && (
        <aside className="route-panel panel" id="parcours">
          <button
            className="close mobile-route-close"
            aria-label="Fermer le parcours"
            onClick={() => setRouteOpen(false)}
          >
            <X />
          </button>
          <div className="eyebrow">PRÉPARER</div>
          <h2>
            <Route /> Mon parcours
          </h2>
          <p className="muted">Un moment à partager, à votre rythme.</p>
          <details className="route-parameters" open={!safeRoute?.stops.length}>
            <summary>
              {safeRoute?.stops.length
                ? "Modifier le départ et les horaires"
                : "Départ et horaires"}
            </summary>
            <RouteForm
              state={state}
              origin={origin}
              originLabel={originLabel}
              onInvalidate={invalidate}
              getRevision={() => revision.current}
              filters={filters}
              maxFear={maxFear}
              setOrigin={(p, accuracy) =>
                changeOrigin(
                  p,
                  accuracy === undefined
                    ? "Point choisi"
                    : `Position actuelle · précision ±${Math.round(accuracy)} m${accuracy > 50 ? " · Vérifiez le point sur la carte" : ""}`,
                )
              }
              onRecenter={() => setFocusToken((n) => n + 1)}
              onPick={() => {
                invalidate();
                setDraftOrigin(null);
                setRouteOpen(false);
                setTab("map");
                setPick(true);
              }}
              onResult={(result) => {
                setRoute(result);
                requestAnimationFrame(() =>
                  document.getElementById("parcours")?.scrollTo({ top: 0 }),
                );
              }}
            />
          </details>
          {route && !safeRoute && (
            <p className="notice info" role="status">
              Les maisons ou horaires ont changé. Recalculez votre parcours.
            </p>
          )}
          {safeRoute?.message && (
            <p className="notice info" role="status">
              {safeRoute.message}
            </p>
          )}
          {safeRoute && safeRoute.stops.length > 0 && (
            <div className="route-result">
              <h3>
                {safeRoute.stops.length}{" "}
                {safeRoute.stops.length > 1 ? "étapes" : "étape"} ·{" "}
                {safeRoute.durationMinutes} min au total
              </h3>
              <p>
                {(safeRoute.distanceMeters / 1000).toFixed(1)} km à pied ·{" "}
                {safeRoute.walkingMinutes} min de marche · fin{" "}
                {time(safeRoute.estimatedEnd, i.timezone)}
              </p>
              <ol>
                {safeRoute.stops.map((stop, n) => (
                  <li key={stop.house.id}>
                    <button onClick={() => setSelected(stop.house)}>
                      <span>{n + 1}</span>
                      <div>
                        <strong>{stop.house.name}</strong>
                        <small>
                          {time(stop.arrival, i.timezone)} ·{" "}
                          {stop.walkingMinutes} min à pied ·{" "}
                          {Math.round(stop.distanceMeters)} m
                        </small>
                      </div>
                    </button>
                  </li>
                ))}
              </ol>
              <p className="muted small">{safeRoute.disclaimer}</p>
              <AsyncButton
                onClick={async () => {
                  await navigator.clipboard.writeText(
                    `${i.public_name}\n` +
                      safeRoute.stops
                        .map(
                          (s, n) =>
                            `${n + 1}. ${time(s.arrival, i.timezone)} — ${s.house.name} — ${s.house.address}`,
                        )
                        .join("\n"),
                  );
                }}
              >
                Copier les étapes
              </AsyncButton>
            </div>
          )}
        </aside>
      )}
      {selectedLive && (
        <div className="modal-backdrop" onClick={() => setSelected(null)}>
          <section
            role="dialog"
            aria-modal="true"
            aria-label={selectedLive.name}
            className="house-detail panel"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="close"
              aria-label="Fermer la fiche"
              onClick={() => setSelected(null)}
            >
              <X />
            </button>
            <h2>
              <HouseIcon className="orange" />
              {selectedLive.name}
            </h2>
            <p className="muted">{selectedLive.address}</p>
            <Badges activities={selectedLive.activities} />
            <div className="detail-row">
              <Clock />
              <div>
                Horaires
                <strong>
                  {time(selectedLive.starts_at, i.timezone)} –{" "}
                  {time(selectedLive.ends_at, i.timezone)}
                </strong>
              </div>
            </div>
            <h3>Niveau de frayeur</h3>
            {selectedLive.adaptable ? (
              <div className="adapt">
                <Ghost />
                Frayeur adaptable · Je m’adapte à mes visiteurs
              </div>
            ) : (
              <div className="fear-static">
                <span style={{ width: `${(selectedLive.fear ?? 1) * 20}%` }} />
                <strong>{fears[(selectedLive.fear ?? 1) - 1]}</strong>
              </div>
            )}
            {selectedLive.rp && <p className="rp">{selectedLive.rp}</p>}
            <div className="practical detail-row">
              <Info />
              <div>
                <strong>Informations pratiques</strong>
                <p>
                  {selectedLive.practical || "Aucune indication particulière."}
                </p>
              </div>
            </div>
            <button
              className="primary wide"
              onClick={() => {
                changeOrigin(
                  [selectedLive.longitude, selectedLive.latitude],
                  "Départ depuis " + selectedLive.name,
                );
                setSelected(null);
                setRouteOpen(true);
                document.getElementById("parcours")?.scrollIntoView({
                  behavior: window.matchMedia(
                    "(prefers-reduced-motion: reduce)",
                  ).matches
                    ? "instant"
                    : "smooth",
                });
              }}
            >
              Choisir comme point de départ
              <ArrowRight size={18} />
            </button>
          </section>
        </div>
      )}
      {legend && (
        <div className="modal-backdrop" onClick={() => setLegend(false)}>
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Légende"
            className="panel house-detail"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="close"
              aria-label="Fermer la légende"
              onClick={() => setLegend(false)}
            >
              <X />
            </button>
            <h2>Légende</h2>
            <p>
              <HouseIcon className="orange" /> Le même marqueur pour toutes les
              maisons.
            </p>
            <dl className="legend">
              {[
                ["Décoration", "Une maison ou un jardin décoré."],
                ["Bonbons", "Des friandises encore disponibles."],
                ["Mise en scène / acting", "Des habitants jouent un rôle."],
                ["Horaires", "Accueil uniquement dans la plage indiquée."],
                ["Frayeur", "De très doux (1) à intense (5)."],
                [
                  "Frayeur adaptable",
                  "L’hôte ajuste l’ambiance à ses visiteurs.",
                ],
                ["RP", "Description de l’univers et de l’ambiance."],
                [
                  "Informations pratiques",
                  "Accès, stationnement et consignes utiles.",
                ],
              ].map(([title, description]) => (
                <div key={title}>
                  <dt>{title}</dt>
                  <dd>{description}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>
      )}
    </main>
  );
}
function RouteForm({
  state,
  origin,
  originLabel,
  filters,
  maxFear,
  setOrigin,
  onPick,
  onRecenter,
  onInvalidate,
  getRevision,
  onResult,
}: {
  state: PublicState;
  origin: [number, number] | null;
  originLabel: string;
  onRecenter: () => void;
  onInvalidate: () => void;
  getRevision: () => number;
  filters: Activity[];
  maxFear: number;
  setOrigin: (p: [number, number], accuracy?: number) => void;
  onPick: () => void;
  onResult: (r: RouteResult) => void;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [locating, setLocating] = useState(false);
  const zone = state.instance!.timezone;
  const now = (
      state.preview ? DateTime.fromISO(state.serverTime!) : DateTime.now()
    ).setZone(zone),
    end = DateTime.fromISO(state.season!.closes_at).setZone(zone);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!origin || locating) return;
        const v = values(e.currentTarget);
        const requestedRevision = getRevision();
        setBusy(true);
        setError("");
        try {
          const result: RouteResult = await api(
            state.preview ? "route?preview=1" : "route",
            {
              start: DateTime.fromISO(v.start, { zone }).toUTC().toISO(),
              end: DateTime.fromISO(v.end, { zone }).toUTC().toISO(),
              origin: { latitude: origin[1], longitude: origin[0] },
              activities: filters,
              maxFear,
            },
          );
          if (getRevision() === requestedRevision) onResult(result);
        } catch (e) {
          if (getRevision() === requestedRevision)
            setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <Field
        onValueChange={onInvalidate}
        readOnly={locating}
        label="Départ"
        name="start"
        type="datetime-local"
        value={now.plus({ minutes: 2 }).toFormat("yyyy-MM-dd'T'HH:mm")}
      />
      <Field
        onValueChange={onInvalidate}
        readOnly={locating}
        label="Arrivée au plus tard"
        name="end"
        type="datetime-local"
        value={(now.plus({ hours: 2 }) < end
          ? now.plus({ hours: 2 })
          : end
        ).toFormat("yyyy-MM-dd'T'HH:mm")}
      />
      <p className="muted small">Heures locales · {zone}</p>
      <div className="origin">
        <strong>Point de départ</strong>
        <span>
          {originLabel}
          {origin && (
            <>
              {" "}
              · {origin[1].toFixed(5)}, {origin[0].toFixed(5)}
            </>
          )}
        </span>
        <button type="button" disabled={locating} onClick={onPick}>
          <HouseIcon size={15} /> Choisir sur la carte
        </button>
        <button
          type="button"
          disabled={locating}
          onClick={async () => {
            onInvalidate();
            setLocating(true);
            setError("");
            try {
              const position = await locateOrigin(navigator.geolocation);
              setOrigin(position.point, position.accuracy);
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setLocating(false);
            }
          }}
        >
          <Navigation size={15} />{" "}
          {locating ? "Recherche de position…" : "Ma position"}
        </button>
      </div>
      {origin && (
        <button type="button" className="recenter-origin" onClick={onRecenter}>
          Recentrer sur le départ
        </button>
      )}
      {locating && (
        <p role="status" className="location-status">
          Recherche de votre position précise…
        </p>
      )}
      <p className="muted small">
        Les filtres d’activités et de frayeur de la carte s’appliquent au
        parcours.
      </p>
      <Notice error={error} />
      <button className="primary wide" disabled={busy || locating || !origin}>
        {busy ? "Calcul piéton…" : "Créer mon parcours"}
        <ArrowRight size={18} />
      </button>
    </form>
  );
}
function Participant({
  user,
  state,
  refresh,
}: {
  user: User;
  state: PublicState;
  refresh: () => Promise<void>;
}) {
  const [house, setHouse] = useState<House | null>(null),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false);
  const reload = useCallback(async () => {
    setHouse(await api<House | null>("house"));
    await refresh();
  }, [refresh]);
  useEffect(() => {
    void api<House | null>("house")
      .then(setHouse)
      .catch((e) => setError(e.message));
  }, [user.id]);
  const i = state.instance!,
    s = state.season;
  if (!house || !s)
    return (
      <main className="narrow">
        <h1>Ma participation</h1>
        <Notice error={error} />
        {!s?.registrations_open ? (
          <p>
            Les inscriptions sont fermées. Votre compte reste disponible pour la
            prochaine édition.
          </p>
        ) : user.email_status !== "VERIFIED" ? (
          <section className="panel">
            <p>{state.contents?.["account.verify"]}</p>
            <Link href="/account" className="button primary">
              Vérifier mon email
            </Link>
          </section>
        ) : (
          <section className="panel">
            <h2>{state.contents?.["participation.title"]}</h2>
            <Editorial text={state.contents?.["participation.intro"] ?? ""} />
            <HouseForm
              zone={i.timezone}
              opens={s.opens_at}
              closes={s.closes_at}
              center={[i.longitude, i.latitude]}
              documents={state.documents}
              onSave={async (p) => {
                await api("participation", p);
                setSaved(true);
                await reload();
              }}
            />
          </section>
        )}
      </main>
    );
  async function action(a: string, extra: Record<string, unknown> = {}) {
    await api("participant", { action: a, ...extra });
    await reload();
  }
  return (
    <main className="narrow participant">
      <div className="eyebrow">PARTAGER</div>
      <h1>Ma participation</h1>
      <div className="status-line">
        <span className={"status " + house.status}>{labels[house.status]}</span>
        <span className="badge">{labels[house.activity]}</span>
      </div>
      {house.status === "HIDDEN" && (
        <p className="notice info">
          Votre maison est masquée par l’administration.
        </p>
      )}
      {saved && (
        <p className="success" role="status">
          <CheckCircle2 size={18} /> Modifications enregistrées
        </p>
      )}
      <section className="panel">
        <HouseForm
          key={house.id + house.status}
          house={house}
          zone={i.timezone}
          opens={s.opens_at}
          closes={s.closes_at}
          center={[i.longitude, i.latitude]}
          onSave={async (p) => {
            await api("house", p);
            setSaved(true);
            await reload();
          }}
        />
        <hr />
        <h2>Gérer mon accueil en direct</h2>
        {house.activities.includes("CANDY") && (
          <>
            <AsyncButton
              onClick={async () => {
                await action("candy", { available: !house.candy_available });
              }}
            >
              <Candy size={18} />
              {house.candy_available
                ? "Je n’ai plus de bonbons"
                : "J’ai de nouveau des bonbons"}
            </AsyncButton>
            {!house.candy_available && house.activities.length === 1 && (
              <p className="notice info">
                Votre maison est masquée car elle proposait uniquement des
                bonbons. Vous pouvez terminer votre accueil ci-dessous ou
                rétablir les bonbons.
              </p>
            )}
          </>
        )}
        {house.activity !== "ENDED" && (
          <div className="actions">
            <AsyncButton
              onClick={() =>
                action(house.activity === "PAUSED" ? "resume" : "pause")
              }
            >
              {house.activity === "PAUSED" ? (
                <Play size={18} />
              ) : (
                <Pause size={18} />
              )}
              {house.activity === "PAUSED"
                ? "Reprendre mon accueil"
                : "Mettre en pause"}
            </AsyncButton>
            <AsyncButton
              onClick={async () => {
                if (
                  window.confirm(
                    "Terminer définitivement votre accueil pour cette saison ?",
                  )
                )
                  await action("end");
              }}
            >
              <Power size={18} />
              Terminer mon activité
            </AsyncButton>
          </div>
        )}
        <hr />
        <AsyncButton
          danger
          onClick={async () => {
            if (
              window.confirm(
                "Supprimer définitivement votre participation et les données de votre maison ? Votre compte reste disponible.",
              )
            ) {
              await api("participant", {
                action: "delete",
                confirm: "SUPPRIMER",
              });
              window.location.href = "/";
            }
          }}
        >
          <Trash2 size={18} />
          Supprimer ma participation
        </AsyncButton>
      </section>
      <p className="muted small">
        Les modifications et les actions en direct prennent effet immédiatement
        sur le serveur.
      </p>
    </main>
  );
}
