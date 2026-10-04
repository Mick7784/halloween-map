"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { DateTime } from "luxon";
import { CalendarDays, Mail, Ghost, Eye, ShieldAlert } from "lucide-react";
import type { Season, User } from "../lib/domain";
import {
  api,
  Field,
  Check,
  Notice,
  values,
  localDate,
  has,
  AsyncButton,
} from "./common";
type ReminderSeason = Season & {
  reminder_enabled: boolean;
  reminder_at: string | null;
  reminder_subject: string;
  reminder_body: string;
  reminder_status: string;
  reminder_recipients: number;
  reminder_recipient_estimate: number;
  reminder_sent: number;
};
type Action = (
  action: string,
  payload: unknown,
  id?: string,
) => Promise<unknown>;
function SeasonForm({
  season,
  zone,
  year,
  act,
}: {
  season?: Season;
  zone: string;
  year: number;
  act: Action;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const dates = [
    [
      "registrations_open_at",
      "Ouverture des inscriptions",
      `${year}-10-01T00:00`,
    ],
    ["opens_at", "Ouverture publique de la carte", `${year}-10-31T12:00`],
    ["closes_at", "Fermeture publique de la carte", `${year}-11-01T00:00`],
    ["purge_at", "Purge définitive des données", `${year}-11-02T12:00`],
  ] as const;
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const v = values(e.currentTarget);
        setBusy(true);
        setError("");
        try {
          await act(
            "season",
            {
              ...v,
              year: Number(v.year),
              registrations_open: v.registrations_open === "on",
              activated: !!season && v.activated === "on",
            },
            season?.id,
          );
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <Field label="Année" name="year" type="number" value={year} />
      <div className="season-timeline">
        {dates.map(([key, label, fallback], n) => (
          <div key={key} className="timeline-step">
            <span>{n + 1}</span>
            <Field
              name={key}
              label={label}
              type="datetime-local"
              value={season ? localDate(season[key], zone) : fallback}
            />
          </div>
        ))}
      </div>
      <p className="muted small">
        Heures présentées en {zone}. La fermeture masque la carte ; les données
        restent accessibles à l’équipe jusqu’à la purge.
      </p>
      <div className="choices">
        <Check
          name="registrations_open"
          label="Autoriser les inscriptions"
          checked={season?.registrations_open ?? true}
        />
        {season && (
          <Check
            name="activated"
            label="Activer cette saison"
            checked={season.activated}
          />
        )}
      </div>
      <Notice error={error} />
      <button className="primary" disabled={busy}>
        {busy ? "Enregistrement…" : "Enregistrer la saison"}
      </button>
    </form>
  );
}
function Reminder({
  season,
  zone,
  act,
}: {
  season: ReminderSeason;
  zone: string;
  act: Action;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [preview, setPreview] = useState<{ subject: string; body: string } | null>(
      null,
    );
  const [available, setAvailable] = useState<boolean | null>(null);
  useEffect(() => {
    void api<{ smtpAvailable: boolean }>("admin/mail")
      .then((r) => setAvailable(r.smtpAvailable))
      .catch(() => setAvailable(false));
  }, []);
  const locked = ["SENDING", "SENT", "ERROR"].includes(season.reminder_status);
  return (
    <section className="panel reminder-panel">
      <div className="section-heading">
        <h2>
          <Mail /> Rappel aux participants
        </h2>
        <span className="badge">
          {
            {
              NONE: "Non programmé",
              SCHEDULED: "Programmé",
              SENDING: "En cours",
              SENT: "Envoyé",
              ERROR: "Erreur",
            }[season.reminder_status]
          }
        </span>
      </div>
      <p className="muted">
        Un message à chaque compte participant de cette saison. Les maisons de
        démonstration sont exclues.
      </p>
      {available === false && (
        <p className="notice info">
          Envoi email indisponible : configurez SMTP pour permettre au worker
          d’envoyer les rappels. L’application reste utilisable.
        </p>
      )}
      <p className="small">
        {["NONE", "SCHEDULED"].includes(season.reminder_status)
          ? season.reminder_recipient_estimate
          : season.reminder_recipients}{" "}
        destinataires {locked ? "lors du lancement" : "actuellement"} ·{" "}
        {season.reminder_sent} messages envoyés
      </p>
      {season.reminder_status === "ERROR" && (
        <p className="notice">
          Un ou plusieurs envois ont échoué ou leur résultat est incertain.
          Aucun nouvel envoi automatique, afin d’éviter les doublons.
        </p>
      )}
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const v = values(e.currentTarget);
          setBusy(true);
          setError("");
          try {
            await act(
              "reminder",
              {
                enabled: v.enabled === "on",
                at: v.at,
                subject: v.subject,
                body: v.body,
              },
              season.id,
            );
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <fieldset disabled={locked || busy}>
          <Check
            name="enabled"
            label="Activer le rappel"
            checked={season.reminder_enabled}
          />
          <div className="grid two">
            <Field
              label={`Date d’envoi (${zone})`}
              name="at"
              type="datetime-local"
              value={
                season.reminder_at
                  ? localDate(season.reminder_at, zone)
                  : localDate(season.opens_at, zone)
              }
            />
            <Field
              label="Sujet"
              name="subject"
              value={
                season.reminder_subject || "Votre maison fête Halloween ce soir"
              }
              maxLength={150}
            />
          </div>
          <label className="field">
            <span>Message *</span>
            <textarea
              name="body"
              required
              maxLength={5000}
              rows={5}
              defaultValue={
                season.reminder_body ||
                "Merci de faire vivre Halloween dans notre commune ! Pensez à vérifier vos horaires et vos informations pratiques avant l’accueil des visiteurs."
              }
            />
          </label>
          <div className="actions">
            <button className="primary">Enregistrer le rappel</button>
            <button
              type="button"
              onClick={(e) => {
                const v = values(e.currentTarget.form!);
                setPreview({ subject: v.subject, body: v.body });
              }}
            >
              <Eye size={18} /> Prévisualiser le message
            </button>
          </div>
        </fieldset>
        <Notice error={error} />
      </form>
      {preview && (
        <div className="mail-preview panel">
          <button
            className="close"
            aria-label="Fermer la prévisualisation email"
            onClick={() => setPreview(null)}
          >
            ×
          </button>
          <div className="eyebrow">APERÇU DU MESSAGE</div>
          <h3>{preview.subject}</h3>
          <p style={{ whiteSpace: "pre-wrap" }}>{preview.body}</p>
          <small>Texte brut · aucun suivi d’ouverture</small>
        </div>
      )}
    </section>
  );
}
function Demo({ season, zone }: { season: Season; zone: string }) {
  const [at, setAt] = useState(
      localDate(new Date(+new Date(season.opens_at) + 6 * 3600000), zone),
    ),
    [enabled, setEnabled] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    void api<{ at: string | null }>("admin/preview")
      .then((r) => {
        setEnabled(!!r.at);
        if (r.at) setAt(localDate(r.at, zone));
      })
      .catch((e) => setError(e.message));
  }, [zone]);
  return (
    <section className="panel demo-panel">
      <h2>
        <Ghost /> Mode démonstration
      </h2>
      <p className="muted">
        Explorez la vraie carte avec une heure simulée. Votre session seule voit
        cette prévisualisation ; les dates, le public, les purges et les
        compteurs réels restent inchangés.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          try {
            const v = values(e.currentTarget);
            await api("admin", {
              action: "preview",
              payload: { enabled: v.enabled === "on", at },
            });
            setEnabled(v.enabled === "on");
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        <Check
          name="enabled"
          label="Activer pour ma session"
          checked={enabled}
        />
        <label className="field">
          <span>Heure simulée ({zone}) *</span>
          <input
            type="datetime-local"
            required
            value={at}
            onChange={(e) => setAt(e.target.value)}
          />
        </label>
        <div className="actions">
          <button className="primary">Appliquer le mode démonstration</button>
          {enabled && (
            <Link
              className="button"
              href="/preview"
              target="_blank"
              rel="noreferrer"
            >
              <Eye size={18} /> Ouvrir la prévisualisation
            </Link>
          )}
        </div>
        <Notice error={error} />
      </form>
    </section>
  );
}
export default function SeasonManager({
  seasons,
  user,
  zone,
  act,
}: {
  seasons: Season[];
  user: User;
  zone: string;
  act: Action;
}) {
  const year = Math.max(DateTime.now().year, ...seasons.map((s) => s.year)) + 1;
  return (
    <div className="season-manager">
      {seasons.map((s) => (
        <div key={s.id}>
          <section className="panel">
            <div className="section-heading">
              <h2>
                <CalendarDays /> Saison {s.year}
              </h2>
              <span className="badge">
                {s.purged_at
                  ? "Purgée"
                  : s.archived
                    ? "Archivée"
                    : s.activated
                      ? "Active"
                      : "Préparation"}
              </span>
            </div>
            {!s.purged_at && !s.archived && has(user, "season.manage") ? (
              <SeasonForm season={s} zone={zone} year={s.year} act={act} />
            ) : (
              <p>
                {localDate(s.opens_at, zone)} → {localDate(s.closes_at, zone)} ·
                purge : {localDate(s.purge_at, zone)}
              </p>
            )}
          </section>
          {!s.purged_at && !s.archived && (
            <div className="grid two">
              {has(user, "season.manage") && (
                <Reminder season={s as ReminderSeason} zone={zone} act={act} />
              )}{" "}
              {has(user, "season.preview") && <Demo season={s} zone={zone} />}
            </div>
          )}
          {!s.purged_at && user.role_name === "SUPER_ADMIN" && (
            <section className="panel purge-block">
              <h3>
                <ShieldAlert /> Purge manuelle
              </h3>
              <p className="muted small">
                Suppression définitive des comptes participants, maisons,
                adresses et messages. Seuls les totaux anonymes restent
                conservés.
              </p>
              <AsyncButton
                danger
                onClick={async () => {
                  if (
                    window.confirm(
                      "Supprimer définitivement les données participantes de cette saison ? Cette action est irréversible.",
                    )
                  )
                    await act("purge", "PURGER", s.id);
                }}
              >
                Purger maintenant
              </AsyncButton>
            </section>
          )}
        </div>
      ))}
      {has(user, "season.manage") && seasons.every((s) => !!s.purged_at) && (
        <section className="panel">
          <h2>Préparer une nouvelle saison</h2>
          <SeasonForm zone={zone} year={year} act={act} />
        </section>
      )}
    </div>
  );
}
