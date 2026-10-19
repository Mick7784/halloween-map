"use client";
import { ActionCancelled } from "./AdminConfirmation";
import { X } from "lucide-react";
import Link from "next/link";
import { Fragment, useEffect, useMemo, useState } from "react";
import useDraftGuard, { confirmDraftNavigation } from "./useDraftGuard";
import AdminInlineDetail from "./AdminInlineDetail";
import { DateTime } from "luxon";
import { type User, type House, defaultRoles } from "../lib/domain";
import { permissionLabels } from "../lib/admin-presentation";
import { selectStudioCollection } from "../lib/studio-collection";
import { api, Field, Notice, values, labels, AsyncButton } from "./common";
import {
  Input,
  Button,
  DataTable,
  Dialog,
  Select,
  ActionMenu,
  Pagination,
} from "./ui";
type Role = { id: string; name: string; permissions: string[] };
export type ManagedUser = User & {
  participation_season?: string | null;
  participation_history?: { year: number }[];
  created_at: string;
  last_login_at: string | null;
  participation: House | null;
  communications: {
    kind: string;
    status: string;
    scheduled_at: string;
    sent_at: string | null;
    last_error: string | null;
    season_id?: string | null;
    season_name?: string | null;
  }[];
};
const tabs = [
  ["ALL", "Tous"],
  ["PARTICIPANTS", "Participants"],
  ["ADMIN", "Accès admin"],
  ["DISABLED", "Désactivés"],
  ["UNVERIFIED", "Email non vérifié"],
];
export default function AdminUsers({
  users,
  roles,
  user,
  reload,
  initialCreate = false,
  onHouse,
  seasonName,
  initialUserId,
  onClose,
}: {
  users: ManagedUser[];
  roles: Role[];
  user: User;
  reload: () => Promise<void>;
  initialCreate?: boolean;
  onHouse: (id: string) => void;
  seasonName?: string;
  initialUserId?: string | null;
  onClose?: () => void;
}) {
  const [search, setSearch] = useState(""),
    [filter, setFilter] = useState("ALL"),
    [selected, setSelected] = useState<string | null>(initialUserId ?? null),
    [editing, setEditing] = useState(false),
    [page, setPage] = useState(1),
    [pageSize, setPageSize] = useState(25),
    [sortColumn, setSortColumn] = useState("name"),
    [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc"),
    [create, setCreate] = useState(initialCreate);
  const list = useMemo(() => users
    .filter(
      (u) =>
        (u.display_name + " " + u.email)
          .toLowerCase()
          .includes(search.toLowerCase()) &&
        (filter === "ALL" ||
          (filter === "PARTICIPANTS" && u.role_name === "USER") ||
          (filter === "ADMIN" &&
            ["ADMIN", "SUPER_ADMIN"].includes(u.role_name ?? "")) ||
          (filter === "DISABLED" && u.account_status === "DISABLED") ||
          (filter === "UNVERIFIED" && u.email_status !== "VERIFIED")),
    )
    .sort((a, b) => {
      const value = (u: ManagedUser) =>
        ({
          name: u.display_name,
          verification: u.email_status,
          account: u.account_status,
          participation: u.participation?.name ?? "",
          role: u.role_name ?? "",
          last_login: u.last_login_at ?? "",
        })[sortColumn] ?? u.display_name;
      const result = value(a).localeCompare(value(b), "fr", {
        sensitivity: "base",
        numeric: true,
      });
      return (sortDirection === "asc" ? 1 : -1) * result;
    }), [users, search, filter, sortColumn, sortDirection]);
  useEffect(() => {
    if (!initialUserId) return;
    const index = list.findIndex((u) => u.id === initialUserId);
    if (index >= 0) setPage(Math.floor(index / pageSize) + 1);
  }, [initialUserId, list, pageSize]);
  function toggleSort(column: string) {
    if (sortColumn === column)
      setSortDirection((v) => (v === "asc" ? "desc" : "asc"));
    else {
      setSortColumn(column);
      setSortDirection("asc");
    }
    setPage(1);
  }
  const visible = selectStudioCollection(list, { page, pageSize });
  const current = users.find((u) => u.id === selected);
  function showUser(id: string, edit = false) {
    if (selected && !confirmDraftNavigation()) return;
    if (id === selected && !edit) {
      setSelected(null);
      setEditing(false);
      onClose?.();
      return;
    }
    setSelected(id);
    setEditing(edit);
  }
  const manageable = user.permissions.includes("users.manage");
  const canManageTarget = (target: ManagedUser) =>
    manageable &&
    target.id !== user.id &&
    (user.role_name === "SUPER_ADMIN" || target.role_name === "USER") &&
    (target.role_name !== "SUPER_ADMIN" ||
      users.some(
        (other) =>
          other.id !== target.id &&
          other.role_name === "SUPER_ADMIN" &&
          other.account_status === "ACTIVE",
      ));
  const canEdit =
    manageable &&
    (!current ||
      (current.id !== user.id &&
        (user.role_name === "SUPER_ADMIN" || current.role_name === "USER") &&
        (current.role_name !== "SUPER_ADMIN" ||
          users.some(
            (u) =>
              u.id !== current.id &&
              u.role_name === "SUPER_ADMIN" &&
              u.account_status === "ACTIVE",
          ))));
  async function act(p: unknown) {
    await api("admin/users", p);
    await reload();
    setCreate(false);
    setEditing(false);
  }
  const date = (v: string | null) =>
    v
      ? DateTime.fromISO(v).setLocale("fr").toFormat("dd LLL yyyy à HH:mm")
      : "—";
  return (
    <>
      <p className="small muted">
        Annuaire global des comptes · Participation à la saison active :{" "}
        {seasonName ?? "Aucune saison active"}
      </p>
      <div className="toolbar">
        <Input
          aria-label="Rechercher un utilisateur"
          placeholder="Nom ou email…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
        {manageable && (
          <Button className="primary" onClick={() => setCreate(true)}>
            Créer un utilisateur
          </Button>
        )}
      </div>
      <div className="tabs">
        {tabs.map(([id, label]) => (
          <Button
            key={id}
            className={filter === id ? "active" : ""}
            onClick={() => {
              setFilter(id);
              setPage(1);
            }}
          >
            {label}
          </Button>
        ))}
      </div>
      <div className="table-wrap">
        <DataTable className="users-table">
          <thead>
            <tr>
              {([
                ["name", "Utilisateur"],
                ["verification", "Vérification"],
                ["account", "Compte"],
                ["participation", "Participation"],
                ["role", "Profil"],
                ["last_login", "Dernière connexion"],
              ] as const).map(([id, label]) => (
                <th key={id} aria-sort={sortColumn === id
                  ? (sortDirection === "asc" ? "ascending" : "descending")
                  : "none"}>
                  <Button type="button" className="admin-sort-column"
                    onClick={() => toggleSort(id)}>
                    {label} {sortColumn === id ? (sortDirection === "asc" ? "↑" : "↓") : ""}
                  </Button>
                </th>
              ))}
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {visible.rows.map((u) => (
                <Fragment key={u.id}>
                <tr
                  className="admin-clickable-row"
                  tabIndex={0}
                  aria-expanded={current?.id === u.id}
                  onClick={(event) => {
                    if ((event.target as HTMLElement).closest("button,a,summary,input,select,textarea")) return;
                    showUser(u.id);
                  }}
                  onKeyDown={(event) => {
                    if (event.target !== event.currentTarget) return;
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      showUser(u.id);
                    }
                  }}
                >
                  <td>
                    <Button onClick={() => showUser(u.id)}>
                      {u.display_name}
                    </Button>
                    <small>{u.email}</small>
                  </td>
                  <td data-label="Vérification">
                    {labels[u.email_status] ?? u.email_status}
                  </td>
                  <td data-label="Compte">
                    {labels[u.account_status] ?? u.account_status}
                  </td>
                  <td data-label="Participation">
                    {u.participation?.name ?? "—"}
                  </td>
                  <td data-label="Profil">
                    {labels[u.role_name ?? ""] ?? u.role_name}
                  </td>
                  <td data-label="Dernière connexion">
                    {date(u.last_login_at)}
                  </td>
                  <td>
                    <div className="row-actions">
                      <Button
                        aria-label={"Voir la fiche de " + u.display_name}
                        onClick={() => showUser(u.id)}
                      >
                        Voir
                      </Button>
                      {canManageTarget(u) && (
                        <Button
                          aria-label={"Modifier " + u.display_name}
                          onClick={() => showUser(u.id, true)}
                        >
                          Modifier
                        </Button>
                      )}
                      {u.id === user.id && (
                        <Link href="/account">Mon compte</Link>
                      )}
                      {u.participation &&
                        user.permissions.includes("participants.read") && (
                          <Button onClick={() => onHouse(u.participation!.id)}>
                            Maison
                          </Button>
                        )}
                      <ActionMenu
                        label={"Plus d’actions pour " + u.display_name}
                      >
                        <Button
                          className="mobile-row-action"
                          onClick={() => showUser(u.id)}
                        >
                          Voir la fiche
                        </Button>
                        {u.id === user.id && (
                          <Link className="mobile-row-action" href="/account">
                            Mon compte
                          </Link>
                        )}
                        {canManageTarget(u) && (
                          <Button
                            className="mobile-row-action"
                            onClick={() => showUser(u.id, true)}
                          >
                            Modifier
                          </Button>
                        )}
                        {u.participation &&
                          user.permissions.includes("participants.read") && (
                            <Button
                              className="mobile-row-action"
                              onClick={() => onHouse(u.participation!.id)}
                            >
                              Voir la maison
                            </Button>
                          )}
                        {canManageTarget(u) && (
                          <>
                            <AsyncButton
                              onClick={() =>
                                act({
                                  action:
                                    u.account_status === "DISABLED"
                                      ? "enable"
                                      : "disable",
                                  id: u.id,
                                })
                              }
                            >
                              {u.account_status === "DISABLED"
                                ? "Activer"
                                : "Désactiver"}
                            </AsyncButton>
                            {u.account_status !== "DISABLED" &&
                              u.email_status !== "VERIFIED" && (
                                <AsyncButton
                                  onClick={() =>
                                    act({ action: "resend", id: u.id })
                                  }
                                >
                                  Renvoyer la vérification
                                </AsyncButton>
                              )}
                            {user.role_name === "SUPER_ADMIN" && (
                              <AsyncButton
                                danger
                                onClick={async () => {
                                  await act({
                                    action: "delete",
                                    id: u.id,
                                    confirm: "SUPPRIMER CE COMPTE",
                                  });
                                }}
                              >
                                Supprimer le compte
                              </AsyncButton>
                            )}
                          </>
                        )}
                      </ActionMenu>
                    </div>
                  </td>
                </tr>
                {current?.id === u.id && (
                  <tr className="admin-detail-row">
                    <td colSpan={7}>
                      <AdminInlineDetail
                        key={u.id}
                        title={current.display_name}
                        compactHeader
                        onClose={() => {
                          setSelected(null);
                          setEditing(false);
                          onClose?.();
                        }}
                        initialTab={editing ? "info" : undefined}
                        tabs={[
                          {
                            id: "info",
                            label: "Informations",
                            content: (
                              <section>
                                <div className="admin-detail-facts">
                                  <p><strong>Date de création du compte</strong><span>{date(current.created_at)}</span></p>
                                </div>
                                {current.id === user.id && <Link href="/account">Mon compte</Link>}
                                {canEdit && !editing && (
                                  <Button onClick={() => setEditing(true)}>Modifier l’utilisateur</Button>
                                )}
                                {canEdit && editing && (
                                  <>
                                    <Button type="button" onClick={() => {
                                      if (!confirmDraftNavigation()) return;
                                      setEditing(false);
                                    }}>Annuler la modification</Button>
                                    <UserEditor
                                      key={current.id}
                                      current={current}
                                      roles={user.role_name === "SUPER_ADMIN" ? roles : roles.filter((r) => r.name === "USER")}
                                      canChangeRole={user.role_name === "SUPER_ADMIN"}
                                      allowDirect={false}
                                      admins={users.filter((entry) => entry.role_name === "ADMIN")}
                                      submit={act}
                                    />
                                  </>
                                )}
                              </section>
                            ),
                          },
                          {
                            id: "participation",
                            label: "Participation",
                            content: (
                              <section>
                                {current.participation ? (
                                  <Button onClick={() => onHouse(current.participation!.id)}>
                                    Ouvrir la fiche de sa maison
                                  </Button>
                                ) : <p>Aucune maison enregistrée pour la saison active.</p>}
                              </section>
                            ),
                          },
                          {
                            id: "permissions",
                            label: "Permissions",
                            content: (
                              <section>
                                {current.role_name === "ADMIN" ? (
                                  <ul>
                                    {current.permissions.filter((p) => p !== "admin.access").map((p) => (
                                      <li key={p}>{permissionLabels[p] ?? p}</li>
                                    ))}
                                  </ul>
                                ) : (
                                  <p className="small muted">
                                    {current.role_name === "SUPER_ADMIN"
                                      ? "Tous les droits du Super Admin sont protégés."
                                      : "Un compte utilisateur n’a pas de permissions administratives."}
                                  </p>
                                )}
                                {canEdit && (
                                  <>
                                    {!editing && (
                                      <Button onClick={() => setEditing(true)}>Modifier les autorisations</Button>
                                    )}
                                    {editing && (
                                      <>
                                        <Button type="button" onClick={() => {
                                          if (!confirmDraftNavigation()) return;
                                          setEditing(false);
                                        }}>Annuler la modification</Button>
                                        <UserEditor
                                          key={current.id}
                                          current={current}
                                          roles={user.role_name === "SUPER_ADMIN" ? roles : roles.filter((r) => r.name === "USER")}
                                          canChangeRole={user.role_name === "SUPER_ADMIN"}
                                          allowDirect={false}
                                          admins={users.filter((entry) => entry.role_name === "ADMIN")}
                                          submit={act}
                                        />
                                      </>
                                    )}
                                  </>
                                )}
                              </section>
                            ),
                          },
                          {
                            id: "history",
                            label: "Historique",
                            content: (
                              <section>
                                <h4>Participations validées</h4>
                                {current.participation_history?.length ? (
                                  <ul>
                                    {current.participation_history.map((p, n) => (
                                      <li key={n}>Halloween {p.year} — Participation enregistrée</li>
                                    ))}
                                  </ul>
                                ) : <p>Aucune participation validée conservée.</p>}
                                <p className="small muted">Années uniquement, conservées cinq ans.</p>
                                <h4>Messages et notifications</h4>
                                {current.communications.length ? current.communications.map((m, n) => (
                                  <p className="small" key={n}>
                                    {({
                                      VERIFY: "Vérification du compte",
                                      INVITE: "Invitation",
                                      RESET: "Récupération du compte",
                                      HOUSE_SUBMITTED: "Maison reçue",
                                      HOUSE_APPROVED: "Maison validée",
                                      HOUSE_REFUSED: "Maison refusée",
                                      CAMPAIGN: "Campagne",
                                    } as Record<string, string>)[m.kind] ?? m.kind}
                                    {" · "}
                                    {m.season_id ? (m.season_name ?? current.participation_season ?? "Saison") : "Compte global"}
                                    {" · "}{m.status}{" · "}{date(m.sent_at ?? m.scheduled_at)}
                                    {m.last_error && " · " + m.last_error}
                                  </p>
                                )) : <p>Aucun envoi.</p>}
                              </section>
                            ),
                          },
                        ]}
                      />
                      {current && canEdit && (
                        <details className="admin-advanced-actions">
                          <summary>Actions avancées du compte</summary>
                          <div className="actions">
                            <AsyncButton onClick={() => act({
                              action: current.account_status === "DISABLED" ? "enable" : "disable",
                              id: current.id,
                            })}>
                              {current.account_status === "DISABLED" ? "Réactiver" : "Désactiver"}
                            </AsyncButton>
                            {current.account_status !== "DISABLED" &&
                              !/^test-[a-f0-9]{32}@example[.]invalid$/.test(current.email) &&
                              (current.email_status !== "VERIFIED" ||
                                current.account_status === "PENDING_ACTIVATION") && (
                                <AsyncButton onClick={() => act({ action: "resend", id: current.id })}>
                                  Renvoyer la vérification
                                </AsyncButton>
                              )}
                            {user.role_name === "SUPER_ADMIN" && (
                              <AsyncButton danger onClick={async () => {
                                await act({ action: "delete", id: current.id, confirm: "SUPPRIMER CE COMPTE" });
                                setSelected(null);
                              }}>Supprimer le compte</AsyncButton>
                            )}
                          </div>
                        </details>
                      )}
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
            <Select aria-label="Lignes utilisateurs par page"
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </Select>
          </label>
          <Pagination
            count={visible.total}
            page={visible.page}
            pageSize={pageSize}
            onPage={setPage}
          />
        </div>
      </div>
      {create && (
        <div className="modal-backdrop">
          <Dialog className="dialog panel user-sheet" aria-labelledby="user-create-title">
            <Button
              className="close"
              type="button"
              aria-label="Fermer"
              onClick={() => {
                if (!confirmDraftNavigation()) return;
                setCreate(false);
              }}
            >
              <X />
            </Button>
            <h2 id="user-create-title">Créer un utilisateur</h2>
            {manageable && (
              <UserEditor
                key="new"
                roles={user.role_name === "SUPER_ADMIN" ? roles : roles.filter((r) => r.name === "USER")}
                canChangeRole={true}
                allowDirect={user.role_name === "SUPER_ADMIN"}
                admins={users.filter((u) => u.role_name === "ADMIN")}
                submit={act}
              />
            )}
          </Dialog>
        </div>
      )}
    </>
  );
}
function UserEditor({
  current,
  roles,
  canChangeRole,
  submit,
  allowDirect = false,
  admins,
}: {
  allowDirect?: boolean;
  current?: ManagedUser;
  roles: Role[];
  canChangeRole: boolean;
  submit: (p: unknown) => Promise<void>;
  admins: ManagedUser[];
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [dirty, setDirty] = useState(false);
  useDraftGuard(dirty);
  const [direct, setDirect] = useState(false);
  const [roleId, setRoleId] = useState(
    current?.role_id ?? roles.find((r) => r.name === "USER")?.id ?? "",
  );
  const [grants, setGrants] = useState<string[]>(
    current?.role_name === "ADMIN" ? current.permissions : [],
  );
  return (
    <form
      onChange={() => setDirty(true)}
      onSubmit={async (e) => {
        e.preventDefault();
        const v = values(e.currentTarget);
        setError("");
        setBusy(true);
        try {
          await submit({
            action: current ? "edit" : "invite",
            id: current?.id,
            email: v.email || undefined,
            display_name: v.display_name,
            role_id: canChangeRole ? v.role_id : undefined,
            permissions:
              canChangeRole &&
              roles.find((r) => r.id === roleId)?.name === "ADMIN"
                ? grants
                : undefined,
            without_invitation: direct,
            password: direct ? v.password : undefined,
          });
          setDirty(false);
        } catch (e) {
          if (!(e instanceof ActionCancelled)) setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <h3>{current ? "Identité et accès" : "Identité"}</h3>
      <Field
        name="display_name"
        label="Nom ou pseudo"
        value={current?.display_name}
      />
      <Field
        name="email"
        type="email"
        label={direct ? "Email (facultatif)" : "Email"}
        required={!direct}
        value={current?.email}
      />
      {canChangeRole && (
        <label className="field">
          <span>Profil</span>
          <Select
            name="role_id"
            value={roleId}
            onChange={(e) => setRoleId(e.target.value)}
          >
            {roles
              .filter((r) => !direct || r.name === "USER")
              .map((r) => (
                <option key={r.id} value={r.id}>
                  {labels[r.name] ?? r.name}
                </option>
              ))}
          </Select>
        </label>
      )}
      {canChangeRole &&
        roles.find((r) => r.id === roleId)?.name === "ADMIN" && (
          <fieldset>
            <legend>Permissions individuelles</legend>
            <p className="small muted">
              Le grade ouvre le back-office. Chaque rubrique et action exige son
              autorisation.
            </p>
            <div className="actions">
              <Button
                type="button"
                onClick={() => {
                  setDirty(true);
                  setGrants([...defaultRoles.ADMIN]);
                }}
              >
                Tout sélectionner
              </Button>
              <Button
                type="button"
                onClick={() => {
                  setDirty(true);
                  setGrants([]);
                }}
              >
                Aucun
              </Button>
              <Select
                aria-label="Copier les droits d’un ADMIN"
                defaultValue=""
                onChange={(e) => {
                  const source = admins.find((a) => a.id === e.target.value);
                  if (source) setGrants(source.permissions);
                }}
              >
                <option value="">Copier les droits de…</option>
                {admins
                  .filter((a) => a.id !== current?.id)
                  .map((a) => (
                    <option value={a.id} key={a.id}>
                      {a.display_name}
                    </option>
                  ))}
              </Select>
            </div>
            {[
              "participants",
              "users",
              "season",
              "communications",
              "content",
              "stats",
              "audit",
            ].map((group) => (
              <div className="permission-group" key={group}>
                <h4>
                  {
                    (
                      {
                        participants: "Maisons",
                        users: "Utilisateurs",
                        season: "Saisons",
                        communications: "Communications",
                        content: "Contenus",
                        stats: "Statistiques",
                        audit: "Activité",
                      } as Record<string, string>
                    )[group]
                  }
                </h4>
                {defaultRoles.ADMIN.filter((p) =>
                  p.startsWith(group + "."),
                ).map((p) => (
                  <label key={p} className="check">
                    <Input
                      type="checkbox"
                      checked={grants.includes(p)}
                      onChange={(e) =>
                        setGrants((prev) =>
                          e.target.checked
                            ? [...prev, p]
                            : prev.filter((v) => v !== p),
                        )
                      }
                    />
                    {permissionLabels[p]}
                  </label>
                ))}
              </div>
            ))}
          </fieldset>
        )}
      {allowDirect && (
        <label className="check">
          <Input
            type="checkbox"
            checked={direct}
            onChange={(e) => setDirect(e.target.checked)}
          />{" "}
          Créer sans envoyer d’invitation
        </label>
      )}
      {direct && (
        <p>
          Sans email, une adresse interne est générée. Aucun message ne lui sera
          envoyé.
        </p>
      )}
      {direct && (
        <Field
          name="password"
          type="password"
          label="Mot de passe (12 caractères minimum)"
        />
      )}
      <Notice error={error} />
      <Button className="primary" disabled={busy}>
        {current
          ? "Enregistrer l’utilisateur"
          : direct
            ? "Créer le compte"
            : "Envoyer une invitation"}
      </Button>
      {!current && !direct && (
        <p className="small muted">
          Le destinataire valide son email et choisit son mot de passe. Aucun
          mot de passe n’est envoyé.
        </p>
      )}
    </form>
  );
}
