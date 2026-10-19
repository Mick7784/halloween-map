"use client";
import { Fragment, useCallback, useEffect, useState, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
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
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import type { House, User, Season } from "../lib/domain";
import {
  api,
  has,
  Notice,
  Badges,
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
import AdminMobileStats from "./AdminMobileStats";
import AdminInlineDetail from "./AdminInlineDetail";
import Campaigns from "./Campaigns";
import AdminActivity from "./AdminActivity";
import AdminExistingPage from "./AdminExistingPage";
import { houseAvailability } from "../lib/house-availability";
import { selectStudioCollection } from "../lib/studio-collection";
import StudioCollectionControls from "./StudioCollectionControls";
import { visibleStudioNavigation } from "../lib/studio-navigation";
import { halloweenAdminNavigation } from "../lib/halloween-admin-navigation";
import "./AdminBeta.css";
import "./AdminStudioSkin.css";
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
function dateLabel(value: string | Date, zone: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: zone,
  }).format(value instanceof Date ? value : new Date(value));
}
// Product icon bindings are presentation-only; the module/permission model is
// a framework-independent DomotiK Studio navigation contract.
const studioNavIcons = {
  dashboard: LayoutDashboard,
  houses: HouseIcon,
  users: Users,
  seasons: CalendarDays,
  statistics: ChartColumn,
  activity: Activity,
  communications: Mail,
  content: FileText,
  settings: Settings,
} as const;
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
    [detailTab, setDetailTab] = useState<"info" | "moderation">("info"),
    [reason, setReason] = useState(""),
    [reasonCode, setReasonCode] = useState<RefusalCode>("OTHER"),
    [search, setSearch] = useState(""),
    [review, setReview] = useState("ALL"),
    [availability, setAvailability] = useState("ALL"),
    [housePage, setHousePage] = useState(1),
    [housePageSize, setHousePageSize] = useState(25),
    [houseSort, setHouseSort] = useState("name"),
    [houseSortDirection, setHouseSortDirection] = useState<"asc" | "desc">("asc"),
    [theme, setTheme] = useState("system"),
    [menuOpen, setMenuOpen] = useState(false),
    [mobileView, setMobileView] = useState(false),
    [sidebarCollapsed, setSidebarCollapsed] = useState(false),
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
  useEffect(() => {
    const media = window.matchMedia("(max-width: 700px)");
    const update = () => setMobileView(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
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
          rows.filter((s) => !s.archived && !s.purged_at)
            .sort((a, b) => +new Date(a.opens_at) - +new Date(b.opens_at))[0]?.id ??
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
      setSearch("");
      setReview("ALL");
      setAvailability("ALL");
      setHouseSort("name");
      setHouseSortDirection("asc");
      const sorted = houses.slice().sort((a, b) =>
        a.name.localeCompare(b.name, "fr", { sensitivity: "base", numeric: true }),
      );
      const index = sorted.findIndex((h) => h.id === house.id);
      if (index >= 0) setHousePage(Math.floor(index / housePageSize) + 1);
    }
    setPendingHouseId(null);
  }, [section, loadedView, viewKey, pendingHouseId, houses, housePageSize]);
  async function seasonAction(action: string, payload: unknown, id?: string) {
    await api("admin", { action, payload, id });
    await reloadSeasons();
    if (action !== "deleteSeason") await reload();
    await refresh();
  }
  async function startCreate() {
    const targetSeasonId = activeSeasonId || seasonId;
    currentSeason.current = targetSeasonId;
    setSeasonId(targetSeasonId);
    const available = await api<ManagedUser[]>(
      "admin/eligibleOwners?seasonId=" + targetSeasonId,
    );
    if (currentSeason.current !== targetSeasonId) return;
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
    try {
      setSidebarCollapsed(
        localStorage.getItem("halloween.admin.sidebar.collapsed") === "true",
      );
    } catch {}
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
  function select(h: ManagedHouse, editing = false, tab: "info" | "moderation" = "info") {
    if (selected && !confirmDraftNavigation()) return;
    if (selected === h.id && !editing && tab === "info") {
      setSelected(null);
      setEdit(false);
      return;
    }
    setSelected(h.id);
    setEdit(editing);
    setDetailTab(tab);
    setReexamining(tab === "moderation" && h.review_status === "REFUSED");
    setReasonCode("OTHER");
    setReason(tab === "moderation" ? "" : h.refusal_reason ?? "");
  }
  async function moderateNow(h: ManagedHouse) {
    await api("admin", {
      action: "reviewHouse", id: h.id, seasonId,
      payload: { status: "VALIDATED" },
    });
    await reload();
  }
  async function toggleHouseVisibility(h: ManagedHouse) {
    if (h.status !== "HIDDEN" && !window.confirm("Masquer cette maison de la carte ?")) return;
    await api("admin", {
      action: "visibility", id: h.id, seasonId,
      payload: h.status === "HIDDEN" ? "VISIBLE" : "HIDDEN",
    });
    await reload();
  }
  function table(items: ManagedHouse[], moderation = false) {
    // Shared Studio collection engine keeps the existing column comparison,
    // stable order and one-based paging, without changing business filters.
    const visible = selectStudioCollection(items, {
      compare: (a, b) => {
        const value = (h: ManagedHouse) =>
          ({
            name: h.name,
            address: h.address,
            status: h.review_status ?? "",
            availability: availabilityLabel(h),
            activities: h.activities.join(", "),
            modification: String(h.updated_at ?? ""),
            submission: String(h.submitted_at ?? ""),
          })[houseSort] ?? h.name;
        return value(a).localeCompare(value(b), "fr", {
          sensitivity: "base",
          numeric: true,
        });
      },
      direction: houseSortDirection,
      page: housePage,
      pageSize: housePageSize,
    });
    function sortHeader(id: string, label: string) {
      return (
        <th aria-sort={houseSort === id
          ? (houseSortDirection === "asc" ? "ascending" : "descending")
          : "none"}>
          <Button type="button" className="admin-sort-column" onClick={() => {
            if (houseSort === id)
              setHouseSortDirection((v) => v === "asc" ? "desc" : "asc");
            else {
              setHouseSort(id);
              setHouseSortDirection("asc");
            }
            setHousePage(1);
          }}>
            {label} {houseSort === id ? (houseSortDirection === "asc" ? "↑" : "↓") : ""}
          </Button>
        </th>
      );
    }
    return (
      <div className="beta-table-scroll">
        <DataTable className="houses-table">
          <thead>
            <tr>
              {sortHeader("name", "Maison / propriétaire")}
              {sortHeader("address", "Adresse")}
              {sortHeader("status", "Statut")}
              {moderation ? (
                sortHeader("submission", "Soumission")
              ) : (
                <>
                  {sortHeader("availability", "Disponibilité")}
                  {sortHeader("activities", "Activités")}
                  {sortHeader("modification", "Modification")}
                </>
              )}
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {visible.rows.map((h) => (
                <Fragment key={h.id}>
                <tr
                  className="admin-clickable-row"
                  tabIndex={0}
                  aria-expanded={current?.id === h.id}
                  onClick={(event) => {
                    if ((event.target as HTMLElement).closest("button,a,summary,input,select,textarea")) return;
                    select(h);
                  }}
                  onKeyDown={(event) => {
                    if (event.target !== event.currentTarget) return;
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      select(h);
                    }
                  }}
                >
                  <td data-label="Maison">
                    <strong>{h.name}</strong>
                    <small>
                      {h.owner_name} · {h.email}
                    </small>
                  </td>
                  <td data-label="Adresse">{h.address}</td>
                  <td data-label="Modération">
                    <span className={"house-review-status " + (h.review_status ?? "VALIDATED").toLowerCase()}>
                      {reviews[h.review_status ?? "VALIDATED"]}
                    </span>
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
                        <Badges activities={h.activities} />
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
                      {has(user, "participants.edit") && selectedSeason && !selectedSeason.archived && !selectedSeason.purged_at && (
                        <>
                          {h.review_status === "PENDING" && (
                            <>
                              <AsyncButton className="desktop-row-action" onClick={() => moderateNow(h)}>Valider</AsyncButton>
                              <Button className="desktop-row-action" onClick={() => select(h, false, "moderation")}>Refuser</Button>
                            </>
                          )}
                          {h.review_status === "REFUSED" && (
                            <Button className="desktop-row-action" onClick={() => select(h, false, "moderation")}>Réexaminer</Button>
                          )}
                          {h.review_status === "VALIDATED" && (
                            <>
                              <Button className="desktop-row-action" aria-label={"Modifier " + h.name} onClick={() => select(h, true)}>Modifier</Button>
                              <AsyncButton className="desktop-row-action" onClick={() => toggleHouseVisibility(h)}>
                                {h.status === "HIDDEN" ? "Réafficher" : "Masquer"}
                              </AsyncButton>
                            </>
                          )}
                        </>
                      )}
                      <ActionMenu label={"Actions pour " + h.name}>
                        <Button onClick={() => select(h)}>Voir la fiche</Button>
                        {has(user, "participants.edit") && selectedSeason && !selectedSeason.archived && !selectedSeason.purged_at && h.review_status === "PENDING" && (
                          <>
                            <AsyncButton onClick={() => moderateNow(h)}>Valider</AsyncButton>
                            <Button onClick={() => select(h, false, "moderation")}>Refuser avec motif</Button>
                          </>
                        )}
                        {has(user, "participants.edit") && selectedSeason && !selectedSeason.archived && !selectedSeason.purged_at && h.review_status === "REFUSED" && (
                          <Button onClick={() => select(h, false, "moderation")}>Réexaminer</Button>
                        )}
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
                          !selectedSeason.archived && !selectedSeason.purged_at && (
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
                          !selectedSeason.archived && !selectedSeason.purged_at && (
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
                {current?.id === h.id && (
                  <tr className="admin-detail-row">
                    <td colSpan={moderation ? 5 : 7}>
                      <AdminInlineDetail
                        key={h.id + ":" + detailTab}
                        title={current.name}
                        compactHeader
                        initialTab={detailTab}
                        onClose={() => {
                          setSelected(null);
                          setEdit(false);
                        }}
                        tabs={[
                          {
                            id: "info",
                            label: "Informations",
                            content: (
                              <section>
                                <div className="admin-detail-facts">
                                  <p><strong>Coordonnées GPS</strong><span>{current.latitude.toFixed(5)}, {current.longitude.toFixed(5)}</span></p>
                                  <p><strong>Horaires d’accueil</strong><span>{dateLabel(current.starts_at, state.instance?.timezone ?? "Europe/Paris")} → {dateLabel(current.ends_at, state.instance?.timezone ?? "Europe/Paris")}</span></p>
                                  <p><strong>Frayeur</strong><span>{current.adaptable ? "Frissons adaptés" : "Niveau " + current.fear}</span></p>
                                </div>
                                {current.rp && <p><strong>Description : </strong>{current.rp}</p>}
                                {current.practical && <p><strong>Informations pratiques : </strong>{current.practical}</p>}
                                {has(user, "users.read") && (
                                  <Button onClick={() => {
                                    if (!confirmDraftNavigation()) return;
                                    setPendingUserId(current.user_id);
                                    setSelected(null);
                                    setSection("users");
                                  }}>Voir le propriétaire</Button>
                                )}
                                {selectedSeason && !selectedSeason.archived && !selectedSeason.purged_at &&
                                  has(user, "participants.edit") && !edit && (
                                    <Button onClick={() => setEdit(true)}>Modifier les informations et horaires</Button>
                                  )}
                                {edit && state.instance && (
                                  <>
                                    <Button type="button" onClick={() => {
                                      if (!confirmDraftNavigation()) return;
                                      setEdit(false);
                                    }}>Annuler la modification</Button>
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
                                  </>
                                )}
                              </section>
                            ),
                          },
                          {
                            id: "moderation",
                            label: "Modération",
                            content: (
                              <section>
                                <p>
                                  <strong>Statut : </strong>{reviews[current.review_status ?? "VALIDATED"]}
                                  {" · "}
                                  Soumission : {current.submitted_at
                                    ? dateLabel(current.submitted_at, state.instance?.timezone ?? "Europe/Paris")
                                    : "Date non disponible"}
                                </p>
                                {current.refusal_reason && <p>Motif précédent : {current.refusal_reason}</p>}
                                {selectedSeason && !selectedSeason.archived && !selectedSeason.purged_at &&
                                  has(user, "participants.edit") && (
                                    <>
                                      {current.review_status === "VALIDATED" && (
                                        <AsyncButton onClick={() => act("reviewHouse", {status:"PENDING"})}>
                                          Remettre en attente
                                        </AsyncButton>
                                      )}
                                      {current.review_status === "REFUSED" && !reexamining && (
                                        <Button className="primary" onClick={() => setReexamining(true)}>
                                          Réexaminer
                                        </Button>
                                      )}
                                      {(current.review_status === "PENDING" ||
                                        (current.review_status === "REFUSED" && reexamining)) && (
                                        <div className="admin-detail-form">
                                          <div className="beta-actions">
                                            <AsyncButton onClick={() => act("reviewHouse", {status:"VALIDATED"})}>
                                              Valider la maison
                                            </AsyncButton>
                                            <AsyncButton onClick={() => act("reviewHouse", {status:"PENDING"})}>
                                              Laisser en attente
                                            </AsyncButton>
                                          </div>
                                          <label className="field">
                                            <span>Motif du refus</span>
                                            <Select aria-label="Motif du refus" value={reasonCode}
                                              onChange={(e) => {
                                                setReasonCode(e.target.value as RefusalCode);
                                                setReason("");
                                              }}>
                                              {Object.entries(refusalReasons).map(([code,label]) =>
                                                <option key={code} value={code}>{label}</option>
                                              )}
                                            </Select>
                                            <TextArea aria-label="Précisions du refus" maxLength={500}
                                              value={reason} onChange={(e) => setReason(e.target.value)} />
                                          </label>
                                          <p className="small">Motif transmis : {refusalText(reasonCode,reason) || "Une explication est obligatoire."}</p>
                                          <RefusalPreview id={current.id}
                                            reason={refusalText(reasonCode, reason).slice(0,500)} />
                                          <AsyncButton onClick={() => act("reviewHouse", {
                                            status:"REFUSED",reason,reason_code:reasonCode
                                          })}>Refuser avec motif</AsyncButton>
                                        </div>
                                      )}
                                    </>
                                  )}
                                {!has(user, "participants.edit") || !selectedSeason || (selectedSeason.archived || !!selectedSeason.purged_at)
                                  ? <p className="small muted">Consultation en lecture seule.</p>
                                  : null}
                              </section>
                            ),
                          },
                          {
                            id: "management",
                            label: "Gestion",
                            content: (
                              <section>
                                <div className="admin-detail-facts">
                                  <p><strong>Disponibilité</strong><span>{availabilityLabel(current)}</span></p>
                                  <p><strong>Visibilité</strong><span>{current.status === "HIDDEN" ? "Masquée" : "Visible"}</span></p>
                                  <p><strong>Bonbons</strong><span>{current.candy_available ? "Disponibles" : "Épuisés"}</span></p>
                                </div>
                                <p className="small muted">
                                  Ouverture, distribution et visibilité sont indépendantes de la validation.
                                </p>
                                {selectedSeason && !selectedSeason.archived && !selectedSeason.purged_at &&
                                  has(user, "participants.edit") ? (
                                    <>
                                      <div className="beta-actions">
                                        <AsyncButton onClick={() => {
                                          if (current.activity === "ACTIVE" &&
                                            !window.confirm("Fermer l'accueil de cette maison ?")) return Promise.resolve();
                                          return act("houseActivity", {
                                            action: current.activity === "ACTIVE" ? "end" : "resume"
                                          });
                                        }}>
                                          {current.activity === "ACTIVE" ? "Fermer la maison" : "Rouvrir la maison"}
                                        </AsyncButton>
                                        {current.candy_available && current.activities.includes("CANDY") ? (
                                          <>
                                            <AsyncButton onClick={() => act("houseActivity", {
                                              action:"deplete",choice:"close"
                                            })}>Plus de bonbons et fermer</AsyncButton>
                                            {current.activities.includes("ACTING") && (
                                              <AsyncButton onClick={() => act("houseActivity", {
                                                action:"deplete",choice:"continue"
                                              })}>Plus de bonbons, continuer la mise en scène</AsyncButton>
                                            )}
                                          </>
                                        ) : (
                                          <AsyncButton onClick={() => act("houseActivity", {
                                            action:"candy",available:true
                                          })}>Remettre les bonbons disponibles</AsyncButton>
                                        )}
                                        <AsyncButton onClick={() => {
                                          if (current.status !== "HIDDEN" &&
                                            !window.confirm("Masquer cette maison de la carte ?")) return Promise.resolve();
                                          return act("visibility", current.status === "HIDDEN" ? "VISIBLE" : "HIDDEN");
                                        }}>
                                          {current.status === "HIDDEN" ? "Réafficher" : "Masquer"}
                                        </AsyncButton>
                                      </div>
                                    </>
                                  ) : <p className="small muted">Consultation en lecture seule.</p>}
                                {selectedSeason && !selectedSeason.archived && !selectedSeason.purged_at &&
                                  has(user, "participants.delete") && (
                                    <details className="admin-advanced-actions">
                                      <summary>Actions avancées</summary>
                                      <AsyncButton danger onClick={async () => {
                                        await act("deleteHouse", "SUPPRIMER LA MAISON");
                                        setSelected(null);
                                      }}>Supprimer la maison</AsyncButton>
                                    </details>
                                  )}
                              </section>
                            ),
                          },
                          {
                            id: "history",
                            label: "Historique",
                            content: (
                              <section>
                                <p>Soumission : {current.submitted_at
                                  ? dateLabel(current.submitted_at, state.instance?.timezone ?? "Europe/Paris")
                                  : "Date non renseignée"}</p>
                                <p>Dernière modification : {current.updated_at
                                  ? dateLabel(current.updated_at, state.instance?.timezone ?? "Europe/Paris")
                                  : "Date non renseignée"}</p>
                                <p className="small muted">
                                  Les autres interventions sont consultables dans Activité selon les
                                  droits et la durée de conservation du journal.
                                </p>
                                {has(user, "audit.read") && (
                                  <Button onClick={() => setSection("activity")}>
                                    Consulter le journal d’activité
                                  </Button>
                                )}
                              </section>
                            ),
                          },
                        ]}
                      />
                    </td>
                  </tr>
                )}
                </Fragment>
              ))}
          </tbody>
        </DataTable>
        <div className="admin-pagination-toolbar">
          <label>
            Lignes par page{" "}
            <Select aria-label="Lignes maisons par page"
              value={housePageSize}
              onChange={(e) => {
                setHousePageSize(Number(e.target.value));
                setHousePage(1);
              }}>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </Select>
          </label>
          <Pagination
            count={visible.total}
            page={visible.page}
            pageSize={housePageSize}
            onPage={setHousePage}
          />
        </div>
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
  // Preserve the desktop collapse preference; mobile navigation always opens
  // expanded to expose every module allowed by the existing permission model.
  const navCollapsed = sidebarCollapsed && !mobileView;
  return (
    <div
      className={"admin-beta" + (navCollapsed ? " sidebar-collapsed" : "")}
      data-theme={theme}
    >
      {menuOpen && (
        <Button
          className="beta-menu-backdrop"
          aria-label="Fermer la navigation"
          onClick={() => setMenuOpen(false)}
        />
      )}
      <aside
        className={
          "beta-sidebar" +
          (menuOpen ? " is-open" : "") +
          (navCollapsed ? " is-collapsed" : "")
        }
        id="admin-navigation"
      >
        <a
          className="beta-logo"
          href="https://github.com/Mick7784/halloween-map"
          target="_blank"
          rel="noreferrer"
          title="Halloween Map sur GitHub"
        >
          <span className="beta-brand-media">
            <Image
              className="beta-brand-wordmark"
              src="/brand/halloween-map-wordmark-official.webp"
              alt="Halloween Map by DomotiK Studio"
              width={196}
              height={64}
              unoptimized
            />
            <Image
              className="beta-brand-icon"
              src="/brand/halloween-map-app-icon-official.webp"
              alt="Halloween Map"
              width={42}
              height={42}
              unoptimized
            />
          </span>
          <span className="beta-brand-subtitle">Administration</span>
        </a>
        <Button
          type="button"
          className="beta-sidebar-collapse"
          title={navCollapsed ? "Développer le menu" : "Réduire aux icônes"}
          aria-label={navCollapsed ? "Développer le menu" : "Réduire aux icônes"}
          aria-expanded={!sidebarCollapsed}
          onClick={() => {
            const next = !sidebarCollapsed;
            setSidebarCollapsed(next);
            try {
              localStorage.setItem("halloween.admin.sidebar.collapsed", String(next));
            } catch {}
          }}
        >
          {navCollapsed ? <PanelLeftOpen size={19} /> : <PanelLeftClose size={19} />}
          {!navCollapsed && <span>Réduire le menu</span>}
        </Button>
        <nav aria-label="Navigation administration">
          {visibleStudioNavigation(halloweenAdminNavigation, (permission) =>
            has(user, permission),
          ).map((group) => (
            <div className="beta-nav-group" key={group.title}>
              <span className="beta-nav-heading">{group.title}</span>
              {group.items.map((item) => {
                const Icon = studioNavIcons[item.icon];
                return (
                  <Button
                    key={item.id}
                    type="button"
                    className={section === item.id ? "is-current" : ""}
                    aria-label={item.title}
                    title={navCollapsed ? item.title : undefined}
                    aria-current={section === item.id ? "page" : undefined}
                    onClick={() => {
                      if (!confirmDraftNavigation()) return;
                      setUserCreate(false);
                      setSection(item.id);
                      setMenuOpen(false);
                    }}
                  >
                    <Icon size={18} />
                    <span className="beta-nav-label">{item.title}</span>
                  </Button>
                );
              })}
            </div>
          ))}
        </nav>
        <Link
          className="beta-public-link"
          href="/map"
          title={navCollapsed ? "Retour à la carte" : undefined}
        >
          <ExternalLink size={17} />
          <span className="beta-public-label">Retour à Halloween Map</span>
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
                  content: "Contenus & documents",
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
                Active
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
            onUser={
              has(user, "users.read")
                ? (id) => {
                    setPendingUserId(id);
                    setSection("users");
                  }
                : undefined
            }
            audit={loadedView === viewKey ? audit : []}
            scope={auditScope}
            onScope={setAuditScope}
            loading={loading}
            zone={state.instance?.timezone ?? "Europe/Paris"}
          />
        )}
        {section === "statistics" && !error && (
          mobileView ? (
            <AdminMobileStats
              embedded
              data={loadedView === viewKey ? statistics : null}
              loading={loading || loadedView !== viewKey}
              zone={state.instance?.timezone ?? "Europe/Paris"}
              seasonName={selectedSeason?.name ?? "Aucune saison"}
            />
          ) : (
            <AdminStatistics
              zone={state.instance?.timezone}
              season={selectedSeason}
              data={loadedView === viewKey ? statistics : null}
              loading={loading || loadedView !== viewKey}
            />
          )
        )}
        {["content", "settings"].includes(section) && (
          <AdminExistingPage
            key={section}
            section={section}
            mapStyle={mapStyle}
            user={user}
            refresh={refresh}
            onSeason={has(user, "season.read") ? () => {
              if (!confirmDraftNavigation()) return;
              setSection("seasons");
            } : undefined}
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
                    !selectedSeason || (selectedSeason.archived || !!selectedSeason.purged_at)
                  }
                  onClick={() =>
                    void startCreate().catch((e) => setError(e.message))
                  }
                >
                  + Nouvelle maison
                </Button>
                {!selectedSeason ? (
                  <p>Créez une saison avant de créer une maison.</p>
                ) : (selectedSeason.archived || !!selectedSeason.purged_at) ? (
                    <p>
                      Cette saison est terminée : lecture seule.{" "}
                      {seasons.some((s) => s.active) && (
                      <Button
                        onClick={() =>
                          setSeasonId(seasons.find((s) => s.active)!.id)
                        }
                      >
                        Revenir à la saison active
                      </Button>
                      )}
                    </p>
                ) : !selectedSeason.active && (
                  <p>Préparation de la saison avant activation publique.</p>
                )}
              </div>
            )}
            <StudioCollectionControls
              label="Filtres des maisons"
              count={list.length}
              filtered={Boolean(search.trim()) || review !== "ALL" || availability !== "ALL"}
              onReset={() => {
                setSearch("");
                setReview("ALL");
                setAvailability("ALL");
                setHousePage(1);
              }}
            >
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
            </StudioCollectionControls>
            {loadedView !== viewKey && loading ? (
              <p role="status">Chargement des maisons…</p>
            ) : (
              !error && (
                <>
                  {loading && <p role="status" className="small muted">Actualisation des maisons…</p>}
                  {table(list)}
                </>
              )
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
                territory={state.instance.territory}
                postalCode={state.instance.postal_code}
                seasonYear={selectedSeason.year}
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
    </div>
  );
}
