"use client";
import { useCallback, useEffect, useState, useRef } from "react";
import Link from "next/link";
import { confirmDraftNavigation } from "./useDraftGuard";
import {
  X,
  LayoutDashboard,
  House as HouseIcon,
  Users,
  CalendarDays,
  ChartColumn,
  FileText,
  Mail,
  Activity,
  Settings,
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
import AdminDashboard, {
  type AdminAudit,
  type AdminMetrics,
} from "./AdminDashboard";
import AdminStatistics, { type SeasonStatistics } from "./AdminStatistics";
import Campaigns from "./Campaigns";
import AdminActivity from "./AdminActivity";
import AdminExistingPage from "./AdminExistingPage";
import { seasonFinished } from "../lib/domain";
import { houseAvailability } from "../lib/house-availability";
import "./AdminBeta.css";
import ManorMark from "./ManorMark";
import MessageTemplates from "./MessageTemplates";
import RefusalPreview from "./RefusalPreview";
import {
  DataTable,
  Button,
  Select,
  Input,
  Dialog,
  TextArea,
  ActionMenu,
  Pagination,
} from "./ui";
import {
  refusalReasons,
  refusalText,
  type RefusalCode,
} from "../lib/refusal-reasons";
type ManagedHouse = House & {
  email: string;
  owner_name: string;
  season_opens_at: string;
  season_closes_at: string;
  season_is_test: boolean;
};
type Dashboard = AdminMetrics;
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
  const [section, setSection] = useState(
      () =>
        [
          ["dashboard", "stats.read"],
          ["houses", "participants.read"],
          ["users", "users.read"],
          ["seasons", "season.read"],
          ["communications", "communications.read"],
          ["activity", "audit.read"],
          ["content", "content.manage"],
          ["settings", "settings.read"],
        ].find(([, p]) => has(user, p))?.[0] ?? "none",
    ),
    [houses, setHouses] = useState<ManagedHouse[]>([]),
    [statistics, setStatistics] = useState<SeasonStatistics | null>(null),
    [userCreate, setUserCreate] = useState(false),
    [ownerSearch, setOwnerSearch] = useState(""),
    [dashboard, setDashboard] = useState<Dashboard | null>(null),
    [audit, setAudit] = useState<Audit[]>([]),
    [auditScope, setAuditScope] = useState("season"),
    [reexamining, setReexamining] = useState(false),
    [error, setError] = useState(""),
    [selected, setSelected] = useState<string | null>(null),
    [edit, setEdit] = useState(false),
    [reason, setReason] = useState(""),
    [reasonCode, setReasonCode] = useState<RefusalCode>("OTHER"),
    [search, setSearch] = useState(""),
    [review, setReview] = useState("ALL"),
    [availability, setAvailability] = useState("ALL"),
    [housePage, setHousePage] = useState(1),
    [theme, setTheme] = useState("system"),
    [menuOpen, setMenuOpen] = useState(false),
    [loading, setLoading] = useState(true),
    [users, setUsers] = useState<ManagedUser[]>([]),
    [roles, setRoles] = useState<
      { id: string; name: string; permissions: string[] }[]
    >([]);
  const [seasons, setSeasons] = useState<Season[]>([]),
    [seasonId, setSeasonId] = useState(""),
    [loadedView, setLoadedView] = useState(""),
    [creating, setCreating] = useState(false),
    [ownerId, setOwnerId] = useState(""),
    [owners, setOwners] = useState<ManagedUser[]>([]);
  const [seasonsLoaded, setSeasonsLoaded] = useState(false);
  const [pendingHouseId, setPendingHouseId] = useState<string | null>(null);
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  const activeSeasonId = seasons.find((s) => s.active)?.id ?? "";
  const seasonScoped = [
    "houses",
    "statistics",
    "communications",
    "activity",
  ].includes(section);
  const viewSeasonId =
    section === "dashboard" ? activeSeasonId : seasonScoped ? seasonId : "";
  const viewKey =
    section +
    ":" +
    viewSeasonId +
    (section === "activity" ? ":" + auditScope : "");
  const selectedSeason = seasons.find((s) => s.id === seasonId),
    scheduleRef = useRef<HTMLElement | null>(null),
    generation = useRef(0),
    currentSeason = useRef(seasonId);
  useEffect(() => {
    currentSeason.current = seasonId;
  }, [seasonId]);
  const availabilityLabel = (h: ManagedHouse) =>
    houseAvailability(
      h,
      state.serverTime ? +new Date(state.serverTime) : 0,
      !!selectedSeason?.active,
    );
  const open = (h: ManagedHouse) => availabilityLabel(h) === "Ouverte";
  const seasonStorageKey =
    "halloween.admin.season." + state.instance?.id + "." + user.id;
  const reloadSeasons = useCallback(async () => {
    if (!has(user, "season.read")) {
      const rows = state.season
        ? [
            {
              ...state.season,
              name: "Halloween " + state.season.year,
              active: true,
              archived: false,
            } as Season,
          ]
        : [];
      setSeasons(rows);
      setSeasonsLoaded(true);
      setSeasonId(rows[0]?.id ?? "");
      return;
    }
    const rows = await api<Season[]>("admin/seasons");
    setSeasons(rows);
    setSeasonsLoaded(true);
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
  }, [seasonStorageKey, user, state.season]);
  useEffect(() => {
    void reloadSeasons().catch((e) => {
      setError(e.message);
      setLoading(false);
    });
  }, [reloadSeasons]);
  useEffect(() => {
    if (seasonId) {
      try {
        localStorage.setItem(seasonStorageKey, seasonId);
      } catch {}
    }
  }, [seasonId, seasonStorageKey]);
  const reload = useCallback(async () => {
    const revision = ++generation.current;
    const query = viewSeasonId
      ? "?seasonId=" + encodeURIComponent(viewSeasonId)
      : "";
    setLoading(true);
    try {
      const [h, d, a, stats, u, r] = await Promise.all([
        ["dashboard", "houses"].includes(section) &&
        has(user, "participants.read")
          ? api<ManagedHouse[]>("admin/houses" + query)
          : [],
        section === "dashboard" && has(user, "stats.read")
          ? api<Dashboard>("admin/dashboard" + query)
          : null,
        has(user, "audit.read") && ["dashboard", "activity"].includes(section)
          ? section === "dashboard"
            ? Promise.all([
                api<Audit[]>(
                  "admin/audit" + query + (query ? "&" : "?") + "scope=season",
                ),
                api<Audit[]>("admin/audit?scope=global"),
              ]).then((rows) =>
                rows
                  .flat()
                  .sort(
                    (a, b) => +new Date(b.created_at) - +new Date(a.created_at),
                  ),
              )
            : api<Audit[]>(
                "admin/audit" +
                  query +
                  (query ? "&" : "?") +
                  "scope=" +
                  auditScope,
              )
          : [],
        section === "statistics" && has(user, "stats.read")
          ? api<SeasonStatistics | null>("admin/statistics" + query)
          : null,
        section === "users" && has(user, "users.read")
          ? api<ManagedUser[]>("admin/users")
          : [],
        section === "users" && has(user, "users.read")
          ? api<{ id: string; name: string; permissions: string[] }[]>(
              "admin/roles",
            )
          : [],
      ]);
      if (revision !== generation.current) return;
      setStatistics(stats);
      setHouses(h);
      setDashboard(d);
      setAudit(a);
      setUsers(u);
      setRoles(r);
      setLoadedView(viewKey);
      setError("");
    } catch (e) {
      if (revision === generation.current) setError((e as Error).message);
    } finally {
      if (revision === generation.current) setLoading(false);
    }
  }, [user, viewSeasonId, viewKey, section, auditScope]);
  useEffect(() => {
    setSelected(null);
    setCreating(false);
    if (["dashboard", "users"].includes(section)) return;
    setHouses([]);
    setUsers([]);
    setDashboard(null);
    setAudit([]);
    setLoadedView("");
  }, [seasonId, section]);
  useEffect(() => {
    if (seasonsLoaded) void reload();
  }, [reload, seasonsLoaded]);
  useEffect(() => {
    if (section !== "houses" || loadedView !== viewKey || !pendingHouseId)
      return;
    const house = houses.find((h) => h.id === pendingHouseId);
    if (house) {
      setSelected(house.id);
      setEdit(false);
      setReexamining(false);
      setReason(house.refusal_reason ?? "");
    }
    setPendingHouseId(null);
  }, [section, loadedView, viewKey, pendingHouseId, houses]);
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
  const current = (loadedView === viewKey ? houses : []).find(
    (h) => h.id === selected,
  );
  async function act(action: string, payload?: unknown) {
    await api("admin", { action, id: selected, payload, seasonId });
    await reload();
    await refresh();
  }
  const scopedHouses = loadedView === viewKey ? houses : [];
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
  function select(h: ManagedHouse, editing = false) {
    setSelected(h.id);
    setEdit(editing);
    setReexamining(false);
    setReason(h.refusal_reason ?? "");
  }
  function table(items: ManagedHouse[], moderation = false) {
    return (
      <div className="beta-table-scroll">
        <DataTable className="houses-table">
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
            {items
              .slice(
                (Math.min(
                  housePage,
                  Math.max(1, Math.ceil(items.length / 25)),
                ) -
                  1) *
                  25,
                Math.min(housePage, Math.max(1, Math.ceil(items.length / 25))) *
                  25,
              )
              .map((h) => (
                <tr key={h.id}>
                  <td data-label="Maison">
                    <strong>{h.name}</strong>
                    {h.season_is_test && (
                      <span className="beta-badge">Test</span>
                    )}
                    <small>
                      {h.owner_name} · {h.email}
                    </small>
                  </td>
                  <td data-label="Adresse">{h.address}</td>
                  <td data-label="Modération">
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
                      <td data-label="Disponibilité">
                        {availabilityLabel(h)}
                        <small>
                          {h.candy_available
                            ? "Bonbons disponibles"
                            : "Plus de bonbons"}
                        </small>
                      </td>
                      <td data-label="Activités">
                        {h.activities.map((a) => labels[a]).join(" · ")}
                      </td>
                      <td data-label="Modification">
                        {h.updated_at
                          ? dateLabel(
                              h.updated_at,
                              state.instance?.timezone ?? "Europe/Paris",
                            )
                          : "—"}
                      </td>
                    </>
                  )}
                  <td data-label="Actions">
                    <div className="row-actions house-row-actions">
                      <Button
                        className="secondary desktop-row-action"
                        onClick={() => select(h)}
                      >
                        {moderation ? "Voir / Modérer" : "Gérer"}
                      </Button>
                      {has(user, "participants.edit") &&
                        selectedSeason &&
                        !seasonFinished(selectedSeason) && (
                          <Button
                            className="desktop-row-action"
                            aria-label={"Modifier " + h.name}
                            onClick={() => select(h, true)}
                          >
                            Modifier
                          </Button>
                        )}
                      <ActionMenu label={"Actions pour " + h.name}>
                        <Button onClick={() => select(h)}>Voir la fiche</Button>
                        {has(user, "users.read") && (
                          <Button
                            onClick={() => {
                              setPendingUserId(h.user_id);
                              setSection("users");
                            }}
                          >
                            Voir le propriétaire
                          </Button>
                        )}
                        {has(user, "participants.edit") &&
                          selectedSeason &&
                          !seasonFinished(selectedSeason) && (
                            <>
                              <Button onClick={() => select(h, true)}>
                                Modifier la maison
                              </Button>
                              <AsyncButton
                                onClick={async () => {
                                  await api("admin", {
                                    action: "houseActivity",
                                    id: h.id,
                                    seasonId,
                                    payload: {
                                      action:
                                        h.activity === "ACTIVE"
                                          ? "pause"
                                          : "resume",
                                    },
                                  });
                                  await reload();
                                }}
                              >
                                {h.activity === "ACTIVE"
                                  ? "Mettre en pause"
                                  : "Reprendre l’accueil"}
                              </AsyncButton>
                              <AsyncButton
                                onClick={async () => {
                                  await api("admin", {
                                    action: "visibility",
                                    id: h.id,
                                    seasonId,
                                    payload:
                                      h.status === "HIDDEN"
                                        ? "VISIBLE"
                                        : "HIDDEN",
                                  });
                                  await reload();
                                }}
                              >
                                {h.status === "HIDDEN"
                                  ? "Réafficher"
                                  : "Masquer"}
                              </AsyncButton>
                            </>
                          )}
                        {has(user, "participants.delete") &&
                          selectedSeason &&
                          !seasonFinished(selectedSeason) && (
                            <AsyncButton
                              danger
                              onClick={async () => {
                                await api("admin", {
                                  action: "deleteHouse",
                                  id: h.id,
                                  seasonId,
                                  payload: "SUPPRIMER LA MAISON",
                                });
                                await reload();
                              }}
                            >
                              Supprimer la maison
                            </AsyncButton>
                          )}
                      </ActionMenu>
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </DataTable>
        <Pagination
          count={items.length}
          page={Math.min(housePage, Math.max(1, Math.ceil(items.length / 25)))}
          onPage={setHousePage}
        />
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
        <Button
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
          <span className="admin-brand-mark">
            <ManorMark />
          </span>
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
              ["communications", "Communications", "communications.read", Mail],
              ["activity", "Activité", "audit.read", Activity],
              ["content", "Textes & documents", "content.manage", FileText],
              ["settings", "Paramètres", "settings.read", Settings],
            ] as const
          ).map(
            ([id, title, permission, Icon]) =>
              has(user, permission) && (
                <Button
                  key={id}
                  className={section === id ? "is-current" : ""}
                  aria-current={section === id ? "page" : undefined}
                  onClick={() => {
                    if (!confirmDraftNavigation()) return;
                    setUserCreate(false);
                    setSection(id);
                    setMenuOpen(false);
                  }}
                >
                  <Icon size={18} />
                  {title}
                </Button>
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
          <Button
            className="beta-menu-toggle"
            aria-label="Ouvrir la navigation"
            aria-expanded={menuOpen}
            aria-controls="admin-navigation"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            <Menu size={20} />
          </Button>
          <div className="beta-page-title">
            <h1>
              {
                {
                  dashboard: "Tableau de bord",
                  houses: "Maisons",
                  users: "Utilisateurs",
                  statistics: "Statistiques",
                  communications: "Communications",
                  activity: "Activité",
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
            {seasonScoped && (
              <label className="beta-season-select">
                Saison consultée
                <Select
                  aria-label={
                    section === "statistics"
                      ? "Saison consultée"
                      : "Saison du back-office"
                  }
                  value={seasonId}
                  onChange={(e) => {
                    generation.current++;
                    setLoadedView("");
                    setPendingHouseId(null);
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
                </Select>
              </label>
            )}
            <label className="beta-theme-select">
              <SunMoon size={17} />
              <Select
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
              </Select>
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
              Carte :{" "}
              {state.earlyAccess
                ? "accès anticipé Super Admin"
                : state.mapAccessible
                  ? "ouverte"
                  : "indisponible"}
            </span>
            <Button
              aria-label="Actualiser les données"
              onClick={() => {
                void reloadSeasons().catch((e) => setError(e.message));
                void reload();
              }}
            >
              <RefreshCw size={15} />
            </Button>
          </div>
        </div>
        <Notice error={error} />
        {section === "dashboard" &&
          !seasons.some((s) => s.active) &&
          !loading && (
            <section className="beta-card">
              <h2>Aucune saison active</h2>
              <p>Activez une saison pour consulter ses indicateurs.</p>
              <Button className="primary" onClick={() => setSection("seasons")}>
                Gérer les saisons
              </Button>
            </section>
          )}
        {section === "dashboard" && seasons.some((s) => s.active) && (
          <Button
            className="stats-link"
            onClick={() => {
              setSeasonId(seasons.find((s) => s.active)!.id);
              setSection("statistics");
            }}
          >
            Voir toutes les statistiques
          </Button>
        )}
        {section === "dashboard" && !error && seasons.some((s) => s.active) && (
          <AdminDashboard
            metrics={loadedView === viewKey ? dashboard : null}
            pending={pending
              .slice()
              .sort(
                (a, b) =>
                  +new Date(b.submitted_at ?? 0) -
                  +new Date(a.submitted_at ?? 0),
              )}
            audit={loadedView === viewKey ? audit : []}
            loading={
              (loading && !error) ||
              (!!seasonId && loadedView !== viewKey && !error)
            }
            zone={state.instance?.timezone ?? "Europe/Paris"}
            onActivity={
              has(user, "audit.read")
                ? () => {
                    setSeasonId(seasons.find((s) => s.active)?.id ?? "");
                    setAuditScope("season");
                    setSection("activity");
                  }
                : undefined
            }
            onHouse={(id) => {
              setSeasonId(seasons.find((s) => s.active)?.id ?? "");
              setSection("houses");
              setPendingHouseId(id);
            }}
          />
        )}
        {section === "communications" &&
          selectedSeason &&
          has(user, "communications.read") && (
            <Campaigns
              key={selectedSeason.id}
              season={selectedSeason}
              zone={state.instance?.timezone ?? "Europe/Paris"}
              user={user}
            />
          )}
        {section === "communications" && <MessageTemplates user={user} />}
        {section === "communications" && !selectedSeason && (
          <p>Aucune saison consultée.</p>
        )}
        {section === "activity" && !error && has(user, "audit.read") && (
          <AdminActivity
            seasonId={viewSeasonId}
            onHouse={(id) => {
              setPendingHouseId(id);
              setSection("houses");
            }}
            audit={loadedView === viewKey ? audit : []}
            scope={auditScope}
            onScope={setAuditScope}
            loading={loading}
            zone={state.instance?.timezone ?? "Europe/Paris"}
          />
        )}
        {section === "statistics" && !error && (
          <AdminStatistics
            zone={state.instance?.timezone}
            season={selectedSeason}
            data={loadedView === viewKey ? statistics : null}
            loading={!error && (loading || loadedView !== viewKey)}
          />
        )}
        {["content", "settings"].includes(section) && (
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
            <p className="small muted">
              {
                scopedHouses.filter((h) => h.review_status === "VALIDATED")
                  .length
              }{" "}
              validées ·{" "}
              {scopedHouses.filter((h) => h.review_status === "PENDING").length}{" "}
              en attente ·{" "}
              {scopedHouses.filter((h) => h.review_status === "REFUSED").length}{" "}
              refusées
            </p>
            {has(user, "participants.edit") && (
              <div className="beta-house-create">
                <Button
                  className="primary"
                  disabled={
                    !selectedSeason?.active || seasonFinished(selectedSeason)
                  }
                  onClick={() =>
                    void startCreate().catch((e) => setError(e.message))
                  }
                >
                  + Nouvelle maison
                </Button>
                {!seasons.some((s) => s.active) ? (
                  <p>Activez une saison avant de créer une maison.</p>
                ) : (
                  !selectedSeason?.active && (
                    <p>
                      La création est réservée à la saison active.{" "}
                      <Button
                        onClick={() =>
                          setSeasonId(seasons.find((s) => s.active)!.id)
                        }
                      >
                        Revenir à la saison active
                      </Button>
                    </p>
                  )
                )}
              </div>
            )}
            <div className="beta-filters">
              <Input
                aria-label="Rechercher une maison"
                placeholder="Maison, propriétaire, adresse…"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setHousePage(1);
                }}
              />
              <Select
                aria-label="Statut"
                value={review}
                onChange={(e) => {
                  setReview(e.target.value);
                  setHousePage(1);
                }}
              >
                <option value="ALL">Tous les statuts</option>
                {Object.entries(reviews).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
                <option value="HIDDEN">Masquées</option>
              </Select>
              <Select
                aria-label="Disponibilité"
                value={availability}
                onChange={(e) => {
                  setAvailability(e.target.value);
                  setHousePage(1);
                }}
              >
                <option value="ALL">Ouvertes et fermées</option>
                <option value="OPEN">Ouvertes</option>
                <option value="CLOSED">Fermées</option>
              </Select>
            </div>
            {loading && !error ? (
              <p role="status">Chargement des maisons…</p>
            ) : (
              !error && table(list)
            )}
          </section>
        )}
        {section === "users" &&
          !error &&
          (loadedView !== viewKey ? (
            <p role="status">Chargement des utilisateurs…</p>
          ) : (
            <AdminUsers
              users={users}
              roles={roles}
              user={user}
              initialCreate={userCreate}
              initialUserId={pendingUserId}
              onClose={() => setPendingUserId(null)}
              reload={reload}
              seasonName={seasons.find((s) => s.active)?.name}
              onHouse={(id) => {
                setPendingUserId(null);
                setPendingHouseId(id);
                setSection("houses");
                setSeasonId(activeSeasonId);
              }}
            />
          ))}
        {section === "seasons" && (
          <SeasonManager
            seasons={seasons}
            user={user}
            zone={state.instance?.timezone ?? "Europe/Paris"}
            act={seasonAction}
            defaults={
              state.instance
                ? {
                    open: state.instance.defaultOpen,
                    close: state.instance.defaultClose,
                  }
                : undefined
            }
          />
        )}
      </main>
      {creating && selectedSeason && state.instance && (
        <div className="beta-overlay">
          <Dialog
            className="beta-panel"
            role="dialog"
            onClick={(event) => event.stopPropagation()}
            aria-modal="true"
            aria-label="Nouvelle maison"
          >
            <header>
              <h2>Nouvelle maison</h2>
              <Button
                className="close"
                aria-label="Fermer la création"
                onClick={() => setCreating(false)}
              >
                <X />
              </Button>
            </header>
            <label>
              Rechercher un propriétaire
              <Input
                aria-label="Rechercher un propriétaire"
                placeholder="Nom ou email…"
                value={ownerSearch}
                onChange={(e) => setOwnerSearch(e.target.value)}
              />
            </label>
            <label>
              Propriétaire
              <Select
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
              </Select>
            </label>
            {has(user, "users.manage") && (
              <Button
                onClick={() => {
                  setCreating(false);
                  setUserCreate(true);
                  setSection("users");
                }}
              >
                Créer un utilisateur
              </Button>
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
                isTest={selectedSeason.is_test}
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
          </Dialog>
        </div>
      )}
      {current && (
        <div className="beta-overlay">
          <Dialog
            className="beta-panel"
            role="dialog"
            onClick={(event) => event.stopPropagation()}
            aria-modal="true"
            aria-label={current.name}
            data-house-sheet="true"
          >
            <header>
              <h2>{current.name}</h2>
              <Button
                className="close secondary"
                aria-label="Fermer"
                onClick={() => {
                  if (confirmDraftNavigation()) setSelected(null);
                }}
              >
                <X size={20} />
              </Button>
            </header>
            <section className="house-information">
              <h3>Informations</h3>
              <p>
                {current.owner_name} · {current.email}
                {has(user, "users.read") && (
                  <Button
                    onClick={() => {
                      setPendingUserId(current.user_id);
                      setSelected(null);
                      setSection("users");
                    }}
                  >
                    Voir le propriétaire
                  </Button>
                )}
              </p>
              <p>{current.address}</p>
              <p className="small muted">
                Position : {current.latitude.toFixed(5)},{" "}
                {current.longitude.toFixed(5)}
              </p>
              <p>
                {reviews[current.review_status ?? "VALIDATED"]} ·{" "}
                {current.status === "HIDDEN" ? "Masquée" : "Visible"} ·{" "}
                {availabilityLabel(current)}{" "}
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
            </section>
            {selectedSeason &&
              !seasonFinished(selectedSeason) &&
              has(user, "participants.edit") &&
              edit && (
                <div className="beta-actions">
                  <Button
                    className="secondary"
                    onClick={() => {
                      if (!edit || confirmDraftNavigation()) setEdit(!edit);
                    }}
                  >
                    {edit
                      ? "Consulter / gérer"
                      : "Modifier les informations et horaires"}
                  </Button>
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
                isTest={current.season_is_test}
                styleUrl={mapStyle}
                settings={state.participation}
                onSave={async (payload) => {
                  await act("editHouse", payload);
                  setEdit(false);
                }}
              />
            ) : (
              <>
                {(!selectedSeason ||
                  seasonFinished(selectedSeason) ||
                  !has(user, "participants.edit")) && (
                  <>
                    <section className="house-moderation">
                      <h3>Modération</h3>
                      <p>
                        {reviews[current.review_status ?? "VALIDATED"]} ·
                        Soumission :{" "}
                        {current.submitted_at
                          ? dateLabel(
                              current.submitted_at,
                              state.instance?.timezone ?? "Europe/Paris",
                            )
                          : "Date non disponible"}
                      </p>
                      <p>{current.refusal_reason}</p>
                    </section>
                    <section>
                      <h3>Gestion</h3>
                      <p>
                        {availabilityLabel(current)} ·{" "}
                        {current.status === "HIDDEN" ? "Masquée" : "Visible"} ·{" "}
                        {current.candy_available
                          ? "Bonbons disponibles"
                          : "Plus de bonbons"}
                      </p>
                      <p className="small muted">
                        Consultation en lecture seule.
                      </p>
                    </section>
                  </>
                )}
                {selectedSeason &&
                  !seasonFinished(selectedSeason) &&
                  has(user, "participants.edit") && (
                    <>
                      <section className="house-moderation">
                        <h3>Modération</h3>
                        <p>
                          {reviews[current.review_status ?? "VALIDATED"]} ·
                          Soumission :{" "}
                          {current.submitted_at
                            ? dateLabel(
                                current.submitted_at,
                                state.instance?.timezone ?? "Europe/Paris",
                              )
                            : "Date non disponible"}
                        </p>
                        {current.review_status === "VALIDATED" && (
                          <AsyncButton
                            onClick={() =>
                              act("reviewHouse", { status: "PENDING" })
                            }
                          >
                            Remettre en attente
                          </AsyncButton>
                        )}
                        {current.review_status === "REFUSED" &&
                          !reexamining && (
                            <Button
                              className="primary"
                              onClick={() => setReexamining(true)}
                            >
                              Réexaminer
                            </Button>
                          )}
                        {(current.review_status === "PENDING" ||
                          (current.review_status === "REFUSED" &&
                            reexamining)) && (
                          <section>
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
                              <Select
                                aria-label="Motif du refus"
                                value={reasonCode}
                                onChange={(e) => {
                                  setReasonCode(e.target.value as RefusalCode);
                                  setReason("");
                                }}
                              >
                                {Object.entries(refusalReasons).map(
                                  ([code, label]) => (
                                    <option key={code} value={code}>
                                      {label}
                                    </option>
                                  ),
                                )}
                              </Select>
                              <TextArea
                                aria-label="Précisions du refus"
                                maxLength={500}
                                value={reason}
                                onChange={(e) => setReason(e.target.value)}
                              />
                            </label>
                            <AsyncButton
                              onClick={() =>
                                act("reviewHouse", {
                                  status: "REFUSED",
                                  reason,
                                  reason_code: reasonCode,
                                })
                              }
                            >
                              Refuser avec motif
                            </AsyncButton>
                            <p className="small">
                              Motif transmis au propriétaire :{" "}
                              {refusalText(reasonCode, reason) ||
                                "Une explication est obligatoire."}
                            </p>
                            <RefusalPreview
                              id={current.id}
                              reason={refusalText(reasonCode, reason).slice(
                                0,
                                500,
                              )}
                            />
                          </section>
                        )}
                      </section>
                      <section>
                        <h3>Gestion</h3>
                        <Button
                          className="secondary"
                          onClick={() => setEdit(true)}
                        >
                          Modifier les informations et horaires
                        </Button>
                        <p className="small muted">
                          Disponibilité de l’accueil et bonbons, indépendants de
                          la décision de modération.
                        </p>
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
                      <h4>Visibilité administrative</h4>
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
                      <h4>Suppression</h4>
                      <AsyncButton
                        danger
                        onClick={async () => {
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
          </Dialog>
        </div>
      )}
    </div>
  );
}
