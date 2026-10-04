"use client";
import { useState } from "react";
import type { LegalDocument, LegalKind } from "../lib/content";
import { api, Field, Notice, AsyncButton, values, Check } from "./common";
import Editorial from "./Editorial";
type Data = {
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
        ].map((c) => (
          <button
            key={c}
            className={category === c ? "active" : ""}
            onClick={() => {
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
      {category === "Documents" ? (
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
                setKey(e.target.value);
                setValue(data.values[e.target.value]);
              }}
            >
              {Object.entries(data.catalog)
                .filter(([, v]) => v.category === category)
                .map(([k]) => (
                  <option key={k} value={k}>
                    {k}
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
          <label className="field">
            <span>Texte</span>
            <textarea
              aria-label="Texte"
              rows={7}
              maxLength={10000}
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </label>
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
function LegalDraft({
  current,
  submit,
}: {
  current: LegalDocument;
  submit: (p: unknown) => Promise<void>;
}) {
  const [body, setBody] = useState(current.body),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <details>
      <summary>
        {current.status === "DRAFT"
          ? "Modifier ce brouillon"
          : "Préparer une nouvelle version"}
      </summary>
      <form
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
        <label className="field">
          <span>Document</span>
          <textarea
            aria-label="Document"
            rows={12}
            maxLength={10000}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        </label>
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
