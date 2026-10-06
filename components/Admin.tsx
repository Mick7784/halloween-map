"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { X, LayoutDashboard, House as HouseIcon, Users } from "lucide-react";
import type { House, User } from "../lib/domain";
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
import "./AdminBeta.css";
type ManagedHouse = House & {
  email: string;
  owner_name: string;
  season_opens_at: string;
  season_closes_at: string;
};
type Dashboard = {
  approved: number;
  pending: number;
  routes: number;
  users: number;
};
type Audit = { id: string; action: string; actor: string; created_at: string };
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
}: {
  user: User;
  state: PublicState;
  refresh: () => Promise<void>;
  mapStyle: string;
}) {
  const [section, setSection] = useState("dashboard"),
    [houses, setHouses] = useState<ManagedHouse[]>([]),
    [dashboard, setDashboard] = useState<Dashboard | null>(null),
    [audit, setAudit] = useState<Audit[]>([]),
    [error, setError] = useState(""),
    [selected, setSelected] = useState<string | null>(null),
    [edit, setEdit] = useState(false),
    [reason, setReason] = useState(""),
    [search, setSearch] = useState(""),
    [review, setReview] = useState("ALL"),
    [test, setTest] = useState("ALL"),
    [availability, setAvailability] = useState("ALL"),
    [theme, setTheme] = useState("dark"),
    [users, setUsers] = useState<ManagedUser[]>([]),
    [roles, setRoles] = useState<
      { id: string; name: string; permissions: string[] }[]
    >([]);
  const reload = useCallback(async () => {
    try {
      const [h, d, a] = await Promise.all([
        has(user, "participants.read")
          ? api<ManagedHouse[]>("admin/houses")
          : [],
        has(user, "stats.read") ? api<Dashboard>("admin/dashboard") : null,
        has(user, "audit.read") ? api<Audit[]>("admin/audit") : [],
      ]);
      setHouses(h);
      setDashboard(d);
      setAudit(a);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, [user]);
  const reloadUsers = useCallback(async () => {
    const [u, r] = await Promise.all([
      api<ManagedUser[]>("admin/users"),
      api<{ id: string; name: string; permissions: string[] }[]>("admin/roles"),
    ]);
    setUsers(u);
    setRoles(r);
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);
  useEffect(() => {
    if (section === "users")
      void reloadUsers().catch((e) => setError(e.message));
  }, [section, reloadUsers]);
  useEffect(() => {
    const stored = localStorage.getItem("halloween.admin.theme");
    if (stored && ["dark", "light", "system"].includes(stored))
      setTheme(stored);
  }, []);
  const current = houses.find((h) => h.id === selected);
  async function act(action: string, payload?: unknown) {
    await api("admin", { action, id: selected, payload });
    await reload();
    await refresh();
  }
  const pending = houses.filter(
    (h) => h.review_status === "PENDING" && h.season_id === state.season?.id,
  );
  const list = houses.filter(
    (h) =>
      (h.name + " " + h.owner_name + " " + h.email + " " + h.address)
        .toLocaleLowerCase()
        .includes(search.toLocaleLowerCase()) &&
      (review === "ALL" ||
        (review === "HIDDEN"
          ? h.status === "HIDDEN"
          : h.review_status === review)) &&
      (test === "ALL" || Boolean(h.is_test) === (test === "TEST")) &&
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
                  {h.is_test && <span className="beta-badge">Test</span>}
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
      <aside className="beta-sidebar">
        <a
          className="beta-logo"
          href="https://github.com/Mick7784/halloween-map"
          target="_blank"
          rel="noreferrer"
        >
          Halloween Map <span>BÊTA</span>
        </a>
        <nav>
          {(
            [
              ["dashboard", "Tableau de bord", "stats.read", LayoutDashboard],
              ["houses", "Maisons", "participants.read", HouseIcon],
              ["users", "Utilisateurs", "users.read", Users],
            ] as const
          ).map(
            ([id, title, p, Icon]) =>
              has(user, p as string) && (
                <button
                  key={id as string}
                  className={section === id ? "active" : ""}
                  onClick={() => setSection(id as string)}
                >
                  <Icon size={18} />
                  {title as string}
                </button>
              ),
          )}
        </nav>
        <label>
          Apparence
          <select
            aria-label="Apparence"
            value={theme}
            onChange={(e) => {
              setTheme(e.target.value);
              localStorage.setItem("halloween.admin.theme", e.target.value);
            }}
          >
            <option value="dark">Sombre</option>
            <option value="light">Clair</option>
            <option value="system">Système</option>
          </select>
        </label>
        <Link href="/map">Voir la carte publique ↗</Link>
      </aside>
      <main className="beta-content">
        <header>
          <div>
            <p>Administration</p>
            <h1>
              {section === "dashboard"
                ? "Tableau de bord"
                : section === "houses"
                  ? "Maisons"
                  : "Utilisateurs"}
            </h1>
          </div>
          <button className="secondary" onClick={() => void reload()}>
            Actualiser
          </button>
        </header>
        <Notice error={error} />
        {section === "dashboard" && (
          <>
            {dashboard && (
              <div className="beta-kpis">
                {[
                  ["Maisons validées", dashboard.approved],
                  ["En attente", dashboard.pending],
                  ["Parcours créés", dashboard.routes],
                  ["Utilisateurs", dashboard.users],
                ].map(([title, count]) => (
                  <article key={title}>
                    <span>{title}</span>
                    <strong>{count}</strong>
                  </article>
                ))}
              </div>
            )}
            <section className="beta-card">
              <h2>Maisons à modérer</h2>
              {table(pending, true)}
            </section>
            {audit.length > 0 && (
              <section className="beta-card">
                <h2>Activité récente</h2>
                {audit.slice(0, 8).map((a) => (
                  <p className="beta-audit" key={a.id}>
                    <strong>{a.actor ?? "Système"}</strong>
                    <span>{a.action}</span>
                    <time>
                      {dateLabel(
                        a.created_at,
                        state.instance?.timezone ?? "Europe/Paris",
                      )}
                    </time>
                  </p>
                ))}
              </section>
            )}
          </>
        )}
        {section === "houses" && (
          <section className="beta-card">
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
                aria-label="Profils"
                value={test}
                onChange={(e) => setTest(e.target.value)}
              >
                <option value="ALL">Test et normal</option>
                <option value="TEST">Test</option>
                <option value="NORMAL">Normal</option>
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
            users={users}
            roles={roles}
            user={user}
            reload={reloadUsers}
          />
        )}
      </main>
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
              {current.is_test && <span className="beta-badge">Test</span>}
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
            {has(user, "participants.edit") && (
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
                {has(user, "participants.edit") && (
                  <>
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
                {has(user, "participants.edit") && (
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
                {has(user, "participants.delete") && (
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
