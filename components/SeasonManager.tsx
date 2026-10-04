"use client";
import { useEffect, useState } from "react";
import Campaigns from "./Campaigns";
import Link from "next/link";
import { DateTime } from "luxon";
import { CalendarDays, Ghost, Eye, ShieldAlert } from "lucide-react";
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
  const [valid, setValid] = useState(true),
    [impacted, setImpacted] = useState(0);
  useEffect(() => {
    const load = () =>
      void api<(Season & { relative_campaign_count: number })[]>(
        "admin/seasons",
      )
        .then((rows) =>
          setImpacted(
            rows.find((row) => row.id === season?.id)
              ?.relative_campaign_count ?? 0,
          ),
        )
        .catch(() => {});
    load();
    window.addEventListener("campaigns-changed", load);
    return () => window.removeEventListener("campaigns-changed", load);
  }, [season?.id]);
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
      onInput={(e) => {
        const v = values(e.currentTarget);
        const ordered =
          v.registrations_open_at <= v.opens_at &&
          v.opens_at < v.closes_at &&
          v.closes_at <= v.purge_at;
        setValid(ordered);
      }}
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
      <Notice
        error={
          !valid
            ? "Dates invalides : inscriptions ≤ ouverture < fermeture ≤ purge"
            : error
        }
      />
      {impacted > 0 && (
        <p className="notice info">
          {impacted}{" "}
          {impacted === 1
            ? "communication programmée sera recalculée."
            : "communications programmées seront recalculées."}
        </p>
      )}
      <button className="primary" disabled={busy || !valid}>
        {busy ? "Enregistrement…" : "Enregistrer la saison"}
      </button>
    </form>
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
  const year =
    Math.max(DateTime.now().setZone(zone).year, ...seasons.map((s) => s.year)) +
    1;
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
                {DateTime.fromJSDate(new Date(s.opens_at))
                  .setZone(zone)
                  .setLocale("fr")
                  .toFormat("dd LLLL yyyy à HH:mm")}{" "}
                →{" "}
                {DateTime.fromJSDate(new Date(s.closes_at))
                  .setZone(zone)
                  .setLocale("fr")
                  .toFormat("dd LLLL yyyy à HH:mm")}{" "}
                · purge :{" "}
                {DateTime.fromJSDate(new Date(s.purge_at))
                  .setZone(zone)
                  .setLocale("fr")
                  .toFormat("dd LLLL yyyy à HH:mm")}
              </p>
            )}
          </section>
          {!s.purged_at && !s.archived && (
            <div className="grid two">
              {has(user, "communications.read") && (
                <Campaigns season={s} zone={zone} user={user} />
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
                Suppression définitive des participations, maisons, adresses et
                messages. Seuls les totaux anonymes restent conservés. Les
                comptes restent disponibles pour les prochaines éditions.
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
