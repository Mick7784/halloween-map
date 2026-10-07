"use client";
import { useCallback, useEffect, useState, useRef } from "react";
import Link from "next/link";
import {
  X,
  LayoutDashboard,
  House as HouseIcon,
  Users,
  CalendarDays,
  ChartColumn,
  FileText,
  Settings,
  ShieldCheck,
  Menu,
  SunMoon,
  RefreshCw,
  ExternalLink,
} from "lucide-react";
import type { House, User, Season } from "../lib/domain";
import {
  api,
  has,
  labels,
  Notice,
  AsyncButton,
  type PublicState,
} from "./common";
import AdminUsers, { type ManagedUser } from "./AdminUsers";
import HouseForm from "./HouseForm";
import SeasonManager from "./SeasonManager";
import ParticipationForm from "./ParticipationForm";
import AdminDashboard, { type AdminAudit } from "./AdminDashboard";
import AdminStatistics, { type SeasonStatistics } from "./AdminStatistics";
import AdminExistingPage from "./AdminExistingPage";
import { seasonFinished } from "../lib/domain";
import "./AdminBeta.css";
type ManagedHouse = House & {
  email: string;
  owner_name: string;
  season_opens_at: string;
  season_closes_at: string;
  season_is_test: boolean;
};
type Dashboard = {
  approved: number;
  pending: number;
  routes: number;
  users: number;
  collectionStats?: Record<string, number>;
};
type Audit = AdminAudit;
function dateLabel(value: string, zone: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: zone,
  }).format(new Date(value));
}
const reviews: Record<string, string> = {
  VALIDATED: "Validée",
  PENDING: "En attente",
  REFUSED: "Refusée",
};
const open = (h: House) =>
  h.activity === "ACTIVE" &&
  new Date(h.starts_at).getTime() <= Date.now() &&
  new Date(h.ends_at).getTime() > Date.now();
