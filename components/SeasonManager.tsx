"use client";
import AdminStatistics from "./AdminStatistics";
import { Fragment, useState } from "react";
import { ChevronDown, ChevronUp, CircleCheck, Plus, X } from "lucide-react";
import {
  seasonFinished,
  seasonLabel,
  type Season,
  type User,
} from "../lib/domain";
import {
  Field,
  Check,
  Notice,
  AsyncButton,
  localDate,
  values,
  has,
} from "./common";

type Action = (action: string, payload: unknown, id?: string) => Promise<void>;
function Statistics({
  season,
  onClose,
}: {
  season: Season;
  onClose: () => void;
}) {
  return (
    <div className="beta-overlay">
      <section
        className="beta-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Statistiques historiques"
      >
        <header>
          <h2>{season.name} · Statistiques</h2>
          <button aria-label="Fermer les statistiques" onClick={onClose}>
            <X />
          </button>
        </header>
        <p>Historique en lecture seule · chiffres agrégés uniquement.</p>
        {!season.stats_snapshot_at && !season.purged_at ? (
          <p>Le snapshot sera disponible à la clôture de la saison.</p>
        ) : (
          <AdminStatistics
            season={season}
            loading={false}
            data={{
              seasonId: season.id,
              snapshot: true,
              stats: season.stats ?? {},
            }}
          />
        )}
      </section>
    </div>
  );
}
function SeasonEditor({
  season,
  zone,
  act,
  onSaved,
  superAdmin,
}: {
  season?: Season;
  zone: string;
  act: Action;
  onSaved: () => void;
  superAdmin: boolean;
}) {
  const [test, setTest] = useState(!!season?.is_test),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const year = season?.year ?? new Date().getFullYear();
  const dates = [
    [
      "registrations_open_at",
      "Ouverture des inscriptions",
      `${year}-10-01T00:00`,
    ],
    ["opens_at", "Ouverture de la carte", `${year}-10-31T12:00`],
    ["closes_at", "Fermeture de la carte", `${year}-11-01T00:00`],
    ["purge_at", "Purge des données personnelles", `${year}-11-02T12:00`],
  ] as const;
  return (
    <form
      className="season-editor"
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
              name: v.name,
              is_test: test,
              year: Number(v.year ?? year),
              registrations_open: v.registrations_open === "on",
            },
            season?.id,
          );
          onSaved();
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="season-editor-grid">
        <Field
          name="name"
          label="Nom de la saison"
          value={season?.name}
          maxLength={100}
        />
        {!season && (
          <label className="field">
            <span>Type</span>
            <select
              aria-label="Type de saison"
              value={test ? "TEST" : "REAL"}
              onChange={(e) => setTest(e.target.value === "TEST")}
            >
              <option value="REAL">Saison normale</option>
              {superAdmin && <option value="TEST">Saison de test</option>}
            </select>
          </label>
        )}
        {!test && (
          <>
            <Field
              name="year"
              label="Année"
              type="number"
              value={year}
              min={2020}
              max={2200}
            />
            {dates.map(([key, label, fallback]) => (
              <Field
                key={key}
                name={key}
                type="datetime-local"
                label={label}
                readOnly={!!season && key === "purge_at" && !superAdmin}
                value={season ? localDate(season[key], zone) : fallback}
              />
            ))}
          </>
        )}
      </div>
      {test ? (
        <p className="small muted">
          Accessible aux administrateurs uniquement lorsqu’elle est active.
          Aucun calendrier public ni purge automatique.
        </p>
      ) : (
        <>
          <Check
            name="registrations_open"
            label="Autoriser les inscriptions"
            checked={season?.registrations_open ?? true}
          />
          <p className="small muted">
            Heures en {zone}. L’activation est manuelle et indépendante de
            l’ouverture de la carte.
          </p>
        </>
      )}
      <Notice error={error} />
      <button className="primary" disabled={busy}>
        {busy ? "Enregistrement…" : "Enregistrer"}
      </button>
    </form>
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
  const [expanded, setExpanded] = useState<string | null>(null),
    [creating, setCreating] = useState(false),
    [statistics, setStatistics] = useState<Season | null>(null);
  const critical = user.role_name === "SUPER_ADMIN",
    manage = has(user, "season.manage");
  const rank = (s: Season) =>
    ({ ACTIVE: 0, PLANIFIÉE: 1, DÉSACTIVÉE: 2, TERMINÉE: 3 })[seasonLabel(s)];
  const ordered = seasons
    .slice()
    .sort(
      (a, b) =>
        rank(a) - rank(b) ||
        +new Date(a.opens_at) - +new Date(b.opens_at) ||
        (a.name ?? "").localeCompare(b.name ?? ""),
    );
  const date = (v: Date | string) =>
    new Intl.DateTimeFormat("fr-FR", {
      dateStyle: "short",
      timeZone: zone,
    }).format(new Date(v));
  return (
    <section className="beta-card season-manager">
      <div className="beta-card-title">
        <div>
          <h2>Les saisons</h2>
          <p className="small muted">
            Une seule saison active, REAL ou TEST. Les comptes restent globaux.
          </p>
        </div>
        {manage && (
          <button className="primary" onClick={() => setCreating(true)}>
            <Plus size={17} /> Nouvelle saison
          </button>
        )}
      </div>
      {!ordered.length ? (
        <p className="beta-empty">
          Aucune saison. Créez votre première saison.
        </p>
      ) : (
        <div className="beta-table-scroll">
          <table className="season-table">
            <thead>
              <tr>
                <th>Saison</th>
                <th>Type</th>
                <th>État</th>
                <th className="season-period">Période</th>
                <th className="season-summary">Synthèse</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {ordered.map((s) => {
                const ended = seasonFinished(s),
                  label = seasonLabel(s);
                return (
                  <Fragment key={s.id}>
                    <tr className={s.active ? "season-active" : ""}>
                      <td>
                        <strong>
                          {s.active && <CircleCheck size={16} />} {s.name}
                        </strong>
                        {!s.is_test && <small>{s.year}</small>}
                      </td>
                      <td>
                        <span className="beta-status">
                          {s.is_test ? "TEST" : "REAL"}
                        </span>
                      </td>
                      <td>
                        <span
                          className={
                            "beta-status " + (s.active ? "public-active" : "")
                          }
                        >
                          {label}
                        </span>
                      </td>
                      <td className="season-period">
                        {s.is_test
                          ? "Sans calendrier public"
                          : `${date(s.opens_at)} → ${date(s.closes_at)}`}
                      </td>
                      <td className="season-summary">
                        {ended && s.stats?.houses !== undefined
                          ? `${s.stats.houses} maisons · ${s.stats.routes ?? 0} parcours`
                          : "—"}
                      </td>
                      <td>
                        <div className="beta-actions season-row-actions">
                          {critical &&
                            !ended &&
                            !s.purged_at &&
                            !s.archived && (
                              <AsyncButton
                                onClick={async () => {
                                  const action = s.active
                                    ? "deactivateSeason"
                                    : "activateSeason";
                                  if (
                                    window.confirm(
                                      s.active
                                        ? `Désactiver ${s.name} ? La carte sera indisponible.`
                                        : `Activer ${s.name} ? La saison actuellement active sera désactivée.${s.is_test ? " La carte sera réservée aux admins." : ""}`,
                                    )
                                  )
                                    await act(
                                      action,
                                      s.active ? "DÉSACTIVER" : "ACTIVER",
                                      s.id,
                                    );
                                }}
                              >
                                {s.active ? "Désactiver" : "Activer"}
                              </AsyncButton>
                            )}
                          {ended && has(user, "stats.read") && (
                            <button onClick={() => setStatistics(s)}>
                              Voir les statistiques
                            </button>
                          )}
                          {critical && !s.active && (
                            <AsyncButton
                              danger
                              onClick={async () => {
                                const confirmation = window.prompt(
                                  `Suppression définitive de « ${s.name} ». Recopiez son nom pour confirmer. Les comptes utilisateurs sont conservés.`,
                                );
                                if (confirmation !== null)
                                  await act("deleteSeason", confirmation, s.id);
                              }}
                            >
                              {ended ? "Supprimer définitivement" : "Supprimer"}
                            </AsyncButton>
                          )}
                          {!ended && !s.purged_at && !s.archived && manage && (
                            <button
                              aria-label={`Réglages de ${s.name}`}
                              aria-expanded={expanded === s.id}
                              onClick={() =>
                                setExpanded(expanded === s.id ? null : s.id)
                              }
                            >
                              {expanded === s.id ? (
                                <ChevronUp size={17} />
                              ) : (
                                <ChevronDown size={17} />
                              )}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {!ended && expanded === s.id && (
                      <tr className="season-settings-row">
                        <td colSpan={6}>
                          <SeasonEditor
                            season={s}
                            zone={zone}
                            act={act}
                            superAdmin={critical}
                            onSaved={() => setExpanded(null)}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {creating && (
        <div className="beta-overlay">
          <section
            className="beta-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Nouvelle saison"
          >
            <header>
              <h2>Nouvelle saison</h2>
              <button
                aria-label="Fermer la création"
                onClick={() => setCreating(false)}
              >
                <X />
              </button>
            </header>
            <SeasonEditor
              zone={zone}
              act={act}
              superAdmin={critical}
              onSaved={() => setCreating(false)}
            />
          </section>
        </div>
      )}
      {statistics && (
        <Statistics season={statistics} onClose={() => setStatistics(null)} />
      )}
    </section>
  );
}
