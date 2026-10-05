"use client";
import AdminUsers, { type ManagedUser } from "./AdminUsers";
import ContentAdmin from "./ContentAdmin";
import EventSettings from "./EventSettings";
import SeasonManager from "./SeasonManager";
import DashboardVisuals from "./DashboardVisuals";
import { useCallback, useEffect, useState, useRef } from "react";
import {
  LayoutDashboard,
  House as HouseIcon,
  Users,
  CalendarDays,
  ChartNoAxesCombined,
  Settings,
  ScrollText,
  X,
  ArrowRight,
} from "lucide-react";
import type { Instance, Season, House, User } from "../lib/domain";
import Campaigns from "./Campaigns";
import Link from "next/link";
import {
  api,
  has,
  labels,
  Notice,
  AsyncButton,
  Badges,
  localDate,
  type PublicState,
} from "./common";
import HouseForm from "./HouseForm";
type Role = { id: string; name: string; permissions: string[] };
type Dashboard = {
  approved: number;
  hidden: number;
  users: number;
  routes: number;
  state: string;
  season: Season | null;
};
type Audit = {
  id: string;
  actor: string | null;
  action: string;
  created_at: string;
  target_id: string | null;
};
const sections = [
  {
    id: "dashboard",
    name: "Tableau de bord",
    p: "stats.read",
    Icon: LayoutDashboard,
  },
  { id: "houses", name: "Maisons", p: "participants.read", Icon: HouseIcon },
  { id: "users", name: "Utilisateurs", p: "users.read", Icon: Users },
  { id: "seasons", name: "Saison", p: "season.read", Icon: CalendarDays },
  {
    id: "communications",
    name: "Communications",
    p: "communications.read",
    Icon: ScrollText,
  },
  {
    id: "stats",
    name: "Statistiques",
    p: "stats.read",
    Icon: ChartNoAxesCombined,
  },
  { id: "settings", name: "Paramètres", p: "settings.read", Icon: Settings },
  { id: "content", name: "Contenus", p: "content.manage", Icon: ScrollText },
  {
    id: "audit",
    name: "Journal d’activité",
    p: "audit.read",
    Icon: ScrollText,
  },
];
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
  const available = sections.filter((s) => has(user, s.p));
  const [section, setSection] = useState(available[0]?.id ?? ""),
    [data, setData] = useState<unknown>(null),
    [loadedSection, setLoadedSection] = useState(""),
    [error, setError] = useState(""),
    [roles, setRoles] = useState<Role[]>([]),
    [editing, setEditing] = useState<House | null>(null),
    [filter, setFilter] = useState("ALL");
  const [activeAdminSeason, setActiveAdminSeason] = useState<Season | null>(
    null,
  );
  const currentSection = useRef(section);
  useEffect(() => {
    currentSection.current = section;
  }, [section]);
  const reload = useCallback(async () => {
    if (!section) return;
    const result = await api("admin/" + section);
    if (currentSection.current === section) {
      setLoadedSection(section);
      setData(result);
    }
  }, [section]);
  useEffect(() => {
    let active = true;
    setError("");
    if (section)
      void api("admin/" + section)
        .then((result) => {
          if (active) {
            setData(result);
            setLoadedSection(section);
          }
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    return () => {
      active = false;
    };
  }, [section]);
  useEffect(() => {
    void api<Season[]>("admin/seasons")
      .then((rows) =>
        setActiveAdminSeason(
          rows.find((row) => !row.archived) ?? rows[0] ?? null,
        ),
      )
      .catch((e) => setError(e.message));
    if (has(user, "users.read"))
      void api<Role[]>("admin/roles")
        .then(setRoles)
        .catch((e) => setError(e.message));
  }, [user]);
  async function act(action: string, payload?: unknown, id?: string) {
    await api("admin", { action, payload, id });
    await reload();
    await refresh();
  }
  const title =
    sections.find((s) => s.id === section)?.name ?? "Administration";
  const i = state.instance!,
    s = state.season;
  return (
    <main className="admin-layout">
      <aside className="admin-sidebar">
        <div className="eyebrow">BACK-OFFICE</div>
        <p>
          {user.display_name}
          <small>{labels[user.role_name ?? ""] ?? user.role_name}</small>
        </p>
        <Link href="/">Retour au site</Link>
        <nav>
          {available.map(({ id, name, Icon }) => (
            <button
              key={id}
              className={section === id ? "active" : ""}
              onClick={() => setSection(id)}
            >
              <Icon size={18} />
              {name}
            </button>
          ))}
        </nav>
      </aside>
      <section className="admin-content">
        <div className="admin-title">
          <div>
            <h1>{title}</h1>
            <p className="muted">
              {i.public_name} · {s?.year ?? "Préparation"}
            </p>
          </div>
          <span className="season-chip">
            <i />
            {labels[state.state ?? ""]}
          </span>
        </div>
        <Notice error={error} />
        {!section ? (
          <p className="panel">
            Ce rôle ne dispose d’aucune permission de lecture.
          </p>
        ) : data === null || loadedSection !== section ? (
          <p className="muted">Chargement…</p>
        ) : (
          <>
            {section === "dashboard" && (
              <>
                <div className="metrics">
                  {[
                    [
                      HouseIcon,
                      "Maisons visibles",
                      (data as Dashboard).approved,
                    ],
                    [
                      CalendarDays,
                      "Maisons masquées",
                      (data as Dashboard).hidden,
                    ],
                    [
                      ChartNoAxesCombined,
                      "Parcours créés",
                      (data as Dashboard).routes,
                    ],
                    [Users, "Utilisateurs", (data as Dashboard).users],
                  ].map(([Icon, label, value]) => {
                    const C = Icon as typeof HouseIcon;
                    return (
                      <div className="panel metric" key={String(label)}>
                        <C />
                        <div>
                          <span>{String(label)}</span>
                          <strong>{Number(value)}</strong>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <DashboardVisuals
                  user={user}
                  center={[i.longitude, i.latitude]}
                  zoom={i.zoom}
                  mapStyle={mapStyle}
                />
                <div className="grid two">
                  <section className="panel">
                    <h2>Cette saison</h2>
                    <p>
                      État :{" "}
                      <strong>{labels[(data as Dashboard).state]}</strong>
                    </p>
                    <p>
                      Les adresses restent masquées avant l’ouverture. À la
                      purge programmée, le traitement conserve les totaux
                      anonymes et supprime les données participantes.
                    </p>
                    {has(user, "season.read") && (
                      <button onClick={() => setSection("seasons")}>
                        Gérer la saison
                        <ArrowRight size={16} />
                      </button>
                    )}
                  </section>
                  <section className="panel admin-message">
                    <h2>Une commune plus vivante.</h2>
                    <p>
                      Découvrir, préparer, partager.
                      <br />
                      Un Halloween à accueillir ensemble.
                    </p>
                    <span className="eyebrow">
                      UNE EXPÉRIENCE DOMOTIK STUDIO
                    </span>
                  </section>
                </div>
              </>
            )}
            {section === "houses" && (
              <section className="panel">
                <div className="table-toolbar">
                  <h2>Gestion des maisons</h2>
                  <select
                    aria-label="Filtrer les maisons"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                  >
                    <option value="ALL">Toutes</option>
                    {["VISIBLE", "HIDDEN"].map((st) => (
                      <option key={st} value={st}>
                        {labels[st]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Maison</th>
                        <th>Adresse</th>
                        <th>Statut</th>
                        <th>Activités</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(data as House[])
                        .filter((h) => filter === "ALL" || h.status === filter)
                        .map((h) => (
                          <tr key={h.id}>
                            <td>
                              <strong>{h.name}</strong>
                              <small>{labels[h.activity]}</small>
                            </td>
                            <td>{h.address}</td>
                            <td>
                              <span className={"status " + h.status}>
                                {labels[h.status]}
                              </span>
                            </td>
                            <td>
                              <Badges activities={h.activities} />
                            </td>
                            <td>
                              <div className="table-actions">
                                <button onClick={() => setEditing(h)}>
                                  Consulter
                                  {has(user, "participants.edit")
                                    ? " / modifier"
                                    : ""}
                                </button>
                                <AsyncButton
                                  onClick={() =>
                                    act(
                                      "visibility",
                                      h.status === "HIDDEN"
                                        ? "VISIBLE"
                                        : "HIDDEN",
                                      h.id,
                                    )
                                  }
                                >
                                  {h.status === "HIDDEN"
                                    ? "Rendre visible"
                                    : "Masquer"}
                                </AsyncButton>
                                {has(user, "participants.delete") && (
                                  <AsyncButton
                                    danger
                                    onClick={async () => {
                                      if (
                                        window.prompt(
                                          "Suppression définitive de la maison, de son adresse et de ses données. Le compte reste disponible. Saisissez SUPPRIMER LA MAISON.",
                                        ) === "SUPPRIMER LA MAISON"
                                      )
                                        await act(
                                          "deleteHouse",
                                          "SUPPRIMER LA MAISON",
                                          h.id,
                                        );
                                    }}
                                  >
                                    Supprimer
                                  </AsyncButton>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
                {!(data as House[]).length && (
                  <p className="empty">Aucune maison pour cette saison.</p>
                )}
              </section>
            )}
            {section === "users" && (
              <AdminUsers
                users={data as ManagedUser[]}
                roles={roles}
                user={user}
                reload={reload}
              />
            )}
            {section === "content" && (
              <ContentAdmin
                data={data as Parameters<typeof ContentAdmin>[0]["data"]}
                reload={reload}
              />
            )}
            {section === "seasons" && (
              <SeasonManager
                seasons={data as Season[]}
                user={user}
                zone={i.timezone}
                act={act}
              />
            )}
            {section === "communications" && activeAdminSeason && (
              <Campaigns
                season={activeAdminSeason}
                zone={i.timezone}
                user={user}
              />
            )}
            {section === "stats" && (
              <>
                {(data as Season[]).map((season) => (
                  <section className="panel" key={season.id}>
                    <h2>
                      Saison {season.year} ·{" "}
                      {season.purged_at ? "Bilan anonyme" : "En cours"}
                    </h2>
                    <div className="stat-grid">
                      {Object.entries(season.stats).map(([k, v]) => (
                        <div key={k}>
                          <span>
                            {{
                              houses: "Maisons inscrites",
                              approved: "Maisons validées",
                              decoration: "Décoration",
                              candy: "Bonbons",
                              acting: "Mise en scène",
                              routes: "Parcours",
                            }[k] ?? k}
                          </span>
                          <strong>{v}</strong>
                        </div>
                      ))}
                    </div>
                    {!Object.keys(season.stats).length && (
                      <p>
                        {season.routes_count} parcours créés. Le bilan est
                        agrégé à la purge.
                      </p>
                    )}
                  </section>
                ))}
              </>
            )}
            {section === "settings" &&
              (has(user, "settings.manage") ? (
                <EventSettings
                  instance={data as Instance}
                  mapStyle={mapStyle}
                  save={(p) => act("settings", p)}
                />
              ) : (
                <section className="panel">
                  <h2>{(data as Instance).public_name}</h2>
                  <p>
                    {(data as Instance).territory} ·{" "}
                    {(data as Instance).timezone}
                  </p>
                </section>
              ))}
            {section === "audit" && (
              <section className="panel">
                <h2>Dernières actions</h2>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Utilisateur</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(data as Audit[]).map((a) => (
                        <tr key={a.id}>
                          <td>
                            {localDate(a.created_at, i.timezone).replace(
                              "T",
                              " ",
                            )}
                          </td>
                          <td>{a.actor ?? "Système / participant"}</td>
                          <td>{a.action}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="muted small">
                  200 dernières actions. Aucun email, adresse ou texte
                  participant n’est conservé dans ce journal.
                </p>
              </section>
            )}
          </>
        )}
      </section>
      {editing && (
        <div className="modal-backdrop" onClick={() => setEditing(null)}>
          <section
            className="panel house-detail edit-house"
            role="dialog"
            aria-modal="true"
            aria-label="Maison"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="close"
              aria-label="Fermer"
              onClick={() => setEditing(null)}
            >
              <X />
            </button>
            <h2>{editing.name}</h2>
            {has(user, "participants.edit") && s ? (
              <HouseForm
                house={editing}
                zone={i.timezone}
                opens={s.opens_at}
                closes={s.closes_at}
                center={[i.longitude, i.latitude]}
                onSave={async (p) => {
                  await act("editHouse", p, editing.id);
                  setEditing(null);
                }}
              />
            ) : (
              <>
                <p>{editing.address}</p>
                <Badges activities={editing.activities} />
                <p>
                  {localDate(editing.starts_at, i.timezone)} →{" "}
                  {localDate(editing.ends_at, i.timezone)}
                </p>
                <p>
                  {editing.adaptable
                    ? "Frayeur adaptable"
                    : "Frayeur " + editing.fear}
                </p>
                <p>{editing.rp}</p>
                <p className="practical">{editing.practical}</p>
              </>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
