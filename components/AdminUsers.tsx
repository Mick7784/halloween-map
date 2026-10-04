"use client";
import { useState } from "react";
import { DateTime } from "luxon";
import { permissions, type User, type House } from "../lib/domain";
import {
  api,
  Field,
  Notice,
  values,
  labels,
  AsyncButton,
  Check,
  Badges,
} from "./common";
type Role = { id: string; name: string; permissions: string[] };
export type ManagedUser = User & {
  created_at: string;
  last_login_at: string | null;
  permission_grants: string[];
  permission_revocations: string[];
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
}: {
  users: ManagedUser[];
  roles: Role[];
  user: User;
  reload: () => Promise<void>;
}) {
  const [search, setSearch] = useState(""),
    [filter, setFilter] = useState("ALL"),
    [selected, setSelected] = useState<string | null>(null),
    [create, setCreate] = useState(false);
  const effective = (u: ManagedUser) =>
    [...u.permissions, ...u.permission_grants].filter(
      (p) => !u.permission_revocations.includes(p),
    );
  const list = users.filter(
    (u) =>
      (u.display_name + " " + u.email)
        .toLowerCase()
        .includes(search.toLowerCase()) &&
      (filter === "ALL" ||
        (filter === "PARTICIPANTS" && u.participation) ||
        (filter === "ADMIN" && effective(u).includes("admin.access")) ||
        (filter === "DISABLED" && u.account_status === "DISABLED") ||
        (filter === "UNVERIFIED" && u.email_status !== "VERIFIED")),
  );
  const current = users.find((u) => u.id === selected);
  const manageable = user.permissions.includes("users.manage");
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
                roles={roles.filter(
                  (r) =>
                    (r.name !== "SUPER_ADMIN" ||
                      user.role_name === "SUPER_ADMIN") &&
                    r.permissions.every((p) => user.permissions.includes(p)),
                )}
                allowed={user.permissions}
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
                <AsyncButton
                  danger
                  onClick={async () => {
                    const confirm = window.prompt(
                      "Cette suppression est définitive. Saisissez SUPPRIMER CE COMPTE.",
                    );
                    if (confirm) {
                      await act({ action: "delete", id: current.id, confirm });
                      setSelected(null);
                    }
                  }}
                >
                  Supprimer le compte
                </AsyncButton>
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
  allowed,
  submit,
}: {
  current?: ManagedUser;
  roles: Role[];
  allowed: string[];
  submit: (p: unknown) => Promise<void>;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
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
            role_id: v.role_id,
            permission_grants: allowed.filter((p) => v["grant:" + p] === "on"),
            permission_revocations: permissions.filter(
              (p) => v["revoke:" + p] === "on",
            ),
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
      <label className="field">
        <span>Profil</span>
        <select
          name="role_id"
          defaultValue={
            current?.role_id ?? roles.find((r) => r.name === "PARTICIPANT")?.id
          }
        >
          {roles.map((r) => (
            <option key={r.id} value={r.id}>
              {labels[r.name] ?? r.name}
            </option>
          ))}
        </select>
      </label>
      {current && (
        <details>
          <summary>Exceptions individuelles</summary>
          <div className="permissions-grid">
            {permissions.map((p) => (
              <div key={p}>
                <strong className="small">{p}</strong>
                {allowed.includes(p) && (
                  <Check
                    name={"grant:" + p}
                    label="Ajouter"
                    checked={current.permission_grants.includes(p)}
                  />
                )}
                <Check
                  name={"revoke:" + p}
                  label="Retirer"
                  checked={current.permission_revocations.includes(p)}
                />
              </div>
            ))}
          </div>
        </details>
      )}
      <Notice error={error} />
      <button className="primary" disabled={busy}>
        {current ? "Enregistrer l’utilisateur" : "Envoyer une invitation"}
      </button>
      {!current && (
        <p className="small muted">
          Le destinataire valide son email et choisit son mot de passe. Aucun
          mot de passe n’est envoyé.
        </p>
      )}
    </form>
  );
}
