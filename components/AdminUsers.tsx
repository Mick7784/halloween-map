"use client";
import { useState } from "react";
import { DateTime } from "luxon";
import { type User, type House } from "../lib/domain";
import {
  api,
  Field,
  Notice,
  values,
  labels,
  AsyncButton,
  Badges,
} from "./common";
type Role = { id: string; name: string; permissions: string[] };
export type ManagedUser = User & {
  created_at: string;
  last_login_at: string | null;
  participation: House | null;
  communications: {
    kind: string;
    status: string;
    scheduled_at: string;
    sent_at: string | null;
    last_error: string | null;
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
  seasonId,
  testSeason = false,
}: {
  seasonId?: string;
  testSeason?: boolean;
  users: ManagedUser[];
  roles: Role[];
  user: User;
  reload: () => Promise<void>;
}) {
  const [search, setSearch] = useState(""),
    [filter, setFilter] = useState("ALL"),
    [selected, setSelected] = useState<string | null>(null),
    [create, setCreate] = useState(false);
  const list = users.filter(
    (u) =>
      (u.display_name + " " + u.email)
        .toLowerCase()
        .includes(search.toLowerCase()) &&
      (filter === "ALL" ||
        (filter === "PARTICIPANTS" && u.participation) ||
        (filter === "ADMIN" &&
          ["ADMIN", "SUPER_ADMIN"].includes(u.role_name ?? "")) ||
        (filter === "DISABLED" && u.account_status === "DISABLED") ||
        (filter === "UNVERIFIED" && u.email_status !== "VERIFIED")),
  );
  const current = users.find((u) => u.id === selected);
  const manageable = user.permissions.includes("users.manage");
  async function act(p: unknown) {
    await api("admin/users", { ...(p as object), seasonId });
    await reload();
    setCreate(false);
  }
  const date = (v: string | null) =>
    v
      ? DateTime.fromISO(v).setLocale("fr").toFormat("dd LLL yyyy à HH:mm")
      : "—";
  return (
    <>
      <div className="toolbar">
        <input
          aria-label="Rechercher un utilisateur"
          placeholder="Nom ou email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {manageable && (
          <button className="primary" onClick={() => setCreate(true)}>
            Créer un utilisateur
          </button>
        )}
      </div>
      <div className="tabs">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            className={filter === id ? "active" : ""}
            onClick={() => setFilter(id)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Utilisateur</th>
              <th>Email</th>
              <th>Compte</th>
              <th>Participation</th>
              <th>Profil</th>
              <th>Dernière connexion</th>
            </tr>
          </thead>
          <tbody>
            {list.map((u) => (
              <tr key={u.id}>
                <td>
                  <button onClick={() => setSelected(u.id)}>
                    {u.display_name}
                  </button>
                  <small>{u.email}</small>
                </td>
                <td>{labels[u.email_status] ?? u.email_status}</td>
                <td>{labels[u.account_status] ?? u.account_status}</td>
                <td>{u.participation?.name ?? "—"}</td>
                <td>{labels[u.role_name ?? ""] ?? u.role_name}</td>
                <td>{date(u.last_login_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {(create || current) && (
        <div className="modal-backdrop">
          <section
            className="dialog panel user-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="user-title"
          >
            <button
              className="close"
              aria-label="Fermer"
              onClick={() => {
                setCreate(false);
                setSelected(null);
              }}
            >
              ×
            </button>
            <h2 id="user-title">
              {current?.display_name ?? "Inviter un utilisateur"}
            </h2>
            {current && (
              <>
                <h3>Identité</h3>
                <p>
                  {current.email} · {labels[current.email_status]} ·{" "}
                  {labels[current.account_status] ?? current.account_status}
                </p>
                <p className="small">
                  Création : {date(current.created_at)} · Dernière connexion :{" "}
                  {date(current.last_login_at)}
                </p>
                <h3>Participation actuelle</h3>
                {current.participation ? (
                  <>
                    <p>
                      {current.participation.name} ·{" "}
                      {current.participation.address}
                    </p>
                    <p>
                      {date(String(current.participation.starts_at))} →{" "}
                      {date(String(current.participation.ends_at))}
                    </p>
                    <Badges activities={current.participation.activities} />
                    <p>
                      Frayeur : {current.participation.fear}/5 ·{" "}
                      {labels[current.participation.status]} ·{" "}
                      {labels[current.participation.activity]}
                    </p>
                    <p>{current.participation.practical}</p>
                  </>
                ) : (
                  <p>Aucune participation.</p>
                )}
                <h3>Communications</h3>
                {current.communications.length ? (
                  current.communications.map((m, n) => (
                    <p className="small" key={n}>
                      {m.kind} · {m.status} ·{" "}
                      {date(m.sent_at ?? m.scheduled_at)}{" "}
                      {m.last_error && "· " + m.last_error}
                    </p>
                  ))
                ) : (
                  <p>Aucun envoi.</p>
                )}
              </>
            )}
            {manageable && (
              <UserEditor
                key={current?.id ?? "new"}
                current={current}
                roles={
                  user.role_name === "SUPER_ADMIN" && !testSeason
                    ? roles
                    : roles.filter((r) => r.name === "USER")
                }
                canChangeRole={user.role_name === "SUPER_ADMIN" || !current}
                allowDirect={
                  !current && testSeason && user.role_name === "SUPER_ADMIN"
                }
                submit={act}
              />
            )}
            {current && manageable && current.id !== user.id && (
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
                {(current.email_status !== "VERIFIED" ||
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
                      const confirm = window.prompt(
                        "Cette suppression est définitive. Saisissez SUPPRIMER CE COMPTE.",
                      );
                      if (confirm) {
                        await act({
                          action: "delete",
                          id: current.id,
                          confirm,
                        });
                        setSelected(null);
                      }
                    }}
                  >
                    Supprimer le compte
                  </AsyncButton>
                )}
              </div>
            )}
          </section>
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
}: {
  allowDirect?: boolean;
  current?: ManagedUser;
  roles: Role[];
  canChangeRole: boolean;
  submit: (p: unknown) => Promise<void>;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [direct, setDirect] = useState(false);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const v = values(e.currentTarget);
        setError("");
        setBusy(true);
        try {
          await submit({
            action: current ? "edit" : "invite",
            id: current?.id,
            email: v.email,
            display_name: v.display_name,
            role_id: canChangeRole ? v.role_id : undefined,
            without_invitation: direct,
            password: direct ? v.password : undefined,
          });
        } catch (e) {
          setError((e as Error).message);
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
      <Field name="email" type="email" label="Email" value={current?.email} />
      {canChangeRole && (
        <label className="field">
          <span>Profil</span>
          <select
            name="role_id"
            defaultValue={
              current?.role_id ?? roles.find((r) => r.name === "USER")?.id
            }
          >
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {labels[r.name] ?? r.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {allowDirect && (
        <label className="check">
          <input
            type="checkbox"
            checked={direct}
            onChange={(e) => setDirect(e.target.checked)}
          />{" "}
          Créer sans envoyer d’invitation
        </label>
      )}
      {direct && (
        <Field
          name="password"
          type="password"
          label="Mot de passe (12 caractères minimum)"
        />
      )}
      <Notice error={error} />
      <button className="primary" disabled={busy}>
        {current
          ? "Enregistrer l’utilisateur"
          : direct
            ? "Créer le compte"
            : "Envoyer une invitation"}
      </button>
      {!current && !direct && (
        <p className="small muted">
          Le destinataire valide son email et choisit son mot de passe. Aucun
          mot de passe n’est envoyé.
        </p>
      )}
    </form>
  );
}
