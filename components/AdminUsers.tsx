"use client";
import { ActionCancelled } from "./AdminConfirmation";
import { X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import useDraftGuard, { confirmDraftNavigation } from "./useDraftGuard";
import { DateTime } from "luxon";
import { type User, type House, defaultRoles } from "../lib/domain";
import { permissionLabels } from "../lib/admin-presentation";
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
    [create, setCreate] = useState(initialCreate);
  const list = users.filter(
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
  );
  const current = users.find((u) => u.id === selected);
  function showUser(id: string, edit = false) {
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
              <th>Utilisateur</th>
              <th>Email</th>
              <th>Compte</th>
              <th>Participation</th>
              <th>Profil</th>
              <th>Dernière connexion</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {list
              .slice(
                (Math.min(page, Math.max(1, Math.ceil(list.length / 25))) - 1) *
                  25,
                Math.min(page, Math.max(1, Math.ceil(list.length / 25))) * 25,
              )
              .map((u) => (
                <tr key={u.id}>
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
              ))}
          </tbody>
        </DataTable>
        <Pagination
          count={list.length}
          page={Math.min(page, Math.max(1, Math.ceil(list.length / 25)))}
          onPage={setPage}
        />
      </div>
      {(create || current) && (
        <div className="modal-backdrop">
          <Dialog
            className="dialog panel user-sheet"
            role="dialog"
            onClick={(event) => event.stopPropagation()}
            aria-modal="true"
            aria-labelledby="user-title"
          >
            <Button
              className="close"
              aria-label="Fermer"
              onClick={() => {
                if (!confirmDraftNavigation()) return;
                setCreate(false);
                setSelected(null);
                onClose?.();
              }}
            >
              <X />
            </Button>
            <h2 id="user-title">
              {current?.display_name ?? "Créer un utilisateur"}
            </h2>
            {current && (
              <>
                <h3>Identité</h3>
                <p>
                  {current.email} · {labels[current.email_status]} ·{" "}
                  {labels[current.account_status] ?? current.account_status}
                </p>
                <h3>Accès</h3>
                <p>{labels[current.role_name ?? "USER"]}</p>
                {current.role_name === "ADMIN" && (
                  <p className="small">
                    {current.permissions
                      .filter((p) => p !== "admin.access")
                      .map((p) => permissionLabels[p] ?? p)
                      .join(" · ") || "Aucune autorisation de rubrique."}
                  </p>
                )}
                <p className="small">
                  Création : {date(current.created_at)} · Dernière connexion :{" "}
                  {date(current.last_login_at)}
                </p>
                <h3>
                  Participation :{" "}
                  {current.participation_season ?? "Aucune saison active"}
                </h3>
                {current.participation ? (
                  <>
                    <p>{current.participation.name}</p>
                    <Button onClick={() => onHouse(current.participation!.id)}>
                      Ouvrir la fiche maison
                    </Button>
                  </>
                ) : (
                  <p>Aucune participation.</p>
                )}
                <details>
                  <summary>Historique des participations validées</summary>
                  {current.participation_history?.length ? (
                    <ul>
                      {current.participation_history.map((p, n) => (
                        <li key={n}>
                          Halloween {p.year} — Participation enregistrée
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p>Aucune participation validée conservée.</p>
                  )}
                  <p className="small muted">
                    Inscription validée comme propriétaire, sans attestation de
                    visite ou d’accueil. Années uniquement, conservées cinq ans.
                  </p>
                </details>
                <h3>Messages du compte et notifications de saison</h3>
                {current.communications.length ? (
                  current.communications.map((m, n) => (
                    <p className="small" key={n}>
                      {(
                        {
                          VERIFY: "Vérification du compte",
                          INVITE: "Invitation",
                          RESET: "Récupération du compte",
                          HOUSE_SUBMITTED: "Maison reçue",
                          HOUSE_APPROVED: "Maison validée",
                          HOUSE_REFUSED: "Maison refusée",
                          CAMPAIGN: "Campagne",
                        } as Record<string, string>
                      )[m.kind] ?? m.kind}{" "}
                      ·{" "}
                      {m.season_id
                        ? (m.season_name ??
                          current.participation_season ??
                          "Saison")
                        : "Compte global"}{" "}
                      · {m.status} · {date(m.sent_at ?? m.scheduled_at)}{" "}
                      {m.last_error && "· " + m.last_error}
                    </p>
                  ))
                ) : (
                  <p>Aucun envoi.</p>
                )}
              </>
            )}
            {current?.id === user.id && <Link href="/account">Mon compte</Link>}
            {canEdit && current && !editing && (
              <Button onClick={() => setEditing(true)}>
                Modifier l’utilisateur
              </Button>
            )}
            {canEdit && (!current || editing) && (
              <UserEditor
                key={current?.id ?? "new"}
                current={current}
                roles={
                  user.role_name === "SUPER_ADMIN"
                    ? roles
                    : roles.filter((r) => r.name === "USER")
                }
                canChangeRole={user.role_name === "SUPER_ADMIN" || !current}
                allowDirect={!current && user.role_name === "SUPER_ADMIN"}
                admins={users.filter((u) => u.role_name === "ADMIN")}
                submit={act}
              />
            )}
            {current && canEdit && (
              <div className="actions">
                <AsyncButton
                  onClick={() =>
                    act({
                      action:
                        current.account_status === "DISABLED"
                          ? "enable"
                          : "disable",
                      id: current.id,
                    })
                  }
                >
                  {current.account_status === "DISABLED"
                    ? "Réactiver"
                    : "Désactiver"}
                </AsyncButton>
                {current.account_status !== "DISABLED" &&
                  !/^test-[a-f0-9]{32}@example[.]invalid$/.test(
                    current.email,
                  ) &&
                  (current.email_status !== "VERIFIED" ||
                    current.account_status === "PENDING_ACTIVATION") && (
                    <AsyncButton
                      onClick={() => act({ action: "resend", id: current.id })}
                    >
                      {current.account_status === "PENDING_ACTIVATION"
                        ? "Renvoyer l’invitation"
                        : "Renvoyer la vérification"}
                    </AsyncButton>
                  )}
                {user.role_name === "SUPER_ADMIN" && (
                  <AsyncButton
                    danger
                    onClick={async () => {
                      await act({
                        action: "delete",
                        id: current.id,
                        confirm: "SUPPRIMER CE COMPTE",
                      });
                      setSelected(null);
                    }}
                  >
                    Supprimer le compte
                  </AsyncButton>
                )}
              </div>
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
