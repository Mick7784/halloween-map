"use client";
import { useState } from "react";
import { Button, MetricCard } from "./ui";
import AttendanceChart from "./AttendanceChart";
import type { SeasonStatistics } from "./AdminStatistics";
import {
  unavailableMetric,
  formatCount,
  formatDistance,
  formatDuration,
  formatPercent,
  average,
  metricLabels,
} from "../lib/admin-metrics";

const tabs = [
  ["overview", "Vue d’ensemble"],
  ["houses", "Maisons"],
  ["collections", "Collectes"],
  ["attendance", "Fréquentation"],
] as const;
type Tab = (typeof tabs)[number][0];

export default function AdminMobileStats({
  data,
  loading,
  zone,
  seasonName,
  embedded = false,
}: {
  data: SeasonStatistics | null;
  loading: boolean;
  zone: string;
  seasonName: string;
  embedded?: boolean;
}) {
  const [tab, setTab] = useState<Tab>("overview");
  const stats = data?.stats;
  const count = (key: string) =>
    stats?.[key] == null ? unavailableMetric : formatCount(stats[key]);
  const card = (label: string, value: string) => (
    <MetricCard key={label} label={label} value={value} className="beta-card" />
  );
  return (
    <section className="admin-mobile-statistics">
      {embedded ? (
        <p className="small muted">{seasonName} · Consultation uniquement</p>
      ) : (
        <header className="admin-mobile-heading">
          <div>
            <p className="small muted">Halloween Map · Administration</p>
            <h1>Statistiques</h1>
            <p className="small muted">{seasonName} · Consultation uniquement</p>
          </div>
        </header>
      )}
      {loading ? (
        <p role="status">Chargement des statistiques…</p>
      ) : !data || !stats ? (
        <p role="status" className="beta-card">
          {unavailableMetric} pour cette saison.
        </p>
      ) : (
        <>
          <nav className="admin-mobile-tabs" aria-label="Rubriques des statistiques">
            {tabs.map(([id, label]) => (
              <Button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                className={tab === id ? "is-current" : ""}
                onClick={() => setTab(id)}
              >
                {label}
              </Button>
            ))}
          </nav>
          <div role="tabpanel" aria-label={tabs.find(([id]) => id === tab)?.[1]}>
            {tab === "overview" && (
              <>
                <div className="stats-kpis">
                  {card(metricLabels.houses, count("houses"))}
                  {card(metricLabels.approved, count("approved"))}
                  {card(metricLabels.pending, count("pending"))}
                  {card(metricLabels.participants, count("participants"))}
                </div>
                <p className="small muted">
                  Données de la saison consultée, sans information nominative.
                </p>
              </>
            )}
            {tab === "houses" && (
              <>
                <div className="stats-kpis">
                  {card(metricLabels.approved, count("approved"))}
                  {card(metricLabels.pending, count("pending"))}
                  {card("Refusées", count("refused"))}
                  {card("Bonbons", count("candy"))}
                  {card("Décoration", count("decoration"))}
                  {card("Mise en scène", count("acting"))}
                </div>
                <p className="small muted">
                  Une maison peut proposer plusieurs activités.
                </p>
              </>
            )}
            {tab === "collections" && (
              <>
                <div className="stats-kpis">
                  {card(metricLabels.routes, count("routes"))}
                  {card(metricLabels.started, count("collections_started"))}
                  {card(metricLabels.finished, count("collections_finished"))}
                  {card(metricLabels.visited, count("visited"))}
                  {card(
                    "Taux de collectes terminées",
                    formatPercent(average(stats.collections_finished, stats.collections_started)),
                  )}
                  {card(
                    "Complétion moyenne",
                    formatPercent(average(stats.completion_sum, stats.collections_finished)),
                  )}
                  {card(metricLabels.distance, formatDistance(stats.distance_meters))}
                  {card(
                    "Durée moyenne",
                    formatDuration(average(stats.duration_seconds, stats.collections_finished)),
                  )}
                </div>
                <p className="small muted">
                  Visites, durées et distances déclarées par les appareils,
                  sans trajet GPS enregistré.
                </p>
              </>
            )}
            {tab === "attendance" && (
              <>
                <AttendanceChart data={data.attendance} zone={zone} />
                <p className="small muted">
                  Fréquentation agrégée, selon les relevés disponibles.
                </p>
              </>
            )}
          </div>
          {data.snapshot && (
            <p className="small muted">
              Archives anonymisées : données historiques en lecture seule.
            </p>
          )}
        </>
      )}
    </section>
  );
}
