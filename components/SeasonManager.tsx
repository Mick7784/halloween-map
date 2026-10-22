"use client";
import { ActionCancelled } from "./AdminConfirmation";
import { Dialog, Button, DataTable, Input, Select } from "./ui";
import StudioCollectionControls from "./StudioCollectionControls";
import StudioRowActions from "./StudioRowActions";
import { selectStudioCollection } from "../lib/studio-collection";
import useDraftGuard, { confirmDraftNavigation } from "./useDraftGuard";
import AdminStatistics, { type SeasonStatistics } from "./AdminStatistics";
import { DateTime } from "luxon";
import { Fragment, useEffect, useState } from "react";
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
  api,
} from "./common";

type Action = (action: string, payload: unknown, id?: string) => Promise<void>;
function Statistics({
  season,
  onClose,
}: {
  season: Season;
  onClose: () => void;
}) {
  const frozen = !!(season.purged_at || season.archived);
  const [data, setData] = useState<SeasonStatistics | null>(() => frozen ? {
    seasonId: season.id, snapshot: true, stats: season.stats ?? {},
  } : null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (frozen) return;
    let current = true;
    void api<SeasonStatistics>("admin/statistics?seasonId=" + season.id)
      .then((result) => { if (current) setData(result); })
      .catch((e) => { if (current) setError(e.message); });
    return () => { current = false; };
  }, [season.id, frozen]);
  return (
    <div className="beta-overlay">
      <Dialog
        className="beta-panel"
        role="dialog"
        onClick={(event) => event.stopPropagation()}
        aria-modal="true"
        aria-label="Statistiques historiques"
      >
        <header>
          <h2>{season.name} · Statistiques</h2>
          <Button
            className="close"
            aria-label="Fermer les statistiques"
            onClick={onClose}
          >
            <X />
          </Button>
        </header>
        <p>Historique en lecture seule · chiffres agrégés uniquement.</p>
        {error && <Notice error={error} />}
        {!season.stats_snapshot_at && !season.purged_at ? (
          <p>Le snapshot sera disponible à la clôture de la saison.</p>
        ) : (
          <AdminStatistics
            season={season}
            loading={!data && !error}
            data={data}
          />
        )}
      </Dialog>
    </div>
  );
}
function SeasonEditor({
  season,
  zone,
  act,
  onSaved,
  superAdmin,
  defaults,
}: {
  season?: Season;
  zone: string;
  act: Action;
  onSaved: () => void;
  superAdmin: boolean;
  defaults?: { open: string; close: string };
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [dirty, setDirty] = useState(false),
    [year, setYear] = useState(() => season?.year ?? new Date().getFullYear());
  useDraftGuard(dirty);
  const opening = DateTime.fromISO(
      `${year}-${defaults?.open ?? "10-31T12:00"}`,
      { zone },
    ),
    closing = DateTime.fromISO(`${year}-${defaults?.close ?? "11-01T00:00"}`, {
      zone,
    });
  const closeDate = closing <= opening ? closing.plus({ years: 1 }) : closing;
  const dates = [
    [
      "registrations_open_at",
      "Ouverture des inscriptions",
      opening.minus({ days: 30 }).toFormat("yyyy-MM-dd'T'HH:mm"),
    ],
    [
      "opens_at",
      "Ouverture de la carte",
      opening.toFormat("yyyy-MM-dd'T'HH:mm"),
    ],
    [
      "closes_at",
      "Fermeture de la carte",
      closeDate.toFormat("yyyy-MM-dd'T'HH:mm"),
    ],
    [
      "purge_at",
      "Purge des données personnelles",
      closeDate.plus({ days: 2 }).toFormat("yyyy-MM-dd'T'HH:mm"),
    ],
  ] as const;
  return (
    <form
      className="season-editor"
      onChange={() => setDirty(true)}
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
              is_test: false,
              year: Number(v.year ?? year),
              registrations_open: v.registrations_open === "on",
            },
            season?.id,
          );
          onSaved();
        } catch (e) {
          if (!(e instanceof ActionCancelled)) setError((e as Error).message);
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
        <>
            <label className="field">
              <span>Année</span>
              <Input
                name="year"
                type="number"
                value={year}
                min={2020}
                max={2200}
                onChange={(e) => setYear(Number(e.target.value))}
              />
            </label>
            {dates.map(([key, label, fallback]) => (
              <Field
                key={key + ":" + (season?.id ?? year)}
                name={key}
                type="datetime-local"
                label={label}
                readOnly={!!season && key === "purge_at" && !superAdmin}
                value={season ? localDate(season[key], zone) : fallback}
              />
            ))}
          </>
      </div>
      <Check
            name="registrations_open"
            label="Autoriser les inscriptions"
            checked={season?.registrations_open ?? true}
          />
          <p className="small muted">
            Heures en {zone}. L’activation est manuelle et indépendante de
            l’ouverture de la carte.
          </p>
      <Notice error={error} />
      <Button className="primary" disabled={busy}>
        {busy ? "Enregistrement…" : "Enregistrer"}
      </Button>
    </form>
  );
}
export default function SeasonManager({
  seasons,
  user,
  zone,
  act,
  defaults,
}: {
  seasons: Season[];
  user: User;
  zone: string;
  act: Action;
  defaults?: { open: string; close: string };
}) {
  const [expanded, setExpanded] = useState<string | null>(null),
    [creating, setCreating] = useState(false),
    [statistics, setStatistics] = useState<Season | null>(null),
    [query, setQuery] = useState(""),
    [status, setStatus] = useState("ALL");
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
  // A shared, stable collection selector owns text filtering; the existing
  // season ordering and business states continue to belong to Halloween Map.
  const visible = selectStudioCollection(
    ordered.filter((s) => status === "ALL" || seasonLabel(s) === status),
    {
      query,
      searchText: (s) => [s.name ?? "", String(s.year)],
      pageSize: Math.max(1, ordered.length),
    },
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
            Créez et préparez une saison avant son activation. Les comptes restent globaux.
          </p>
        </div>
        {manage && (
          <Button className="primary" onClick={() => setCreating(true)}>
            <Plus size={17} /> Nouvelle saison
          </Button>
        )}
      </div>
      {ordered.length > 0 && (
        <StudioCollectionControls
          label="Filtres des saisons"
          count={visible.total}
          filtered={Boolean(query.trim()) || status !== "ALL"}
          onReset={() => {
            setQuery("");
            setStatus("ALL");
          }}
        >
          <div className="beta-filters season-filters">
            <Input
              aria-label="Rechercher une saison"
              placeholder="Nom ou année de saison…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <Select
              aria-label="Filtrer l’état des saisons"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              <option value="ALL">Tous les états</option>
              <option value="ACTIVE">Active</option>
              <option value="PLANIFIÉE">Planifiée</option>
              <option value="DÉSACTIVÉE">Désactivée</option>
              <option value="TERMINÉE">Terminée</option>
            </Select>
          </div>
        </StudioCollectionControls>
      )}
      {!ordered.length ? (
        <p className="beta-empty">
          Aucune saison. Créez votre première saison.
        </p>
      ) : !visible.total ? (
        <p className="beta-empty">Aucune saison ne correspond aux filtres.</p>
      ) : (
        <div className="beta-table-scroll">
          <DataTable className="season-table">
            <thead>
              <tr>
                <th>Saison</th>
                <th>État</th>
                <th className="season-period">Période</th>
                <th className="season-summary">Synthèse</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.rows.map((s) => {
                const ended = seasonFinished(s),
                  label = seasonLabel(s);
                return (
                  <Fragment key={s.id}>
                    <tr className={s.active ? "season-active" : ""}>
                      <td>
                        <strong>
                          {s.active && <CircleCheck size={16} />} {s.name}
                        </strong>
                        <small>{s.year}</small>
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
                        {`${date(s.opens_at)} → ${date(s.closes_at)}`}
                      </td>
                      <td className="season-summary">
                        {ended && s.stats?.houses !== undefined
                          ? `${s.stats.houses} maisons · ${s.stats.routes ?? 0} parcours`
                          : "—"}
                      </td>
                      <td>
                        <StudioRowActions
                          label={`Actions de ${s.name}`}
                          className="beta-actions season-row-actions"
                          actions={
                            <>

                          {critical &&
                            !s.purged_at && !s.archived && (
                              <AsyncButton
                                onClick={async () => {
                                  const action = s.active
                                    ? "deactivateSeason"
                                    : "activateSeason";
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
                            <Button onClick={() => setStatistics(s)}>
                              Voir les statistiques
                            </Button>
                          )}

                          {!ended && !s.purged_at && !s.archived && manage && (
                            <Button
                              aria-label={`Réglages de ${s.name}`}
                              aria-expanded={expanded === s.id}
                              onClick={() =>
                                setExpanded(expanded === s.id ? null : s.id)
                              }
                            >
                              {expanded === s.id ? (
                                <ChevronUp size={17} aria-hidden="true" />
                              ) : (
                                <ChevronDown size={17} aria-hidden="true" />
                              )}
                              <span>Réglages</span>
                            </Button>
                          )}

                            </>
                          }
                          sensitive={
                            critical && !s.active ? (
                              <>
                          {critical &&
                            ended &&
                            !s.active &&
                            !s.purged_at && (
                              <AsyncButton
                                danger
                                onClick={async () => {
                                  await act("purge", "PURGER", s.id);
                                }}
                              >
                                Purger les données
                              </AsyncButton>
                            )}
                          {critical && !s.active && (
                            <AsyncButton
                              danger
                              onClick={async () => {
                                await act("deleteSeason", s.name, s.id);
                              }}
                            >
                              {ended ? "Supprimer définitivement" : "Supprimer"}
                            </AsyncButton>
                          )}

                              </>
                            ) : undefined
                          }
                        />
                      </td>
                    </tr>
                    {!ended && expanded === s.id && (
                      <tr className="season-settings-row">
                        <td colSpan={5}>
                          <SeasonEditor
                            season={s}
                            zone={zone}
                            act={act}
                            superAdmin={critical}
                            defaults={defaults}
                            onSaved={() => setExpanded(null)}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </DataTable>
        </div>
      )}
      {creating && (
        <div className="beta-overlay">
          <Dialog
            className="beta-panel"
            role="dialog"
            onClick={(event) => event.stopPropagation()}
            aria-modal="true"
            aria-label="Nouvelle saison"
          >
            <header>
              <h2>Nouvelle saison</h2>
              <Button
                className="close"
                aria-label="Fermer la création"
                onClick={() => {
                  if (confirmDraftNavigation()) setCreating(false);
                }}
              >
                <X />
              </Button>
            </header>
            <SeasonEditor
              zone={zone}
              act={act}
              superAdmin={critical}
              defaults={defaults}
              onSaved={() => setCreating(false)}
            />
          </Dialog>
        </div>
      )}
      {statistics && (
        <Statistics season={statistics} onClose={() => setStatistics(null)} />
      )}
    </section>
  );
}
