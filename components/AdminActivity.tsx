"use client";
import { Timeline } from "./ui";
import { Select, Input, Button } from "./ui";
import { useEffect, useState } from "react";
import { adminDate, type AdminAudit } from "./AdminDashboard";
import { auditLabel } from "../lib/admin-presentation";
import { api, Notice } from "./common";
export default function AdminActivity({
  scope,
  onScope,
  zone,
  seasonId,
  onHouse,
}: {
  audit: AdminAudit[];
  scope: string;
  onScope: (scope: string) => void;
  loading: boolean;
  zone: string;
  seasonId?: string;
  onHouse: (id: string) => void;
}) {
  const [search, setSearch] = useState(""),
    [category, setCategory] = useState("all"),
    [page, setPage] = useState(0),
    [rows, setRows] = useState<AdminAudit[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [from, setFrom] = useState(""),
    [to, setTo] = useState("");
  useEffect(() => {
    let alive = true;
    const timer = setTimeout(() => {
      setLoading(true);
      const query = new URLSearchParams({
        scope,
        q: search,
        category,
        page: String(page),
      });
      if (seasonId) query.set("seasonId", seasonId);
      if (from) query.set("from", new Date(from).toISOString());
      if (to) query.set("to", new Date(to).toISOString());
      void api<AdminAudit[]>("admin/audit?" + query)
        .then((data) => {
          if (alive) {
            setRows(data);
            setError("");
          }
        })
        .catch((e) => {
          if (alive) setError(e.message);
        })
        .finally(() => {
          if (alive) setLoading(false);
        });
    }, 250);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [scope, search, category, page, from, to, seasonId]);
  return (
    <section className="beta-card">
      <h2>Activité</h2>
      <div className="beta-filters">
        <label>
          Périmètre
          <Select
            aria-label="Périmètre de l’activité"
            value={scope}
            onChange={(e) => {
              onScope(e.target.value);
              setPage(0);
            }}
          >
            <option value="season">Saison consultée</option>
            <option value="global">Global</option>
            <option value="all">Tout</option>
          </Select>
        </label>
        <label>
          Catégorie
          <Select
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setPage(0);
            }}
          >
            {[
              ["all", "Tout"],
              ["houses", "Maisons"],
              ["users", "Utilisateurs"],
              ["admin", "Administration"],
              ["security", "Sécurité"],
            ].map(([v, l]) => (
              <option value={v} key={v}>
                {l}
              </option>
            ))}
          </Select>
        </label>
        <Input
          aria-label="Filtrer l’activité"
          placeholder="Action, auteur ou cible…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
        />
        <label>
          Du
          <Input
            type="datetime-local"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(0);
            }}
          />
        </label>
        <label>
          Au
          <Input
            type="datetime-local"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPage(0);
            }}
          />
        </label>
      </div>
      <Notice error={error} />
      {loading ? (
        <p role="status">Chargement de l’activité…</p>
      ) : !rows.length ? (
        <p className="beta-empty">Aucune activité pour ces filtres.</p>
      ) : (
        <Timeline>
          {rows.map((row) => (
            <li key={row.id}>
              <div>
                <strong>{auditLabel(row.action)}</strong>
                {row.target_label &&
                  (row.target_kind === "house" && row.target_id ? (
                    <Button onClick={() => onHouse(row.target_id!)}>
                      {row.target_label}
                    </Button>
                  ) : (
                    <small>{row.target_label}</small>
                  ))}
                <small>
                  {row.actor ?? "Système / compte supprimé"}
                  {row.actor_grade ? " · " + row.actor_grade : ""}
                </small>
              </div>
              <time dateTime={row.created_at}>
                {adminDate(row.created_at, zone)}
              </time>
            </li>
          ))}
        </Timeline>
      )}
      <div className="actions">
        <Button
          disabled={page === 0 || loading}
          onClick={() => setPage((p) => p - 1)}
        >
          Précédent
        </Button>
        <span>Page {page + 1}</span>
        <Button
          disabled={rows.length < 50 || loading}
          onClick={() => setPage((p) => p + 1)}
        >
          Suivant
        </Button>
      </div>
      <p className="small muted">
        Recherche serveur · Journal métier conservé au maximum 90 jours. Les
        événements de saison sont supprimés à la purge.
      </p>
    </section>
  );
}
