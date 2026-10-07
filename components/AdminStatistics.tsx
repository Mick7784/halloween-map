import type { Season } from "../lib/domain";

export type SeasonStatistics = {
  seasonId: string;
  snapshot: boolean;
  stats: Record<string, number>;
};
const unavailable = "Donnée non disponible";
const number = (value: number) =>
  new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(value);
function Bars({
  title,
  items,
}: {
  title: string;
  items: [string, number | undefined][];
}) {
  const available = items.filter(([, value]) => value !== undefined);
  const max = Math.max(1, ...available.map(([, value]) => value!));
  return (
    <section className="beta-card stats-chart" aria-label={title}>
      <h2>{title}</h2>
      {!available.length ? (
        <p className="muted">{unavailable}</p>
      ) : (
        <ul>
          {items.map(([label, value]) => (
            <li key={label}>
              <span>{label}</span>
              <strong>
                {value === undefined ? unavailable : number(value)}
              </strong>
              {value !== undefined && (
                <div className="stats-track" aria-hidden="true">
                  <div style={{ width: `${(value / max) * 100}%` }} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
export default function AdminStatistics({
  data,
  season,
  loading,
}: {
  data: SeasonStatistics | null;
  season?: Season;
  loading: boolean;
}) {
  if (loading) return <p role="status">Chargement des statistiques…</p>;
  if (!season || !data)
    return (
      <section className="beta-card">
        <p>Aucune saison à consulter.</p>
      </section>
    );
  const s = data.stats,
    finished = s.collections_finished,
    started = s.collections_started;
  const metrics: [string, string | number | undefined][] = [
    ["Maisons inscrites", s.houses],
    ["Maisons validées", s.approved],
    ["Maisons en attente", s.pending],
    ["Maisons refusées", s.refused],
    ["Participants uniques", s.participants],
    ["Maisons visitées", s.visited],
  ];
  const performance: [string, string | undefined][] = [
    [
      "Taux de collectes terminées",
      started !== undefined && started > 0 && finished !== undefined
        ? `${number((finished / started) * 100)} %`
        : undefined,
    ],
    [
      "Complétion moyenne",
      finished !== undefined && finished > 0 && s.completion_sum !== undefined
        ? `${number((s.completion_sum / finished) * 100)} %`
        : undefined,
    ],
    [
      "Distance totale déclarée",
      s.distance_meters !== undefined
        ? `${number(s.distance_meters / 1000)} km`
        : undefined,
    ],
    [
      "Distance moyenne par collecte terminée",
      finished !== undefined && finished > 0 && s.distance_meters !== undefined
        ? `${number(s.distance_meters / finished / 1000)} km`
        : undefined,
    ],
    [
      "Durée moyenne par collecte terminée",
      finished !== undefined && finished > 0 && s.duration_seconds !== undefined
        ? `${number(s.duration_seconds / finished / 60)} min`
        : undefined,
    ],
  ];
  const cards = (items: typeof metrics) => (
    <div className="stats-kpis">
      {items.map(([label, value]) => (
        <article className="beta-card" key={label}>
          <span>{label}</span>
          <strong>
            {value === undefined
              ? unavailable
              : typeof value === "number"
                ? number(value)
                : value}
          </strong>
        </article>
      ))}
    </div>
  );
  return (
    <div className="stats-page">
      <p className="muted">
        {data.snapshot
          ? "Historique en lecture seule · snapshot anonyme conservé."
          : "Agrégats de la saison consultée."}{" "}
        Les participants uniques sont les utilisateurs ayant proposé une maison.
      </p>
      {cards(metrics)}
      <div className="stats-charts">
        <Bars
          title="Activités des maisons"
          items={[
            ["Bonbons", s.candy],
            ["Décoration", s.decoration],
            ["Mise en scène", s.acting],
          ]}
        />
        <Bars
          title="État des maisons"
          items={[
            ["Validées", s.approved],
            ["En attente", s.pending],
            ["Refusées", s.refused],
          ]}
        />
        <Bars
          title="Parcours et collectes"
          items={[
            ["Parcours préparés", s.routes],
            ["Collectes lancées", started],
            ["Collectes terminées", finished],
          ]}
        />
      </div>
      <p className="muted small">
        Une maison peut proposer plusieurs activités. Les parcours préparés et
        les collectes sont des compteurs distincts, pas une conversion
        individuelle.
      </p>
      <h2>Performance des collectes</h2>
      {cards(performance)}
      <p className="muted small">
        Visites, distances et durées : totaux déclarés par les appareils lors de
        la fin de collecte, sans trace GPS individuelle. Les anciennes collectes
        ne sont pas reconstruites. Aucune série temporelle n’est collectée.
      </p>
    </div>
  );
}
