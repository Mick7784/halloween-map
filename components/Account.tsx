"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { DateTime } from "luxon";
import {
  api,
  Field,
  Notice,
  AsyncButton,
  values,
  type PublicState,
} from "./common";
import type { House, User } from "../lib/domain";
import Editorial from "./Editorial";
import InstallApp from "./InstallApp";
export function Signup({ state }: { state: PublicState }) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <main className="narrow">
      <div className="eyebrow">PARTAGER UN MOMENT MAGIQUE</div>
      <h1>{state.contents?.["account.create"]}</h1>
      <section className="panel privacy-block">
        <h2>{state.contents?.["privacy.title"]}</h2>
        <Editorial text={state.contents?.["privacy.signup"] ?? ""} />
        <Link href="/privacy">Politique de confidentialité</Link>
      </section>
      <section className="panel">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              await api("register", values(e.currentTarget));
              window.location.href = "/account?created=1";
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field name="display_name" label="Nom ou pseudo" />
          <Field name="email" type="email" label="Email" />
          <Field
            name="password"
            type="password"
            label="Mot de passe (12 caractères minimum)"
          />
          <Notice error={error} />
          <button disabled={busy} className="primary wide">
            {busy ? "Création…" : "Créer mon compte"}
          </button>
        </form>
        <p>
          Déjà inscrit ? <Link href="/login">Me connecter</Link>
        </p>
      </section>
    </main>
  );
}
export function Activation({ state }: { state: PublicState }) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <main className="narrow">
      <h1>Activer mon compte</h1>
      <section className="panel">
        <Editorial text={state.contents?.["account.activation"] ?? ""} />
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              await api("activation", values(e.currentTarget));
              window.location.href = "/account";
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field
            label="Votre mot de passe (12 caractères minimum)"
            name="password"
            type="password"
          />
          <Notice error={error} />
          <button className="primary" disabled={busy}>
            Activer mon compte
          </button>
        </form>
      </section>
    </main>
  );
}
export default function Account({
  user,
  state,
  refresh,
}: {
  user: User;
  state: PublicState;
  refresh: () => Promise<void>;
}) {
  const [house, setHouse] = useState<House | null>(null),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    if (query.has("created"))
      setMessage(
        state.contents?.["account.confirmation"] ?? "Votre compte est créé.",
      );
    if (query.has("link"))
      setError(
        "Ce lien est invalide ou expiré. Demandez une nouvelle vérification.",
      );
    void api<House | null>("house")
      .then(setHouse)
      .catch((e) => setError(e.message));
  }, [state.contents]);
  async function action(input: unknown) {
    setError("");
    setMessage("");
    const result = await api<{ deleted?: boolean }>("account", input);
    if (result.deleted) {
      window.location.href = "/";
      return;
    }
    await refresh();
    setMessage("Modification enregistrée.");
  }
  return (
    <main className="narrow">
      <h1>Mon compte</h1>
      <Notice error={error} />
      {message && (
        <p className="notice info" role="status">
          {message}
        </p>
      )}
      <section className="panel">
        <h2>{user.display_name}</h2>
        <p>{user.email}</p>
        <p className="badge">
          {user.email_status === "VERIFIED"
            ? "Email vérifié"
            : "Email non vérifié"}
        </p>
        {user.email_status !== "VERIFIED" && (
          <>
            <Editorial
              text={(state.contents?.["account.verify"] ?? "").replace(
                /\{\{user_name\}\}/g,
                user.display_name,
              )}
            />
            <AsyncButton
              onClick={async () => {
                await action({ action: "resend" });
                setMessage(
                  "Message de vérification programmé. Consultez votre messagerie.",
                );
              }}
            >
              Renvoyer la vérification
            </AsyncButton>
            <p className="small muted">
              Le lien expire après 48 heures. Un renvoi invalide le précédent.
              Si le message tarde, contactez l’équipe.
            </p>
          </>
        )}
        <details>
          <summary>Modifier mon identité</summary>
          <AccountForm
            label="Enregistrer mon nom"
            submit={action}
            action="name"
          >
            <Field
              label="Nom ou pseudo"
              name="display_name"
              value={user.display_name}
            />
          </AccountForm>
          <AccountForm label="Changer mon email" submit={action} action="email">
            <Field label="Nouvel email" name="email" type="email" />
            <Field
              label="Mot de passe actuel"
              name="current_password"
              type="password"
            />
            <p className="small">Le nouvel email devra être vérifié.</p>
          </AccountForm>
          <AccountForm
            label="Changer mon mot de passe"
            submit={action}
            action="password"
          >
            <Field
              label="Mot de passe actuel"
              name="current_password"
              type="password"
            />
            <Field
              label="Nouveau mot de passe (12 caractères minimum)"
              name="password"
              type="password"
            />
          </AccountForm>
        </details>
      </section>
      <section className="panel">
        <h2>Ma participation</h2>
        <p>{house ? house.name : "Aucune participation actuelle."}</p>
        <Link className="button primary" href="/participant">
          {house ? "Gérer ma participation" : "Inscrire ma maison"}
        </Link>
        <InstallApp />
      </section>
      <section className="panel">
        <h2>Confidentialité</h2>
        <Editorial
          text={(state.contents?.["privacy.account"] ?? "").replace(
            /\{\{user_name\}\}/g,
            user.display_name,
          )}
        />
        {state.season?.purge_at && (
          <p>
            Prochaine purge :{" "}
            {DateTime.fromISO(state.season.purge_at)
              .setZone(state.instance!.timezone)
              .setLocale("fr")
              .toFormat("dd LLLL yyyy à HH:mm")}
            .
          </p>
        )}
        <Link href="/privacy">Lire la politique de confidentialité</Link>
        <details>
          <summary>Supprimer mon compte</summary>
          <p>
            Cette action supprime votre compte, votre participation et les
            données associées.
          </p>
          <AccountForm
            action="delete"
            label="Supprimer définitivement mon compte"
            submit={action}
          >
            <Field
              label="Mot de passe actuel"
              name="current_password"
              type="password"
            />
            <Field label="Saisissez SUPPRIMER MON COMPTE" name="confirm" />
          </AccountForm>
        </details>
      </section>
    </main>
  );
}
function AccountForm({
  children,
  action,
  label,
  submit,
}: {
  children: React.ReactNode;
  action: string;
  label: string;
  submit: (p: unknown) => Promise<void>;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const v = values(e.currentTarget);
        setBusy(true);
        setError("");
        try {
          await submit({ action, ...v });
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      {children}
      <Notice error={error} />
      <button disabled={busy}>{label}</button>
    </form>
  );
}
