import { MetricCard } from "./ui";
import type { Season } from "../lib/domain";
import AttendanceChart from "./AttendanceChart";
import {
  unavailableMetric as unavailable,
  measured,
  formatCount,
  formatDistance,
  formatDuration,
  formatPercent,
  average,
  metricLabels,
} from "../lib/admin-metrics";

export type SeasonStatistics = {
  attendance?: import("../lib/attendance").Attendance;
  seasonId: string;
  snapshot: boolean;
  stats: Record<string, number | null | undefined>;
};
function Bars({
  title,
  items,
  chart = true,
}: {
  title: string;
  items: [string, number | null | undefined][];
  chart?: boolean;
}) {
  const available = items.filter(([, value]) => measured(value));
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
              <strong>{formatCount(value)}</strong>
              {chart && measured(value) && (
                <div className="stats-track" aria-hidden="true">
                  <div style={{ width: `${(value / max) * 100}%` }} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {chart && available.length > 0 && (
        <p className="small muted">Échelle relative : 0 à {max} maisons.</p>
      )}
    </section>
  );
}
export default function AdminStatistics({
  data,
  season,
  loading,
  zone = "Europe/Paris",
}: {
  data: SeasonStatistics | null;
  season?: Season;
  loading: boolean;
  zone?: string;
}) {
  if (loading) return <p role="status">Chargement des statistiques…</p>;
  if (!season || !data)
    return (
      <section className="beta-card">
        <p>{!season ? "Aucune saison à consulter." : unavailable}</p>
      </section>
    );
  const s = data.stats,
    finished = s.collections_finished,
    started = s.collections_started;
  const metrics: [string, string | number | null | undefined][] = [
    [metricLabels.houses, s.houses],
    [metricLabels.approved, s.approved],
    [metricLabels.pending, s.pending],
    ["Maisons refusées", s.refused],
    [metricLabels.participants, s.participants],
    [metricLabels.visited, s.visited],
  ];
  const performance: [string, string][] = [
    ["Taux de collectes terminées", formatPercent(average(finished, started))],
    ["Complétion moyenne", formatPercent(average(s.completion_sum, finished))],
    [metricLabels.distance, formatDistance(s.distance_meters)],
    [
      "Distance moyenne par collecte terminée",
      formatDistance(average(s.distance_meters, finished)),
    ],
    [
      "Durée moyenne par collecte terminée",
      formatDuration(average(s.duration_seconds, finished)),
    ],
  ];
  const cards = (items: typeof metrics) => (
    <div className="stats-kpis">
      {items.map(([label, value]) => (
        <MetricCard
          key={label}
          className="beta-card"
          label={label}
          value={
            value == null
              ? unavailable
              : typeof value === "number"
                ? formatCount(value)
                : value
          }
        />
      ))}
    </div>
  );
  return (
    <div className="stats-page">
      <AttendanceChart data={data.attendance} zone={zone} />
      <p className="muted">
        {data.snapshot
          ? "Historique en lecture seule · snapshot anonyme conservé."
          : "Agrégats de la saison consultée."}{" "}
        Les participants uniques sont les utilisateurs ayant proposé une maison.
      </p>
      <h2>Vue d’ensemble</h2>
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
          chart={false}
          items={[
            [metricLabels.routes, s.routes],
            [metricLabels.started, started],
            [metricLabels.finished, finished],
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
      <p className="small muted">
        Taux de fin : {formatCount(finished)} collectes terminées /{" "}
        {formatCount(started)} lancées. Complétion moyenne : moyenne des parts
        de maisons déclarées visitées dans les collectes terminées.
      </p>
      <p className="muted small">
        Visites, distances et durées : totaux déclarés par les appareils lors de
        la fin de collecte, sans trace GPS individuelle. Les anciennes collectes
        ne sont pas reconstruites. La fréquentation utilise uniquement les
        relevés agrégés réellement mesurés.
      </p>
    </div>
  );
}
