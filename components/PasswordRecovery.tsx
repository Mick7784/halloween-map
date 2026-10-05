"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api, Field, Notice, values } from "./common";
export default function PasswordRecovery({
  reset = false,
}: {
  reset?: boolean;
}) {
  const [token, setToken] = useState(""),
    [error, setError] = useState(""),
    [done, setDone] = useState(false),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!reset) return;
    const url = new URL(window.location.href);
    setToken(url.searchParams.get("token") ?? "");
    window.history.replaceState(null, "", url.pathname);
  }, [reset]);
  return (
    <main className="narrow">
      <h1>{reset ? "Nouveau mot de passe" : "Mot de passe oublié"}</h1>
      <section className="panel">
        {done ? (
          <p role="status">
            {reset
              ? "Votre mot de passe a été modifié. Connectez-vous avec votre nouveau mot de passe."
              : "Si un compte correspond à cette adresse, un lien de récupération vous sera envoyé."}
          </p>
        ) : (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              try {
                const v = values(e.currentTarget);
                if (reset && v.password !== v.confirm_password)
                  throw new Error("Les mots de passe doivent être identiques");
                await api(
                  reset ? "reset-password" : "forgot-password",
                  reset ? { token, password: v.password } : { email: v.email },
                );
                setDone(true);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {reset ? (
              <>
                <Field
                  label="Nouveau mot de passe"
                  name="password"
                  type="password"
                />
                <Field
                  label="Confirmer le mot de passe"
                  name="confirm_password"
                  type="password"
                />
                <p className="muted small">12 caractères minimum.</p>
              </>
            ) : (
              <Field label="Email" name="email" type="email" />
            )}
            <Notice error={error} />
            <button className="primary" disabled={busy}>
              {reset ? "Enregistrer le mot de passe" : "Envoyer le lien"}
            </button>
          </form>
        )}
        <p>
          <Link href="/login">Se connecter</Link>
        </p>
      </section>
    </main>
  );
}
