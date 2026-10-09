"use client";
import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { DateTime } from "luxon";
import { mailLayout } from "../lib/mail-layout";
import {
  api,
  Field,
  Check,
  Notice,
  AsyncButton,
  values,
  localDate,
} from "./common";
import { seasonFinished } from "../lib/domain";
import VisualEditor from "./VisualEditor";
import type { Season, User } from "../lib/domain";
type Campaign = {
  id: string;
  name: string;
  season_id: string;
  subject: string;
  body: string;
  audience: string;
  active: boolean;
  schedule_mode: string;
  anchor: string;
  offset_days: number;
  scheduled_at: string;
  status: string;
  recipients: number;
  sent: number;
  errors: number;
  pending: number;
};
type Data = {
  campaigns: Campaign[];
  smtpAvailable: boolean;
  variables: string[];
};
export default function Campaigns({
  season,
  zone,
  user,
}: {
  season: Season;
  zone: string;
  user: User;
}) {
  const [data, setData] = useState<Data | null>(null),
    [editing, setEditing] = useState<Campaign | null>(null),
    [creating, setCreating] = useState(false),
    [error, setError] = useState("");
  async function reload() {
    setData(
      await api<Data>(
        "admin/communications?seasonId=" + encodeURIComponent(season.id),
      ),
    );
  }
  useEffect(() => {
    void api<Data>(
      "admin/communications?seasonId=" + encodeURIComponent(season.id),
    )
      .then(setData)
      .catch((e) => setError(e.message));
  }, [season.id]);
  const manage =
    user.permissions.includes("communications.manage") &&
    !season.is_test &&
    !seasonFinished(season) &&
    !season.archived &&
    !season.purged_at;
  async function act(p: Record<string, unknown>) {
    await api("admin/communications", { ...p, seasonId: season.id });
    await reload();
    window.dispatchEvent(new Event("campaigns-changed"));
    setEditing(null);
    setCreating(false);
  }
  return (
    <section className="panel">
      <div className="section-heading">
        <h2>Communications</h2>
        {manage && !season.purged_at && (
          <button onClick={() => setCreating(true)}>Nouvelle campagne</button>
        )}
      </div>
      <Notice error={error} />
      {season.is_test && (
        <p className="notice info">
          Saison TEST : aucun email ne peut être envoyé.
        </p>
      )}
      {!data && !error && <p role="status">Chargement des communications…</p>}
      {data && !data.campaigns.length && (
        <p>Aucune campagne pour cette saison.</p>
      )}
      {data && !data.smtpAvailable && (
        <p className="notice info">
          SMTP non configuré : les messages restent en attente d’envoi.
        </p>
      )}
      <p className="small muted">
        Seuls les participants réels, actifs et dont l’email est vérifié
        reçoivent une campagne.
      </p>
      {data?.campaigns
        .filter((c) => c.season_id === season.id)
        .map((c) => (
          <article className="campaign-row" key={c.id}>
            <div>
              <h3>{c.name}</h3>
              <p>
                {DateTime.fromISO(c.scheduled_at)
                  .setZone(zone)
                  .setLocale("fr")
                  .toFormat("dd LLLL yyyy à HH:mm")}{" "}
                ·{" "}
                {c.schedule_mode === "RELATIVE"
                  ? `${c.offset_days > 0 ? "+" : ""}${c.offset_days} jours / ${{ opens_at: "ouverture", closes_at: "fermeture", purge_at: "purge", registrations_open_at: "inscriptions" }[c.anchor]}`
                  : "Date fixe"}
              </p>
              <p className="small">
                {c.status} · {c.recipients} destinataires · {c.sent} envoyés ·{" "}
                {c.pending} en attente · {c.errors} erreurs
              </p>
            </div>
            {manage && !season.purged_at && (
              <div className="actions">
                {["DRAFT", "SCHEDULED"].includes(c.status) && (
                  <button onClick={() => setEditing(c)}>Modifier</button>
                )}
                {user.email_status === "VERIFIED" ? (
                  <AsyncButton
                    onClick={() => act({ action: "test", id: c.id })}
                  >
                    Envoyer un test
                  </AsyncButton>
                ) : (
                  <p>Vérifiez votre email avant de recevoir un test.</p>
                )}
                {c.errors > 0 && (
                  <AsyncButton
                    onClick={() => act({ action: "retry", id: c.id })}
                  >
                    Relancer les erreurs sûres
                  </AsyncButton>
                )}
              </div>
            )}
          </article>
        ))}
      {(creating || editing) && data && (
        <CampaignForm
          key={editing?.id ?? "new"}
          campaign={editing ?? undefined}
          season={season}
          zone={zone}
          variables={data.variables}
          submit={act}
          close={() => {
            setCreating(false);
            setEditing(null);
          }}
        />
      )}
    </section>
  );
}
function CampaignForm({
  campaign,
  season,
  zone,
  variables,
  submit,
  close,
}: {
  campaign?: Campaign;
  season: Season;
  zone: string;
  variables: string[];
  submit: (p: Record<string, unknown>) => Promise<void>;
  close: () => void;
}) {
  const [mode, setMode] = useState(campaign?.schedule_mode ?? "RELATIVE"),
    [subject, setSubject] = useState(
      campaign?.subject ?? "Halloween arrive à {{territory}}",
    ),
    [body, setBody] = useState(
      campaign?.body ??
        "Bonjour {{name}},\n\n{{event_name}} ouvre le {{map_open_date}}. À bientôt !",
    ),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const preview = (text: string) =>
    text.replace(
      /\{\{(\w+)\}\}/g,
      (_, v) =>
        (
          ({
            name: "Camille",
            territory: "Votre commune",
            event_name: "Halloween",
            season_year: String(season.year),
            house_name: "La maison des fantômes",
            house_start_time: "18:00",
            registration_date: "1 octobre",
            map_open_date: "31 octobre à 12:00",
            map_close_date: "1 novembre à 00:00",
          }) as Record<string, string>
        )[v] ?? "",
    );
  return (
    <div className="modal-backdrop">
      <section
        className="dialog panel campaign-sheet"
        role="dialog"
        onClick={(event) => event.stopPropagation()}
        aria-modal="true"
        aria-labelledby="campaign-title"
      >
        <button className="close" aria-label="Fermer" onClick={close}>
          <X />
        </button>
        <h2 id="campaign-title">
          {campaign ? "Modifier la campagne" : "Nouvelle campagne"}
        </h2>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const v = values(e.currentTarget);
            setBusy(true);
            setError("");
            try {
              await submit({
                action: "save",
                id: campaign?.id,
                campaign: {
                  season_id: season.id,
                  name: v.name,
                  subject,
                  body,
                  audience: v.audience,
                  active: v.active === "on",
                  schedule_mode: mode,
                  anchor: v.anchor ?? "opens_at",
                  offset_days: Number(v.offset_days ?? 0),
                  scheduled_at:
                    v.scheduled_at ?? localDate(season.opens_at, zone),
                },
              });
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field name="name" label="Nom interne" value={campaign?.name} />
          <label className="field">
            <span>Sujet</span>
            <input
              required
              maxLength={150}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </label>
          <VisualEditor
            value={body}
            onChange={setBody}
            variables={variables}
            maxLength={5000}
          />
          <p className="small muted">
            Variables : {variables.map((v) => "{{" + v + "}}").join(" · ")}
          </p>
          <label className="field">
            <span>Audience</span>
            <select name="audience" defaultValue={campaign?.audience ?? "ALL"}>
              <option value="ALL">Tous les participants</option>
              <option value="VISIBLE">Maisons visibles</option>
              <option value="ACTIVE">Actifs</option>
            </select>
          </label>
          <label className="field">
            <span>Planification</span>
            <select value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="RELATIVE">Relative à la saison</option>
              <option value="ABSOLUTE">Date fixe</option>
            </select>
          </label>
          {mode === "RELATIVE" ? (
            <div className="grid two">
              <Field
                type="number"
                label="Décalage en jours (−14 = J−14)"
                name="offset_days"
                value={campaign?.offset_days ?? -14}
              />
              <label className="field">
                <span>Date de référence</span>
                <select
                  name="anchor"
                  defaultValue={campaign?.anchor ?? "opens_at"}
                >
                  <option value="opens_at">Ouverture de la carte</option>
                  <option value="closes_at">Fermeture de la carte</option>
                  <option value="registrations_open_at">
                    Ouverture des inscriptions
                  </option>
                  <option value="purge_at">Purge</option>
                </select>
              </label>
            </div>
          ) : (
            <Field
              type="datetime-local"
              name="scheduled_at"
              label="Date et heure"
              value={
                campaign
                  ? localDate(campaign.scheduled_at, zone)
                  : localDate(season.opens_at, zone)
              }
            />
          )}
          <Check
            name="active"
            label="Activer la programmation"
            checked={campaign?.active ?? true}
          />
          <Notice error={error} />
          <button className="primary" disabled={busy}>
            Enregistrer la campagne
          </button>
        </form>
        <h3>Aperçu</h3>
        <iframe
          title="Aperçu de l’email HTML"
          sandbox=""
          srcDoc={mailLayout(preview(subject), preview(body))}
          style={{ width: "100%", height: 480, border: 0 }}
        />
        <details>
          <summary>Version texte</summary>
          <p className="mail-preview">{preview(body)}</p>
        </details>
      </section>
    </div>
  );
}
