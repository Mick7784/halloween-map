"use client";
import { useState } from "react";
import useDraftGuard, { confirmDraftNavigation } from "./useDraftGuard";
import { Button, Select } from "./ui";
import type { LegalDocument, LegalKind, LegalEvidence } from "../lib/content";
import { api, Field, Notice, values, Check } from "./common";
import DocumentWorkspace from "./DocumentWorkspace";
import { StudioShell, StudioNav, StudioPanel, SaveStatus } from "./Studio";
type Data = {
  links?: import("../lib/project-links").ProjectLinks;
  catalog: Record<
    string,
    { category: string; value: string; variables: readonly string[] }
  >;
  values: Record<string, string>;
  documents: LegalDocument[];
  active: Record<LegalKind, LegalDocument>;
  evidence?: LegalEvidence[];
};
const labels: Record<string, string> = {
  "home.eyebrow": "Nom de l’événement",
  "home.title": "Titre avant l’ouverture",
  "home.preparation": "Introduction de la prochaine édition",
  "home.subtitle": "Nombre de maisons",
  "home.count": "Mention des inscriptions",
  "home.house": "Maison (singulier)",
  "home.houses": "Maisons (pluriel)",
  "home.register": "Invitation à participer",
  "home.final": "Message de participation",
  "home.open": "Titre pendant l’événement",
  "home.closed": "Titre après l’événement",
  "home.closedBody": "Remerciements",
  "home.empty": "Carte sans résultat",
  "account.create": "Création du compte",
  "account.verify": "Vérification du compte",
  "account.activation": "Activation du compte",
  "account.confirmation": "Confirmation du compte",
  "participation.title": "Titre du formulaire",
  "participation.intro": "Consignes d’inscription",
  "participation.confirmation": "Confirmation de participation",
  "privacy.title": "Titre de confidentialité",
  "privacy.signup": "Confidentialité à l’inscription",
  "privacy.account": "Conservation des données du compte",
  "footer.signature": "Signature",
};
export default function ContentAdmin({
  data,
  reload,
}: {
  data: Data;
  reload: () => Promise<void>;
}) {
  const [section, setSection] = useState("texts"),
    [kind, setKind] = useState<LegalKind | null>(null);
  async function action(p: unknown) {
    await api("admin/content", p);
    await reload();
  }
  return (
    <StudioShell
      navigation={
        <StudioNav
          current={section}
          onSelect={(id) => {
            if (confirmDraftNavigation()) {
              setSection(id);
              setKind(null);
            }
          }}
          items={[
            {
              id: "texts",
              label: "Textes de l’application",
              description: "Accueil, compte et participation",
            },
            {
              id: "documents",
              label: "Documents officiels",
              description: "Brouillons, versions et publications",
            },
            {
              id: "links",
              label: "Liens & contact",
              description: "Coordonnées et soutien",
            },
          ]}
        />
      }
    >
      {section === "texts" ? (
        <ApplicationTexts data={data} submit={action} />
      ) : section === "links" ? (
        <LinksEditor links={data.links} submit={action} />
      ) : kind ? (
        <DocumentWorkspace
          key={kind}
          active={data.active[kind]}
          documents={data.documents.filter((d) => d.kind === kind)}
          evidence={data.evidence?.filter((e) => e.kind === kind)}
          reload={reload}
          onBack={() => setKind(null)}
        />
      ) : (
        <>
          <h3>Documents officiels</h3>
          <p>
            Préparez vos textes sans modifier leur version publique. La
            publication fait l’objet d’une vérification distincte.
          </p>
          <div className="studio-document-grid">
            {Object.entries(data.active).map(([k, d]) => {
              const draft = data.documents.find(
                (v) => v.kind === k && v.status === "DRAFT",
              );
              return (
                <StudioPanel key={k} title={d.title}>
                  <p>Version active : {d.version}</p>
                  <p>
                    <span className="studio-badge">
                      {d.prepared ? "Prêt à publier" : "Préparation à vérifier"}
                    </span>
                    {draft && (
                      <span className="studio-badge">
                        Brouillon {draft.version}
                      </span>
                    )}
                  </p>
                  <p className="field-help">
                    {d.prepared
                      ? "Informations de préparation confirmées par l’exploitant."
                      : "Le modèle initial ou l’ancien document nécessite une vérification de l’exploitant."}
                  </p>
                  <div className="studio-actions">
                    <Button
                      type="button"
                      onClick={() => setKind(k as LegalKind)}
                    >
                      {draft ? "Ouvrir le brouillon" : "Ouvrir le document"}
                    </Button>
                  </div>
                </StudioPanel>
              );
            })}
          </div>
        </>
      )}
    </StudioShell>
  );
}
function ApplicationTexts({
  data,
  submit,
}: {
  data: Data;
  submit: (p: unknown) => Promise<void>;
}) {
  const [category, setCategory] = useState("Accueil"),
    [key, setKey] = useState(Object.keys(data.catalog)[0]),
    [value, setValue] = useState(
      data.values[Object.keys(data.catalog)[0]] ?? "",
    );
  const [baseline, setBaseline] = useState(value),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [done, setDone] = useState(false);
  const dirty = value !== baseline;
  useDraftGuard(dirty);
  function choose(next: string) {
    if (dirty && !window.confirm("Quitter ce texte sans enregistrer ?")) return;
    setKey(next);
    setValue(data.values[next]);
    setBaseline(data.values[next]);
    setError("");
    setDone(false);
  }
  async function save(reset = false) {
    setError("");
    setBusy(true);
    try {
      const next = reset ? data.catalog[key].value : value;
      await submit(
        reset ? { action: "reset", key } : { action: "save", key, value },
      );
      setValue(next);
      setBaseline(next);
      setDone(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <StudioPanel
      title="Textes de l’application"
      description="Personnalisez les messages par contexte. Leur présentation suit le design de Halloween Map."
    >
      <label>
        Contexte
        <Select
          value={category}
          disabled={busy}
          onChange={(e) => {
            if (dirty && !window.confirm("Quitter ce texte sans enregistrer ?"))
              return;
            const c = e.target.value;
            setCategory(c);
            const first = Object.keys(data.catalog).find(
              (k) => data.catalog[k].category === c,
            )!;
            setKey(first);
            setValue(data.values[first]);
            setBaseline(data.values[first]);
            setDone(false);
            setError("");
          }}
        >
          {[
            "Accueil",
            "Compte",
            "Participation",
            "Confidentialité",
            "Interface",
          ].map((c) => (
            <option key={c}>{c}</option>
          ))}
        </Select>
      </label>
      <label>
        Texte à personnaliser
        <Select
          value={key}
          disabled={busy}
          onChange={(e) => choose(e.target.value)}
        >
          {Object.entries(data.catalog)
            .filter(([, d]) => d.category === category)
            .map(([k]) => (
              <option key={k} value={k}>
                {labels[k] ?? k}
              </option>
            ))}
        </Select>
      </label>
      <p className="field-help">
        Modifiez le message sans ajouter de mise en page. Les variables sont
        remplacées par les informations de votre événement.
      </p>
      <label>
        {labels[key] ?? "Texte"}
        <textarea
          value={value}
          maxLength={10000}
          disabled={busy}
          onChange={(e) => {
            setValue(e.target.value);
            setDone(false);
          }}
        />
      </label>
      <details>
        <summary>Variables disponibles</summary>
        <p>
          {data.catalog[key].variables.map((v) => "{{" + v + "}}").join(" · ")}
        </p>
      </details>
      <Notice error={error} />
      <div className="studio-actions">
        <Button
          type="button"
          className="primary"
          disabled={busy || !dirty}
          onClick={() => void save()}
        >
          Enregistrer le texte
        </Button>
        <Button
          type="button"
          disabled={busy}
          onClick={() => {
            if (window.confirm("Rétablir le texte d’origine ?"))
              void save(true);
          }}
        >
          Rétablir le défaut
        </Button>
        <SaveStatus dirty={dirty} busy={busy} saved={done} />
      </div>
      <h4>Aperçu du texte</h4>
      <div className="studio-text-preview">
        {value.replace(
          /\{\{\s*(\w+)\s*\}\}/g,
          (_, v) =>
            (
              ({
                event_name: "Halloween",
                territory: "Votre commune",
                season_year: "2026",
                house_count: "12",
                user_name: "Camille",
                registration_date: "1 octobre",
                map_open_date: "31 octobre",
                map_close_date: "1 novembre",
                purge_date: "8 novembre",
              }) as Record<string, string>
            )[v] ?? "{{" + v + "}}",
        )}
      </div>
    </StudioPanel>
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
    [done, setDone] = useState(false),
    [dirty, setDirty] = useState(false);
  useDraftGuard(dirty);
  return (
    <section className="studio-panel">
      <h2>Liens & contact</h2>
      <p className="small muted">
        Signaler un bug et contacter l’organisateur : menu utilisateur. Soutenir
        le projet : accueil et pied de page. Les liens légaux restent toujours
        disponibles.
      </p>
      <form
        inert={busy}
        onChange={() => {
          setDirty(true);
          setDone(false);
        }}
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
            setDirty(false);
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
        <Button disabled={busy} className="primary">
          Enregistrer les liens
        </Button>
      </form>
    </section>
  );
}