export default function Admin({
  user,
  state,
  refresh,
  mapStyle,
}: {
  user: User;
  state: PublicState;
  refresh: () => Promise<void>;
  mapStyle: string;
}) {
  const [section, setSection] = useState("dashboard"),
    [houses, setHouses] = useState<ManagedHouse[]>([]),
    [statistics, setStatistics] = useState<SeasonStatistics | null>(null),
    [userCreate, setUserCreate] = useState(false),
    [ownerSearch, setOwnerSearch] = useState(""),
    [dashboard, setDashboard] = useState<Dashboard | null>(null),
    [audit, setAudit] = useState<Audit[]>([]),
    [error, setError] = useState(""),
    [selected, setSelected] = useState<string | null>(null),
    [edit, setEdit] = useState(false),
    [reason, setReason] = useState(""),
    [search, setSearch] = useState(""),
    [review, setReview] = useState("ALL"),
    [availability, setAvailability] = useState("ALL"),
    [theme, setTheme] = useState("system"),
    [menuOpen, setMenuOpen] = useState(false),
    [loading, setLoading] = useState(true),
    [users, setUsers] = useState<ManagedUser[]>([]),
    [roles, setRoles] = useState<
      { id: string; name: string; permissions: string[] }[]
    >([]);
  const [seasons, setSeasons] = useState<Season[]>([]),
    [seasonId, setSeasonId] = useState(""),
    [loadedSeason, setLoadedSeason] = useState(""),
    [creating, setCreating] = useState(false),
    [ownerId, setOwnerId] = useState(""),
    [owners, setOwners] = useState<ManagedUser[]>([]);
  const selectedSeason = seasons.find((s) => s.id === seasonId),
    scheduleRef = useRef<HTMLElement | null>(null),
    generation = useRef(0),
    currentSeason = useRef(seasonId);
  currentSeason.current = seasonId;
  const seasonStorageKey =
    "halloween.admin.season." + state.instance?.id + "." + user.id;
  const reloadSeasons = useCallback(async () => {
    const rows = await api<Season[]>("admin/seasons");
    setSeasons(rows);
    if (!rows.length) setLoading(false);
    let stored = "";
    try {
      stored = localStorage.getItem(seasonStorageKey) ?? "";
    } catch {}
    setSeasonId((id) =>
      rows.some((s) => s.id === id)
        ? id
        : (rows.find((s) => s.active)?.id ??
          rows.find((s) => s.id === stored)?.id ??
          rows[0]?.id ??
          ""),
    );
  }, [seasonStorageKey]);
  useEffect(() => {
    void reloadSeasons().catch((e) => setError(e.message));
  }, [reloadSeasons]);
  useEffect(() => {
    if (seasonId) {
      try {
        localStorage.setItem(seasonStorageKey, seasonId);
      } catch {}
    }
  }, [seasonId, seasonStorageKey]);
  const reload = useCallback(async () => {
    const revision = ++generation.current,
      query =
        section === "dashboard"
          ? ""
          : seasonId
            ? "?seasonId=" + encodeURIComponent(seasonId)
            : "";
    setLoading(true);
    try {
      const [h, d, a, stats] = await Promise.all([
        has(user, "participants.read")
          ? api<ManagedHouse[]>("admin/houses" + query)
          : [],
        has(user, "stats.read")
          ? api<Dashboard>("admin/dashboard" + query)
          : null,
        has(user, "audit.read") ? api<Audit[]>("admin/audit" + query) : [],
        section === "statistics" && has(user, "stats.read")
          ? api<SeasonStatistics | null>("admin/statistics" + query)
          : null,
      ]);
      if (revision !== generation.current) return;
      setStatistics(stats);
      setHouses(h);
      setDashboard(d);
      setAudit(a);
      setLoadedSeason(seasonId);
      setError("");
    } catch (e) {
      if (revision === generation.current) setError((e as Error).message);
    } finally {
      if (revision === generation.current) setLoading(false);
    }
  }, [user, seasonId, section]);
  const reloadUsers = useCallback(async () => {
    const [u, r] = await Promise.all([
      api<ManagedUser[]>("admin/users"),
      api<{ id: string; name: string; permissions: string[] }[]>("admin/roles"),
    ]);
    if (currentSeason.current !== seasonId) return;
    setUsers(u);
    setRoles(r);
  }, [seasonId]);
  useEffect(() => {
    setSelected(null);
    setCreating(false);
    setHouses([]);
    setUsers([]);
    setDashboard(null);
    setAudit([]);
    setLoadedSeason("");
  }, [seasonId]);
  useEffect(() => {
    void reload();
  }, [reload]);
  useEffect(() => {
    if (section === "users")
      void reloadUsers().catch((e) => setError(e.message));
  }, [section, reloadUsers]);
  async function seasonAction(action: string, payload: unknown, id?: string) {
    await api("admin", { action, payload, id });
    await reloadSeasons();
    if (action !== "deleteSeason") await reload();
    await refresh();
  }
  async function startCreate() {
    const available = await api<ManagedUser[]>(
      "admin/eligibleOwners?seasonId=" + seasonId,
    );
    if (currentSeason.current !== seasonId) return;
    setOwners(available);
    setOwnerId("");
    setOwnerSearch("");
    setCreating(true);
  }
  useEffect(() => {
    let stored = null;
    try {
      stored = localStorage.getItem("halloween.admin.theme");
    } catch {}
    if (stored && ["dark", "light", "system"].includes(stored))
      setTheme(stored);
  }, []);
  const current = (loadedSeason === seasonId ? houses : []).find(
    (h) => h.id === selected,
  );
  async function act(action: string, payload?: unknown) {
    await api("admin", { action, id: selected, payload, seasonId });
    await reload();
    await refresh();
  }
  const scopedHouses = loadedSeason === seasonId ? houses : [];
  const pending = scopedHouses.filter((h) => h.review_status === "PENDING");
  const list = scopedHouses.filter(
    (h) =>
      (h.name + " " + h.owner_name + " " + h.email + " " + h.address)
        .toLocaleLowerCase()
        .includes(search.toLocaleLowerCase()) &&
      (review === "ALL" ||
        (review === "HIDDEN"
          ? h.status === "HIDDEN"
          : h.review_status === review)) &&
      (availability === "ALL" || open(h) === (availability === "OPEN")),
  );
  function select(h: ManagedHouse) {
    setSelected(h.id);
    setEdit(false);
    setReason(h.refusal_reason ?? "");
  }
  function table(items: ManagedHouse[], moderation = false) {
    return (
      <div className="beta-table-scroll">
        <table>
          <thead>
            <tr>
              <th>Maison / propriétaire</th>
              <th>Adresse</th>
              <th>Statut</th>
              {moderation ? (
                <th>Soumission</th>
              ) : (
                <>
                  <th>Disponibilité</th>
                  <th>Activités</th>
                  <th>Modification</th>
                </>
              )}
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {items.map((h) => (
              <tr key={h.id}>
                <td>
                  <strong>{h.name}</strong>
                  {h.season_is_test && <span className="beta-badge">Test</span>}
                  <small>
                    {h.owner_name} · {h.email}
                  </small>
                </td>
                <td>{h.address}</td>
                <td>
                  {reviews[h.review_status ?? "VALIDATED"]}
                  {h.status === "HIDDEN" && <small>Masquée</small>}
                </td>
                {moderation ? (
                  <td>
                    {h.submitted_at
                      ? dateLabel(
                          h.submitted_at,
                          state.instance?.timezone ?? "Europe/Paris",
                        )
                      : "—"}
                  </td>
                ) : (
                  <>
                    <td>
                      {open(h) ? "Ouverte" : "Fermée"}
                      <small>
                        {h.candy_available
                          ? "Bonbons disponibles"
                          : "Plus de bonbons"}
                      </small>
                    </td>
                    <td>{h.activities.map((a) => labels[a]).join(" · ")}</td>
                    <td>
                      {h.updated_at
                        ? dateLabel(
                            h.updated_at,
                            state.instance?.timezone ?? "Europe/Paris",
                          )
                        : "—"}
                    </td>
                  </>
                )}
                <td>
                  <button className="secondary" onClick={() => select(h)}>
                    {moderation ? "Voir / Modérer" : "Gérer"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!items.length && (
          <p className="beta-empty">
            {moderation
              ? "Aucune maison en attente."
              : "Aucune maison ne correspond aux filtres."}
          </p>
        )}
      </div>
    );
  }
  return (
    <div className="admin-beta" data-theme={theme}>
      {menuOpen && (
        <button
          className="beta-menu-backdrop"
          aria-label="Fermer la navigation"
          onClick={() => setMenuOpen(false)}
        />
      )}
      <aside
        className={"beta-sidebar" + (menuOpen ? " is-open" : "")}
        id="admin-navigation"
      >
        <a
          className="beta-logo"
          href="https://github.com/Mick7784/halloween-map"
          target="_blank"
          rel="noreferrer"
        >
          <HouseIcon size={26} />
          <span>
            Halloween Map<small>Administration</small>
          </span>
        </a>
        <nav aria-label="Navigation administration">
          {(
            [
              ["dashboard", "Tableau de bord", "stats.read", LayoutDashboard],
              ["houses", "Maisons", "participants.read", HouseIcon],
              ["users", "Utilisateurs", "users.read", Users],
              ["statistics", "Statistiques", "stats.read", ChartColumn],
              ["seasons", "Saison", "season.read", CalendarDays],
              ["content", "Textes & documents", "content.manage", FileText],
              ["settings", "Paramètres", "settings.read", Settings],
              ["roles", "Rôles & permissions", "roles.manage", ShieldCheck],
            ] as const
          ).map(
            ([id, title, permission, Icon]) =>
              has(user, permission) &&
              (id !== "roles" || user.role_name === "SUPER_ADMIN") && (
                <button
                  key={id}
                  className={section === id ? "is-current" : ""}
                  aria-current={section === id ? "page" : undefined}
                  onClick={() => {
                    setUserCreate(false);
                    setSection(id);
                    setMenuOpen(false);
                  }}
                >
                  <Icon size={18} />
                  {title}
                </button>
              ),
          )}
        </nav>
        <Link className="beta-public-link" href="/map">
          <ExternalLink size={17} />
          Voir la carte
        </Link>
      </aside>
      <main className="beta-content">
        <header className="beta-header">
          <button
            className="beta-menu-toggle"
            aria-label="Ouvrir la navigation"
            aria-expanded={menuOpen}
            aria-controls="admin-navigation"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            <Menu size={20} />
          </button>
          <div className="beta-page-title">
            <h1>
              {
                {
                  dashboard: "Tableau de bord",
                  houses: "Maisons",
                  users: "Utilisateurs",
                  statistics: "Statistiques",
                  seasons: "Saison",
                  content: "Textes & documents",
                  settings: "Paramètres",
                  roles: "Rôles & permissions",
                }[section]
              }
            </h1>
            <p>
              {section === "dashboard"
                ? "Vue d’ensemble de la saison active"
                : section === "seasons"
                  ? "Gestion des saisons et de l’historique"
                  : ["content", "settings", "roles", "users"].includes(section)
                    ? "Configuration globale de l’instance"
                    : "Données de la saison sélectionnée"}
            </p>
          </div>
          <div className="beta-header-controls">
            {!["dashboard", "seasons", "users"].includes(section) && (
              <label className="beta-season-select">
                Saison consultée
                <select
                  aria-label={
                    section === "statistics"
                      ? "Saison consultée"
                      : "Saison du back-office"
                  }
                  value={seasonId}
                  onChange={(e) => {
                    generation.current++;
                    setLoadedSeason("");
                    setSeasonId(e.target.value);
                  }}
                >
                  {seasons.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name ?? "Halloween " + s.year}
                      {s.is_test ? " · TEST" : " · REAL"}
                      {s.active ? " · ACTIVE" : ""}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="beta-theme-select">
              <SunMoon size={17} />
              <select
                aria-label="Apparence"
                value={theme}
                onChange={(e) => {
                  setTheme(e.target.value);
                  try {
                    localStorage.setItem(
                      "halloween.admin.theme",
                      e.target.value,
                    );
                  } catch {}
                }}
              >
                <option value="dark">Sombre</option>
                <option value="light">Clair</option>
                <option value="system">Système</option>
              </select>
            </label>
            <span className="beta-profile">
              <span>{user.display_name.slice(0, 1).toUpperCase()}</span>
              <div>
                <strong>{user.display_name}</strong>
                <small>
                  {user.role_name === "SUPER_ADMIN"
                    ? "Super administrateur"
                    : "Administrateur"}
                </small>
              </div>
            </span>
          </div>
        </header>
        <div className="beta-context">
          <div>
            <strong>
              Saison active : {seasons.find((s) => s.active)?.name ?? "Aucune"}
            </strong>
            {seasons.some((s) => s.active) && (
              <span className="beta-status">
                {seasons.find((s) => s.active)?.is_test ? "TEST" : "REAL"}
              </span>
            )}
          </div>
          <div>
            <span className="beta-service">
              Carte : {state.mapAccessible ? "ouverte" : "indisponible"}
            </span>
            <button
              aria-label="Actualiser les données"
              onClick={() => {
                void reloadSeasons().catch((e) => setError(e.message));
                void reload();
              }}
            >
              <RefreshCw size={15} />
            </button>
          </div>
        </div>
        <Notice error={error} />
        {section === "dashboard" &&
          !seasons.some((s) => s.active) &&
          !loading && (
            <section className="beta-card">
              <h2>Aucune saison active</h2>
              <p>Activez une saison pour consulter ses indicateurs.</p>
              <button className="primary" onClick={() => setSection("seasons")}>
                Gérer les saisons
              </button>
            </section>
          )}
        {section === "dashboard" && seasons.some((s) => s.active) && (
          <button
            className="stats-link"
            onClick={() => {
              setSeasonId(seasons.find((s) => s.active)!.id);
              setSection("statistics");
            }}
          >
            Voir toutes les statistiques
          </button>
        )}
        {section === "dashboard" && seasons.some((s) => s.active) && (
          <AdminDashboard
            metrics={loadedSeason === seasonId ? dashboard : null}
            pending={pending
              .slice()
              .sort(
                (a, b) =>
                  +new Date(b.submitted_at ?? 0) -
                  +new Date(a.submitted_at ?? 0),
              )}
            audit={loadedSeason === seasonId ? audit : []}
            loading={
              (loading && !error) ||
              (!!seasonId && loadedSeason !== seasonId && !error)
            }
            zone={state.instance?.timezone ?? "Europe/Paris"}
            onHouse={(id) => {
              setSeasonId(seasons.find((s) => s.active)?.id ?? "");
              setSection("houses");
              const house = scopedHouses.find((h) => h.id === id);
              if (house) select(house);
            }}
          />
        )}
        {section === "statistics" && (
          <AdminStatistics
            season={selectedSeason}
            data={loadedSeason === seasonId ? statistics : null}
            loading={loading || loadedSeason !== seasonId}
          />
        )}
        {["content", "settings", "roles", "users"].includes(section) && (
          <AdminExistingPage
            key={section}
            section={section}
            mapStyle={mapStyle}
            user={user}
            refresh={refresh}
          />
        )}
        {section === "houses" && (
          <section className="beta-card">
            {has(user, "participants.edit") && (
              <div className="beta-house-create">
                <button
                  className="primary"
                  disabled={
                    !selectedSeason?.active || seasonFinished(selectedSeason)
                  }
                  onClick={() =>
                    void startCreate().catch((e) => setError(e.message))
                  }
                >
                  + Nouvelle maison
                </button>
                {!seasons.some((s) => s.active) ? (
                  <p>Activez une saison avant de créer une maison.</p>
                ) : (
                  !selectedSeason?.active && (
                    <p>
                      La création est réservée à la saison active.{" "}
                      <button
                        onClick={() =>
                          setSeasonId(seasons.find((s) => s.active)!.id)
                        }
                      >
                        Revenir à la saison active
                      </button>
                    </p>
                  )
                )}
              </div>
            )}
            <div className="beta-filters">
              <input
                aria-label="Rechercher une maison"
                placeholder="Maison, propriétaire, adresse…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <select
                aria-label="Statut"
                value={review}
                onChange={(e) => setReview(e.target.value)}
              >
                <option value="ALL">Tous les statuts</option>
                {Object.entries(reviews).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
                <option value="HIDDEN">Masquées</option>
              </select>
              <select
                aria-label="Disponibilité"
                value={availability}
                onChange={(e) => setAvailability(e.target.value)}
              >
                <option value="ALL">Ouvertes et fermées</option>
                <option value="OPEN">Ouvertes</option>
                <option value="CLOSED">Fermées</option>
              </select>
            </div>
            {table(list)}
          </section>
        )}
        {section === "users" && (
          <AdminUsers
            key={seasonId}
            users={users}
            roles={roles}
            user={user}
            initialCreate={userCreate}
            reload={reloadUsers}
          />
        )}
        {section === "seasons" && (
          <SeasonManager
            seasons={seasons}
            user={user}
            zone={state.instance?.timezone ?? "Europe/Paris"}
            act={seasonAction}
          />
        )}
      </main>
      {creating && selectedSeason && state.instance && (
        <div className="beta-overlay">
          <section
            className="beta-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Nouvelle maison"
          >
            <header>
              <h2>Nouvelle maison</h2>
              <button onClick={() => setCreating(false)}>Fermer</button>
            </header>
            <label>
              Rechercher un propriétaire
              <input
                aria-label="Rechercher un propriétaire"
                placeholder="Nom ou email…"
                value={ownerSearch}
                onChange={(e) => setOwnerSearch(e.target.value)}
              />
            </label>
            <label>
              Propriétaire
              <select
                aria-label="Propriétaire"
                value={ownerId}
                onChange={(e) => setOwnerId(e.target.value)}
              >
                <option value="">Choisir un propriétaire</option>
                {owners
                  .filter(
                    (u) =>
                      u.id === ownerId ||
                      (u.display_name + " " + u.email)
                        .toLocaleLowerCase()
                        .includes(ownerSearch.toLocaleLowerCase()),
                  )
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.display_name} · {u.email}
                    </option>
                  ))}
              </select>
            </label>
            {has(user, "users.manage") && (
              <button
                onClick={() => {
                  setCreating(false);
                  setUserCreate(true);
                  setSection("users");
                }}
              >
                Créer un utilisateur
              </button>
            )}
            {!ownerId ? (
              <p>
                Choisissez un utilisateur vérifié sans maison dans cette saison.
                Si nécessaire, créez ou activez un compte depuis Utilisateurs.
              </p>
            ) : (
              <ParticipationForm
                key={ownerId}
                submitLabel="Créer la maison"
                zone={state.instance.timezone}
                opens={new Date(selectedSeason.opens_at).toISOString()}
                closes={new Date(selectedSeason.closes_at).toISOString()}
                center={[state.instance.longitude, state.instance.latitude]}
                styleUrl={mapStyle}
                settings={state.participation}
                documents={state.documents}
                scheduleRef={scheduleRef}
                onSave={async (participation) => {
                  await api("admin", {
                    action: "createHouse",
                    seasonId,
                    payload: { userId: ownerId, participation },
                  });
                  setCreating(false);
                  await reload();
                  await refresh();
                }}
              />
            )}
          </section>
        </div>
      )}
      {current && (
        <div className="beta-overlay">
          <section
            className="beta-panel"
            role="dialog"
            aria-modal="true"
            aria-label={current.name}
          >
            <header>
              <h2>{current.name}</h2>
              <button
                aria-label="Fermer"
                className="secondary"
                onClick={() => setSelected(null)}
              >
                <X size={20} />
              </button>
            </header>
            <p>
              {current.owner_name} · {current.email}
            </p>
            <p>{current.address}</p>
            <p>
              {reviews[current.review_status ?? "VALIDATED"]} ·{" "}
              {current.status === "HIDDEN" ? "Masquée" : "Visible"} ·{" "}
              {open(current) ? "Ouverte" : "Fermée"}{" "}
              {current.season_is_test && (
                <span className="beta-badge">Test</span>
              )}
            </p>
            <p>{current.activities.map((a) => labels[a]).join(" · ")}</p>
            <p>
              Accueil :{" "}
              {dateLabel(
                new Date(current.starts_at).toISOString(),
                state.instance?.timezone ?? "Europe/Paris",
              )}{" "}
              →{" "}
              {dateLabel(
                new Date(current.ends_at).toISOString(),
                state.instance?.timezone ?? "Europe/Paris",
              )}
            </p>
            <p>
              {current.adaptable
                ? "Adapté aux visiteurs"
                : "Niveau de frayeur : " + current.fear}{" "}
              ·{" "}
              {current.candy_available
                ? "Bonbons disponibles"
                : "Plus de bonbons"}
            </p>
            <p>{current.rp}</p>
            <p>{current.practical}</p>
            {selectedSeason &&
              !seasonFinished(selectedSeason) &&
              has(user, "participants.edit") && (
                <div className="beta-actions">
                  <button className="secondary" onClick={() => setEdit(!edit)}>
                    {edit
                      ? "Consulter / gérer"
                      : "Modifier les informations et horaires"}
                  </button>
                </div>
              )}
            {edit && state.instance ? (
              <HouseForm
                key={current.updated_at}
                house={current}
                center={[state.instance.longitude, state.instance.latitude]}
                zone={state.instance.timezone}
                opens={current.season_opens_at}
                closes={current.season_closes_at}
                onSave={async (payload) => {
                  await act("editHouse", payload);
                  setEdit(false);
                }}
              />
            ) : (
              <>
                {selectedSeason &&
                  !seasonFinished(selectedSeason) &&
                  has(user, "participants.edit") && (
                    <>
                      {current.review_status === "PENDING" && (
                        <section>
                          <h3>Modération</h3>
                          <div className="beta-actions">
                            <AsyncButton
                              onClick={() =>
                                act("reviewHouse", { status: "VALIDATED" })
                              }
                            >
                              Valider
                            </AsyncButton>
                            <AsyncButton
                              onClick={() =>
                                act("reviewHouse", { status: "PENDING" })
                              }
                            >
                              Mettre en attente
                            </AsyncButton>
                          </div>
                          <label>
                            Motif du refus
                            <textarea
                              maxLength={500}
                              value={reason}
                              onChange={(e) => setReason(e.target.value)}
                            />
                          </label>
                          <AsyncButton
                            onClick={() =>
                              act("reviewHouse", { status: "REFUSED", reason })
                            }
                          >
                            Refuser avec motif
                          </AsyncButton>
                        </section>
                      )}
                      <section>
                        <h3>Disponibilité</h3>
                        <div className="beta-actions">
                          <AsyncButton
                            onClick={() =>
                              act("houseActivity", {
                                action:
                                  current.activity === "ACTIVE"
                                    ? "end"
                                    : "resume",
                              })
                            }
                          >
                            {current.activity === "ACTIVE"
                              ? "Fermer la maison"
                              : "Rouvrir la maison"}
                          </AsyncButton>
                          {current.candy_available &&
                          current.activities.includes("CANDY") ? (
                            <>
                              <AsyncButton
                                onClick={() =>
                                  act("houseActivity", {
                                    action: "deplete",
                                    choice: "close",
                                  })
                                }
                              >
                                Plus de bonbons et fermer
                              </AsyncButton>
                              {current.activities.includes("ACTING") && (
                                <AsyncButton
                                  onClick={() =>
                                    act("houseActivity", {
                                      action: "deplete",
                                      choice: "continue",
                                    })
                                  }
                                >
                                  Plus de bonbons, continuer la mise en scène
                                </AsyncButton>
                              )}
                            </>
                          ) : (
                            <AsyncButton
                              onClick={() =>
                                act("houseActivity", {
                                  action: "candy",
                                  available: true,
                                })
                              }
                            >
                              Remettre les bonbons disponibles
                            </AsyncButton>
                          )}
                        </div>
                      </section>
                    </>
                  )}
                {selectedSeason &&
                  !seasonFinished(selectedSeason) &&
                  has(user, "participants.edit") && (
                    <section>
                      <h3>Visibilité administrative</h3>
                      <p>La visibilité est indépendante de la modération.</p>
                      <AsyncButton
                        onClick={() =>
                          act(
                            "visibility",
                            current.status === "HIDDEN" ? "VISIBLE" : "HIDDEN",
                          )
                        }
                      >
                        {current.status === "HIDDEN" ? "Réafficher" : "Masquer"}
                      </AsyncButton>
                    </section>
                  )}
                {selectedSeason &&
                  !seasonFinished(selectedSeason) &&
                  has(user, "participants.delete") && (
                    <section>
                      <h3>Suppression</h3>
                      <AsyncButton
                        danger
                        onClick={async () => {
                          if (
                            !window.confirm(
                              "Supprimer définitivement cette maison ?",
                            )
                          )
                            return;
                          await act("deleteHouse", "SUPPRIMER LA MAISON");
                          setSelected(null);
                        }}
                      >
                        Supprimer la maison
                      </AsyncButton>
                    </section>
                  )}
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
