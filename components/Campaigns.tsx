"use client";
import useDraftGuard from "./useDraftGuard";
import StudioCollectionControls from "./StudioCollectionControls";
import StudioMailPreview from "./StudioMailPreview";
import { selectStudioCollection } from "../lib/studio-collection";
import { Button, Dialog, Input, Select } from "./ui";
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
import EmailHtmlEditor from "./EmailHtmlEditor";
import { renderEmailHtmlDocument, emailDocumentText } from "../lib/email-html";
import { editorialText, editorialHtml } from "../lib/editorial-format";
import type { Season, User } from "../lib/domain";
type Campaign = {
  id: string;
  name: string;
  season_id: string;
  subject: string;
  body: string;
  html_body?: string | null;
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
    [search, setSearch] = useState(""),
    [status, setStatus] = useState("ALL"),
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
  // Keep the server's per-season results and exact statuses. Collection tools
  // operate only on the view; sending, scheduling and authorizations stay owned
  // by the existing campaign handlers.
  const seasonCampaigns = data?.campaigns.filter((c) => c.season_id === season.id) ?? [];
  const statuses = [...new Set(seasonCampaigns.map((c) => c.status))].sort(
    (a, b) => a.localeCompare(b, "fr"),
  );
  const visible = selectStudioCollection(
    seasonCampaigns.filter((c) => status === "ALL" || c.status === status),
    {
      query: search,
      searchText: (c) => [c.name, c.subject],
      pageSize: Math.max(1, seasonCampaigns.length),
    },
  );
  async function act(p: Record<string, unknown>) {
    await api("admin/communications", { ...p, seasonId: season.id });
    await reload();
    window.dispatchEvent(new Event("campaigns-changed"));
    setEditing(null);
    setCreating(false);
  }
  return (
    <section className="panel studio-communications">
      <div className="section-heading">
        <h2>Campagnes de communication</h2>
        {manage && !season.purged_at && (
          <Button onClick={() => setCreating(true)}>Nouvelle campagne</Button>
        )}
      </div>
      <Notice error={error} />
      {season.is_test && (
        <p className="notice info">
          Saison TEST : aucun email ne peut être envoyé.
        </p>
      )}
      {!data && !error && <p role="status">Chargement des communications…</p>}
      {data && !seasonCampaigns.length && (
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
      {data && seasonCampaigns.length > 0 && (
        <StudioCollectionControls
          label="Filtres des campagnes"
          count={visible.total}
          filtered={Boolean(search.trim()) || status !== "ALL"}
          onReset={() => {
            setSearch("");
            setStatus("ALL");
          }}
        >
          <div className="beta-filters studio-campaign-filters">
            <Input
              aria-label="Rechercher une campagne"
              placeholder="Nom ou objet du message…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <Select
              aria-label="Filtrer le statut des campagnes"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              <option value="ALL">Tous les statuts</option>
              {statuses.map((value) => (
                <option key={value} value={value}>{value}</option>
              ))}
            </Select>
          </div>
        </StudioCollectionControls>
      )}
      {data && seasonCampaigns.length > 0 && !visible.total && (
        <p className="beta-empty">Aucune campagne ne correspond aux filtres.</p>
      )}
      {visible.rows.map((c) => (
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
                  <Button onClick={() => setEditing(c)}>Modifier</Button>
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
    [htmlBody, setHtmlBody] = useState<string | null>(campaign?.html_body ?? null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const dirty =
    subject !== (campaign?.subject ?? "Halloween arrive à {{territory}}") ||
    body !==
      (campaign?.body ??
        "Bonjour {{name}},\n\n{{event_name}} ouvre le {{map_open_date}}. À bientôt !") ||
    mode !== (campaign?.schedule_mode ?? "RELATIVE") ||
    htmlBody !== (campaign?.html_body ?? null);
  useDraftGuard(dirty);
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
  let rendered: { html: string; text: string } | null = null;
  let htmlError = "";
  try {
    const vars = Object.fromEntries(variables.map((key) => [key, preview("{{" + key + "}}")]));
    const html = htmlBody
      ? renderEmailHtmlDocument(htmlBody, { allowedVariables: variables, variables: vars })
      : mailLayout(preview(subject), body, undefined, vars);
    rendered = { html, text: htmlBody ? emailDocumentText(html) : preview(editorialText(body)) };
  } catch (e) {
    htmlError = (e as Error).message;
  }
  return (
    <div className="modal-backdrop">
      <Dialog
        className="dialog panel campaign-sheet"
        role="dialog"
        onClick={(event) => event.stopPropagation()}
        aria-modal="true"
        aria-labelledby="campaign-title"
      >
        <Button
          className="close"
          aria-label="Fermer"
          onClick={() => {
            if (
              !dirty ||
              window.confirm("Quitter la campagne sans enregistrer ?")
            )
              close();
          }}
        >
          <X />
        </Button>
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
                  html_body: htmlBody,
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
            <Input
              required
              maxLength={150}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </label>
          {htmlBody ? (
            <>
              <EmailHtmlEditor value={htmlBody} onChange={setHtmlBody}
                variables={variables} />
              <Button type="button" onClick={() => {
                if (!window.confirm("Revenir au format simple ? Le brouillon HTML sera abandonné.")) return;
                setHtmlBody(null);
              }}>Revenir à l’éditeur simple</Button>
            </>
          ) : (
            <>
              <VisualEditor value={body} onChange={setBody}
                variables={variables} maxLength={5000} />
              <Button type="button" onClick={() => {
                setHtmlBody('<!doctype html><html lang="fr"><body style="margin:0;background-color:#17171e;color:#ffffff;font-family:Arial,sans-serif">' +
                  '<table role="presentation" width="100%" cellpadding="20"><tbody><tr><td>' +
                  '<h1>Halloween Map</h1>' + editorialHtml(body) +
                  '<hr style="border-top:1px solid #777777"></td></tr></tbody></table></body></html>');
              }}>Passer à l’éditeur HTML complet</Button>
            </>
          )}
          <p className="small muted">
            Variables : {variables.map((v) => "{{" + v + "}}").join(" · ")}
          </p>
          <label className="field">
            <span>Audience</span>
            <Select name="audience" defaultValue={campaign?.audience ?? "ALL"}>
              <option value="ALL">Tous les participants</option>
              <option value="VISIBLE">Maisons visibles</option>
              <option value="ACTIVE">Actifs</option>
            </Select>
          </label>
          <label className="field">
            <span>Planification</span>
            <Select value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="RELATIVE">Relative à la saison</option>
              <option value="ABSOLUTE">Date fixe</option>
            </Select>
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
                <Select
                  name="anchor"
                  defaultValue={campaign?.anchor ?? "opens_at"}
                >
                  <option value="opens_at">Ouverture de la carte</option>
                  <option value="closes_at">Fermeture de la carte</option>
                  <option value="registrations_open_at">
                    Ouverture des inscriptions
                  </option>
                  <option value="purge_at">Purge</option>
                </Select>
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
          <Button className="primary" disabled={busy}>
            Enregistrer la campagne
          </Button>
        </form>
        <StudioMailPreview
          title="Aperçu de la campagne"
          frameTitle="Aperçu de l’email HTML"
          html={rendered?.html}
          text={rendered?.text}
          error={htmlError}
          textLabel="Version texte"
        />
      </Dialog>
    </div>
  );
}
