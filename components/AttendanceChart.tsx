"use client";
import { useState } from "react";
import type { Attendance } from "../lib/attendance";
import { adminDate } from "./AdminDashboard";
export default function AttendanceChart({
  data,
  zone,
  compact = false,
}: {
  data?: Attendance;
  zone: string;
  compact?: boolean;
}) {
  const [day, setDay] = useState("");
  if (!data) return null;
  const localDay = (at: string) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(at));
  const days = [...new Set(data.points.map((p) => localDay(p.at)))];
  const chosen = day || days.at(-1);
  const newest = data.points.at(-1) ? +new Date(data.points.at(-1)!.at) : 0;
  const points = compact
    ? data.points.filter((p) => +new Date(p.at) > newest - 6 * 3600000)
    : data.points.filter((p) => localDay(p.at) === chosen);
  const maximum = Math.max(1, ...points.map((p) => p.average));
  const start = points[0] ? +new Date(points[0].at) : 0,
    end = points.at(-1)
      ? +new Date(points.at(-1)!.at) + 1800000
      : start + 1800000;
  const columns = Array.from(
    { length: Math.max(1, Math.round((end - start) / 1800000)) },
    (_, n) => {
      const at = start + n * 1800000;
      return { at, point: points.find((p) => +new Date(p.at) === at) };
    },
  );
  return (
    <section className="beta-card attendance-card">
      <div className="beta-card-title">
        <h2>Fréquentation des membres</h2>
        {!compact && days.length > 1 && (
          <label>
            Jour
            <select value={chosen} onChange={(e) => setDay(e.target.value)}>
              {days.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
          </label>
        )}
      </div>
      <div className="attendance-metrics">
        <p>
          <span>Actifs maintenant</span>
          <strong>{data.activeNow}</strong>
        </p>
        <p>
          <span>Pic simultané mesuré</span>
          <strong>{data.peak?.active_count ?? "—"}</strong>
          {data.peak && <small>{adminDate(data.peak.sampled_at, zone)}</small>}
        </p>
      </div>
      {!points.length ? (
        <p className="muted">Aucun relevé disponible pour cette période.</p>
      ) : (
        <>
          <div
            className="attendance-bars"
            role="img"
            aria-label="Actifs moyens par tranche de 30 minutes, données absentes signalées par des tirets"
          >
            {columns.map(({ at, point }) => (
              <div
                key={at}
                title={
                  adminDate(new Date(at).toISOString(), zone) +
                  ": " +
                  (point
                    ? `${point.average} actifs moyens (${point.samples}/2 relevés)`
                    : "Donnée absente")
                }
              >
                <span
                  style={{
                    height: point
                      ? `${Math.max(2, (point.average / maximum) * 100)}%`
                      : "0",
                  }}
                  className={point?.samples === 1 ? "partial" : ""}
                />
                {!point && <small>—</small>}
              </div>
            ))}
          </div>
          <div className="attendance-axis">
            <span>{adminDate(points[0].at, zone)}</span>
            <span>{adminDate(points.at(-1)!.at, zone)}</span>
          </div>
          <details>
            <summary>Données du graphique</summary>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Tranche</th>
                    <th>Actifs moyens</th>
                    <th>Relevés</th>
                  </tr>
                </thead>
                <tbody>
                  {columns.map(({ at, point }) => (
                    <tr key={at}>
                      <td>{adminDate(new Date(at).toISOString(), zone)}</td>
                      <td>{point?.average ?? "Donnée non disponible"}</td>
                      <td>{point ? `${point.samples}/2` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
      <p className="small muted">
        Comptes distincts authentifiés, utilisés au premier plan dans les trois
        dernières minutes. Relevés toutes les 15 minutes ; graphique des actifs
        moyens par 30 minutes. Les points partiels utilisent un seul relevé. Le
        pic conserve le maximum d’un relevé et son heure réelle.
      </p>
    </section>
  );
}
