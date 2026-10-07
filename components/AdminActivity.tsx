"use client";
import { useState } from "react";
import { adminDate, type AdminAudit } from "./AdminDashboard";
import { auditLabel } from "../lib/admin-presentation";
export default function AdminActivity({
  audit,
  scope,
  onScope,
  loading,
  zone,
}: {
  audit: AdminAudit[];
  scope: string;
  onScope: (scope: string) => void;
  loading: boolean;
  zone: string;
}) {
  const [search, setSearch] = useState("");
  const rows = audit.filter((row) =>
    [auditLabel(row.action), row.action, row.actor, row.target_label]
      .join(" ")
      .toLocaleLowerCase()
      .includes(search.toLocaleLowerCase()),
  );
  return (
    <section className="beta-card">
      <h2>Activité</h2>
      <div className="beta-filters">
        <label>
          Périmètre{" "}
          <select
            aria-label="Périmètre de l’activité"
            value={scope}
            onChange={(e) => onScope(e.target.value)}
          >
            <option value="season">Saison consultée</option>
            <option value="global">Global</option>
            <option value="all">Tout</option>
          </select>
        </label>
        <input
          aria-label="Filtrer l’activité"
          placeholder="Action, auteur ou cible…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <p className="small muted">
        Les 200 événements les plus récents du périmètre choisi.
      </p>
      {loading ? (
        <p role="status">Chargement de l’activité…</p>
      ) : !rows.length ? (
        <p className="beta-empty">Aucune activité pour ces filtres.</p>
      ) : (
        <ul className="beta-activity-list">
          {rows.map((row) => (
            <li key={row.id}>
              <div>
                <strong>{auditLabel(row.action)}</strong>
                {row.target_label && <small>{row.target_label}</small>}
                <small>{row.actor ?? "Système"}</small>
              </div>
              <time dateTime={row.created_at}>
                {adminDate(row.created_at, zone)}
              </time>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
