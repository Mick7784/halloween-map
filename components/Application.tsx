"use client";
import { useDialogFocus } from "./useDialogFocus";
import ManorMark from "./ManorMark";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { DateTime } from "luxon";
import {
  House as HouseIcon,
  Route,
  Users,
  Menu,
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
  const effectiveNow = state?.preview ? +new Date(state.serverTime!) : now;
  const closed =
    !!state?.season && effectiveNow >= +new Date(state.season.closes_at);
  const liveState = state
    ? {
        ...state,
        state: closed ? "CLOSED" : state.state,
        houses: closed
          ? []
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
  else if (view === "register")
    content = (
      <main className="narrow">
        <div className="eyebrow">PARTAGER UN MOMENT MAGIQUE</div>
        <h1>Votre maison entre dans la fête.</h1>
        <p className="muted">
          Une décoration, quelques bonbons, une mise en scène : à vous de
          choisir. Votre inscription sera vérifiée par l’équipe.
        </p>
        {state.season?.registrations_open && !closed ? (
          <section className="panel">
            <HouseForm
              registration
              zone={state.instance!.timezone}
              opens={state.season.opens_at}
              closes={state.season.closes_at}
              center={[state.instance!.longitude, state.instance!.latitude]}
              onSave={async (p) => {
                await api("register", p);
                window.location.href = "/participant";
              }}
            />
          </section>
        ) : (
          <p className="panel">Les inscriptions sont fermées.</p>
        )}
      </main>
    );
  else if (view === "participant")
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
    content =
      user?.kind === "STAFF" ? (
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
            Les adresses sont publiées uniquement après validation, pendant les
            horaires d’accueil. À la purge programmée de la saison, les comptes
            participants et leurs données sont supprimés. Les administrateurs et
            les statistiques anonymes sont conservés.
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
    content = (
      <PublicMap state={liveState!} mapStyle={mapStyle} now={effectiveNow} />
    );
  return (
    <>
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
        <p className="brand-note">
          DES MAISONS ACCUEILLANTES
          <br />
          UN HALLOWEEN À PARTAGER
        </p>
        <button
          className="menu-toggle"
          aria-label="Menu"
          aria-expanded={menu}
          onClick={() => setMenu(!menu)}
        >
          {menu ? <X /> : <Menu />}
        </button>
        <nav className={menu ? "open" : ""}>
          <Link href="/">
            <HouseIcon />
            Découvrir<span>les maisons participantes</span>
          </Link>
          <Link href="/#parcours">
            <Route />
            Préparer<span>son parcours</span>
          </Link>
          <Link
            href={user?.kind === "PARTICIPANT" ? "/participant" : "/register"}
          >
            <Users />
            Partager<span>ma participation</span>
          </Link>
          {user?.kind === "STAFF" && <Link href="/admin">Administration</Link>}
          {user ? (
            <AsyncButton
              onClick={async () => {
                await api("logout", {});
                window.location.href = "/";
              }}
            >
              <LogOut size={16} /> Déconnexion
            </AsyncButton>
          ) : (
            <Link className="nav-login" href="/login">
              Connexion
            </Link>
          )}
        </nav>
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
          <Link href="/admin">Retour à l’administration</Link>
        </div>
      )}
      {content}
      <footer>
        <span>Halloween Map · {version}</span>
        <span>
          {state?.instance?.footer ?? "Une expérience DomotiK Studio"}
        </span>
        <Link href="/about">À propos & confidentialité</Link>
        <span>
          © {DateTime.now().setZone("Europe/Paris").year} DomotiK Studio
        </span>
      </footer>
    </>
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
function Login() {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <main className="narrow login">
      <div className="eyebrow">RETROUVEZ VOTRE ÉVÉNEMENT</div>
      <h1>Bienvenue à la maison.</h1>
      <section className="panel">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              await api("login", values(e.currentTarget));
              const u = await api<User>("me");
              window.location.href =
                u.kind === "STAFF" ? "/admin" : "/participant";
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field label="Email" name="email" type="email" />
          <Field label="Mot de passe" name="password" type="password" />
          <Notice error={error} />
          <button disabled={busy} className="primary wide">
            {busy ? "Connexion…" : "Me connecter"}
            <ArrowRight size={18} />
          </button>
        </form>
        <p className="muted">
          Pas encore de maison ?{" "}
          <Link href="/register">Rejoignez l’événement.</Link>
        </p>
      </section>
    </main>
  );
}
function PublicMap({
  state,
  mapStyle,
  now,
}: {
  state: PublicState;
  mapStyle: string;
  now: number;
}) {
  const [selected, setSelected] = useState<PublicHouse | null>(null),
    [legend, setLegend] = useState(false),
    [filters, setFilters] = useState<Activity[]>([]),
    [maxFear, setMaxFear] = useState(5),
    [route, setRoute] = useState<RouteResult | null>(null),
    [origin, setOrigin] = useState<[number, number]>([
      state.instance!.longitude,
      state.instance!.latitude,
    ]),
    [pick, setPick] = useState(false),
    [tab, setTab] = useState("map");
  const i = state.instance!,
    s = state.season,
    open = state.state === "MAP_OPEN";
  const houses = (state.houses ?? []).filter(
    (h) =>
      (!filters.length || filters.some((a) => h.activities.includes(a))) &&
      (h.adaptable || (h.fear ?? 0) <= maxFear),
  );
  const selectedLive = selected
    ? ((state.houses ?? []).find((h) => h.id === selected.id) ?? null)
    : null;
  const safeRoute = route
    ? {
        ...route,
        stops: route.stops.filter(
          (s) =>
            (state.houses ?? []).some((h) => h.id === s.house.id) &&
            +new Date(s.house.ends_at) > now,
        ),
      }
    : null;
  const routeHouses = safeRoute?.stops.map((s) => s.house) ?? [];
  if (!open) {
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
          <span className="eyebrow">{i.public_name}</span>
          <h1>
            {closed
              ? "C’est fini pour cette année."
              : "Les portes s’ouvriront bientôt."}
          </h1>
          <p>
            {closed
              ? "Merci d’avoir fait vivre Halloween dans votre commune. Rendez-vous à la prochaine saison !"
              : state.state === "PREPARATION"
                ? "L’équipe prépare votre prochaine nuit d’Halloween."
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
                {(state.count ?? 0) > 1 ? "maisons" : "maison"}
              </strong>
              <span>déjà inscrites</span>
            </p>
          )}
          {!closed && s?.registrations_open && !state.preview && (
            <Link href="/register" className="button primary">
              Inscrire ma maison
              <ArrowRight size={18} />
            </Link>
          )}
          <p className="tagline">
            Une commune plus vivante,
            <br />
            un Halloween inoubliable.
          </p>
        </div>
      </main>
    );
  }
  return (
    <main className="public-layout">
      <section className="map-section">
        <div className="map-heading">
          <div>
            <div className="eyebrow">DÉCOUVRIR · {i.territory}</div>
            <h1>La nuit vous appartient.</h1>
            <p className="muted">
              {houses.length} maisons accueillantes en ce moment
            </p>
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
        <div className="map-filters">
          <button
            className={!filters.length ? "active" : ""}
            onClick={() => setFilters([])}
          >
            Toutes
          </button>
          {(["DECORATION", "CANDY", "ACTING"] as Activity[]).map((a) => (
            <button
              key={a}
              className={filters.includes(a) ? "active" : ""}
              onClick={() =>
                setFilters(
                  filters.includes(a)
                    ? filters.filter((x) => x !== a)
                    : [...filters, a],
                )
              }
            >
              {labels[a]}
            </button>
          ))}
          <label>
            Frayeur ≤{" "}
            <select
              aria-label="Frayeur maximale"
              value={maxFear}
              onChange={(e) => setMaxFear(Number(e.target.value))}
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
        {tab === "map" ? (
          <MapView
            houses={houses}
            center={[i.longitude, i.latitude]}
            zoom={i.zoom}
            styleUrl={mapStyle}
            onSelect={setSelected}
            geometry={
              safeRoute?.stops.length === route?.stops.length
                ? route?.geometry
                : undefined
            }
            onPoint={
              pick
                ? (lat, lng) => {
                    setOrigin([lng, lat]);
                    setPick(false);
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
        {!houses.length && (
          <p className="empty">
            Aucune maison ne correspond à ces filtres en ce moment. Revenez
            pendant les horaires d’accueil.
          </p>
        )}
        <p className="muted small">
          Les maisons en pause ou hors horaires sont masquées. Actualisation
          toutes les 30 secondes.
        </p>
      </section>
      <aside className="route-panel panel" id="parcours">
        <div className="eyebrow">PRÉPARER</div>
        <h2>
          <Route /> Mon parcours
        </h2>
        <p className="muted">Un moment à partager, à votre rythme.</p>
        <RouteForm
          state={state}
          origin={origin}
          filters={filters}
          maxFear={maxFear}
          setOrigin={setOrigin}
          onPick={() => {
            setTab("map");
            setPick(true);
          }}
          onResult={setRoute}
        />
        {safeRoute && (
          <div className="route-result">
            <h3>
              {safeRoute.stops.length}{" "}
              {safeRoute.stops.length > 1 ? "étapes" : "étape"} ·{" "}
              {safeRoute.durationMinutes} min
            </h3>
            <p>
              {(safeRoute.distanceMeters / 1000).toFixed(1)} km estimés · fin{" "}
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
                        {time(stop.arrival, i.timezone)} · {stop.walkingMinutes}{" "}
                        min à pied
                      </small>
                    </div>
                  </button>
                </li>
              ))}
            </ol>
            <p className="muted small">{safeRoute.disclaimer}</p>
            {routeHouses.length !== route?.stops.length && (
              <p className="notice info">
                Des étapes ont fermé. Recalculez votre parcours.
              </p>
            )}
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
                setOrigin([selectedLive.longitude, selectedLive.latitude]);
                setSelected(null);
                document
                  .getElementById("parcours")
                  ?.scrollIntoView({
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
  filters,
  maxFear,
  setOrigin,
  onPick,
  onResult,
}: {
  state: PublicState;
  origin: [number, number];
  filters: Activity[];
  maxFear: number;
  setOrigin: (p: [number, number]) => void;
  onPick: () => void;
  onResult: (r: RouteResult) => void;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const zone = state.instance!.timezone;
  const now = (
      state.preview ? DateTime.fromISO(state.serverTime!) : DateTime.now()
    ).setZone(zone),
    end = DateTime.fromISO(state.season!.closes_at).setZone(zone);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const v = values(e.currentTarget);
        setBusy(true);
        setError("");
        try {
          onResult(
            await api(state.preview ? "route?preview=1" : "route", {
              start: DateTime.fromISO(v.start, { zone }).toUTC().toISO(),
              end: DateTime.fromISO(v.end, { zone }).toUTC().toISO(),
              origin: { latitude: origin[1], longitude: origin[0] },
              activities: filters,
              maxFear,
            }),
          );
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <Field
        label="Départ"
        name="start"
        type="datetime-local"
        value={now.plus({ minutes: 2 }).toFormat("yyyy-MM-dd'T'HH:mm")}
      />
      <Field
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
          {origin[1].toFixed(5)}, {origin[0].toFixed(5)}
        </span>
        <button type="button" onClick={onPick}>
          <HouseIcon size={15} /> Choisir sur la carte
        </button>
        <button
          type="button"
          onClick={() => {
            navigator.geolocation?.getCurrentPosition(
              (p) => setOrigin([p.coords.longitude, p.coords.latitude]),
              () => setError("Position indisponible. Choisissez sur la carte."),
              { timeout: 10000 },
            );
          }}
        >
          <Navigation size={15} /> Ma position
        </button>
      </div>
      <p className="muted small">
        Les filtres d’activités et de frayeur de la carte s’appliquent au
        parcours.
      </p>
      <Notice error={error} />
      <button className="primary wide" disabled={busy}>
        {busy ? "Calcul…" : "Créer mon parcours"}
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
        <p>
          {state.state === "CLOSED"
            ? "La saison est fermée et vos données participantes ont été supprimées."
            : "Chargement de votre maison…"}
        </p>
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
      {house.status === "PENDING" && (
        <p className="notice info">
          Votre maison attend la validation de l’équipe. Elle n’est pas encore
          publique.
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
                "Supprimer définitivement votre participation, votre compte et toutes les données de votre maison ?",
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
        Les modifications du nom, de l’adresse et des textes demandent une
        nouvelle validation. Les actions en direct prennent effet immédiatement
        sur le serveur.
      </p>
    </main>
  );
}
