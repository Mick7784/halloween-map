"use client";
import { useEffect, useState } from "react";
import type { LegalDocument, LegalKind } from "../lib/content";
import { api, Field, Notice, AsyncButton, values, Check } from "./common";
import Editorial from "./Editorial";
import VisualEditor from "./VisualEditor";
type Data = {
  links?: import("../lib/project-links").ProjectLinks;
  catalog: Record<
    string,
    { category: string; value: string; variables: string[] }
  >;
  values: Record<string, string>;
  documents: LegalDocument[];
  active: Record<LegalKind, LegalDocument>;
};
export default function ContentAdmin({
  data,
  reload,
}: {
  data: Data;
  reload: () => Promise<void>;
}) {
  const [key, setKey] = useState(Object.keys(data.catalog)[0]),
    [category, setCategory] = useState("Accueil"),
    [value, setValue] = useState(data.values[key]),
    [kind, setKind] = useState<LegalKind>("TERMS");
  useEffect(() => {
    if (value === data.values[key]) return;
    const guard = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [value, data.values, key]);
  async function action(p: unknown) {
    await api("admin/content", p);
    await reload();
  }
  return (
    <div className="cms-layout">
      <div className="tabs">
        {[
          "Accueil",
          "Compte",
          "Participation",
          "Confidentialité",
          "Interface",
          "Documents",
          "Liens & contact",
        ].map((c) => (
          <button
            key={c}
            className={category === c ? "active" : ""}
            onClick={() => {
              if (
                value !== data.values[key] &&
                !window.confirm("Quitter ce texte sans enregistrer ?")
              )
                return;
              setCategory(c);
              const first = Object.entries(data.catalog).find(
                ([, d]) => d.category === c,
              )?.[0];
              if (first) {
                setKey(first);
                setValue(data.values[first]);
              }
            }}
          >
            {c}
          </button>
        ))}
      </div>
      {category === "Liens & contact" ? (
        <LinksEditor links={data.links} submit={action} />
      ) : category === "Documents" ? (
        <section className="panel">
          <h2>Documents versionnés</h2>
          <label className="field">
            <span>Document</span>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as LegalKind)}
            >
              {Object.entries(data.active).map(([k, d]) => (
                <option key={k} value={k}>
                  {d.title}
                </option>
              ))}
            </select>
          </label>
          <p>
            Version active : {data.active[kind].version}{" "}
            {data.active[kind].requires_reaccept
              ? "· Réacceptation requise"
              : ""}
          </p>
          <details>
            <summary>Lire la version active</summary>
            <Editorial text={data.active[kind].body} />
          </details>
          <LegalDraft key={kind} current={data.active[kind]} submit={action} />
          {data.documents
            .filter((d) => d.kind === kind)
            .map((d) => (
              <article className="legal-version" key={d.id}>
                <h3>
                  {d.title} · {d.version}
                </h3>
                <p>
                  {d.status === "DRAFT" ? "Brouillon" : "Publié"}{" "}
                  {d.active && "· Actif"}{" "}
                  {d.requires_reaccept && "· Réacceptation requise"}
                </p>
                <details>
                  <summary>Aperçu</summary>
                  <Editorial text={d.body} />
                </details>
                {d.status === "DRAFT" && (
                  <LegalDraft current={d} submit={action} />
                )}
                {d.status === "DRAFT" && (
                  <AsyncButton
                    onClick={() => action({ action: "publish", id: d.id })}
                  >
                    Publier cette version
                  </AsyncButton>
                )}
              </article>
            ))}
        </section>
      ) : (
        <section className="panel">
          <label className="field">
            <span>Contenu à modifier</span>
            <select
              value={key}
              onChange={(e) => {
                if (
                  value !== data.values[key] &&
                  !window.confirm("Quitter ce texte sans enregistrer ?")
                )
                  return;
                setKey(e.target.value);
                setValue(data.values[e.target.value]);
              }}
            >
              {Object.entries(data.catalog)
                .filter(([, v]) => v.category === category)
                .map(([k]) => (
                  <option key={k} value={k}>
                    {(
                      {
                        "home.preparation":
                          "Introduction de la prochaine édition",
                        "home.final": "Message de participation",
                        "home.closedBody": "Fin de l’événement",
                        "account.verify": "Vérification du compte",
                        "account.activation": "Activation du compte",
                        "account.confirmation": "Confirmation du compte",
                        "participation.intro": "Consignes d’inscription",
                        "participation.confirmation":
                          "Confirmation de participation",
                        "privacy.signup": "Confidentialité à l’inscription",
                        "privacy.account": "Conservation des données du compte",
                        "footer.signature": "Signature",
                      } as Record<string, string>
                    )[k] ?? k}
                  </option>
                ))}
            </select>
          </label>
          <p className="small muted">
            Variables disponibles :{" "}
            {data.catalog[key]?.variables
              .map((v) => "{{" + v + "}}")
              .join(" · ")}
          </p>
          <VisualEditor
            value={value ?? ""}
            onChange={setValue}
            variables={data.catalog[key]?.variables}
            label="Texte"
          />
          <p className="small muted">
            Paragraphes, **gras**, *italique*, [lien](https://…), listes et
            titres. Aucun HTML.
          </p>
          <div className="actions">
            <AsyncButton onClick={() => action({ action: "save", key, value })}>
              Enregistrer le contenu
            </AsyncButton>
            <AsyncButton
              onClick={async () => {
                await action({ action: "reset", key });
                setValue(data.catalog[key].value);
              }}
            >
              Rétablir le défaut
            </AsyncButton>
          </div>
          <h3>Aperçu</h3>
          <Editorial text={value ?? ""} />
        </section>
      )}
    </div>
  );
}
function LinksEditor({
  links,
  submit,
}: {
  links?: import("../lib/project-links").ProjectLinks;
  submit: (p: unknown) => Promise<void>;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [done, setDone] = useState(false);
  return (
    <section className="panel">
      <h2>Liens & contact</h2>
      <p className="small muted">
        Signaler un bug et contacter l’organisateur : menu utilisateur. Soutenir
        le projet : accueil et pied de page. Les liens légaux restent toujours
        disponibles.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const v = values(e.currentTarget);
          setBusy(true);
          setError("");
          try {
            await submit({
              action: "links",
              links: {
                bugEnabled: v.bugEnabled === "on",
                supportEnabled: v.supportEnabled === "on",
                contactEnabled: v.contactEnabled === "on",
                bugEmail: v.bugEmail,
                contactEmail: v.contactEmail,
                bugUrl: v.bugUrl,
                supportUrl: v.supportUrl,
                contactUrl: v.contactUrl,
              },
            });
            setDone(true);
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {[
          ["bug", "Signaler un bug"],
          ["support", "Soutenir le projet"],
          ["contact", "Contacter l’organisateur"],
        ].map(([key, label]) => (
          <fieldset key={key}>
            <legend>{label}</legend>
            <Check
              name={key + "Enabled"}
              label="Activer"
              checked={
                links?.[
                  (key + "Enabled") as
                    "bugEnabled" | "supportEnabled" | "contactEnabled"
                ] !== false
              }
            />
            <Field
              name={key + "Url"}
              label="Destination HTTPS (facultatif)"
              type="url"
              required={false}
              value={
                links?.[(key + "Url") as "bugUrl" | "supportUrl" | "contactUrl"]
              }
            />
            {key !== "support" && (
              <Field
                name={key + "Email"}
                label="Adresse de contact"
                type="email"
                required={key === "bug"}
                value={links?.[(key + "Email") as "bugEmail" | "contactEmail"]}
              />
            )}
          </fieldset>
        ))}
        <Notice error={error} />
        {done && <p role="status">Liens enregistrés.</p>}
        <button disabled={busy} className="primary">
          Enregistrer les liens
        </button>
      </form>
    </section>
  );
}
function LegalDraft({
  current,
  submit,
}: {
  current: LegalDocument;
  submit: (p: unknown) => Promise<void>;
}) {
  const [body, setBody] = useState(current.body),
    [dirty, setDirty] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!dirty) return;
    const guard = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);
  return (
    <details>
      <summary>
        {current.status === "DRAFT"
          ? "Modifier ce brouillon"
          : "Préparer une nouvelle version"}
      </summary>
      <form
        onChange={() => setDirty(true)}
        onSubmit={async (e) => {
          e.preventDefault();
          const v = values(e.currentTarget);
          setBusy(true);
          setError("");
          try {
            await submit({
              action: "draft",
              id: current.status === "DRAFT" ? current.id : undefined,
              document: {
                kind: current.kind,
                version: v.version,
                title: v.title,
                body,
                requires_reaccept: v.requires_reaccept === "on",
              },
            });
            setDirty(false);
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field
          name="version"
          label="Version (ex. 2027.2)"
          value={current.status === "DRAFT" ? current.version : undefined}
        />
        <Field name="title" label="Titre" value={current.title} />
        <VisualEditor
          value={body}
          onChange={(value) => {
            setBody(value);
            setDirty(true);
          }}
          label="Document"
        />
        {["TERMS", "GUIDELINES"].includes(current.kind) && (
          <Check
            name="requires_reaccept"
            label="Changement important : réacceptation requise"
            checked={current.requires_reaccept}
          />
        )}
        <Notice error={error} />
        <button className="primary" disabled={busy}>
          {current.status === "DRAFT"
            ? "Enregistrer le brouillon"
            : "Créer le brouillon"}
        </button>
      </form>
      <h3>Aperçu du brouillon</h3>
      <Editorial text={body} />
    </details>
  );
}
