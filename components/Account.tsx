"use client";
import { useState } from "react";
import Link from "next/link";
import { api, Field, Notice, values, type PublicState } from "./common";
import Editorial from "./Editorial";
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
export { default } from "./AccountOverlay";
