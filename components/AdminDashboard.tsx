import {
  House,
  Clock,
  Route,
  Users,
  ArrowUpRight,
  Activity,
} from "lucide-react";
import type { House as HouseData } from "../lib/domain";
import { auditLabel } from "../lib/admin-presentation";
export type AdminMetrics = {
  approved: number;
  pending: number;
  routes: number;
  users: number;
  collectionStats?: Record<string, number>;
};
export type AdminAudit = {
  id: string;
  action: string;
  actor: string | null;
  created_at: string;
  target_label?: string | null;
};
export function adminDate(value: string, zone: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: zone,
  }).format(new Date(value));
}
export default function AdminDashboard({
  metrics,
  pending,
  audit,
  loading,
  zone,
  onHouse,
}: {
  metrics: AdminMetrics | null;
  pending: (HouseData & { owner_name: string })[];
  audit: AdminAudit[];
  loading: boolean;
  zone: string;
  onHouse: (id: string) => void;
}) {
  if (loading)
    return (
      <div
        className="beta-skeleton"
        role="status"
        aria-label="Chargement de la saison"
      >
        <div />
        <div />
        <div />
        <div />
        <span>Chargement des données de la saison…</span>
      </div>
    );
  return (
    <>
      {metrics && (
        <div className="beta-kpis">
          {(
            [
              ["Maisons validées", metrics.approved, House],
              ["En attente", metrics.pending, Clock],
              ["Parcours créés", metrics.routes, Route],
              ["Utilisateurs", metrics.users, Users],
            ] as const
          ).map(([label, value, Icon]) => (
            <article key={label}>
              <div>
                <span>{label}</span>
                <Icon size={19} />
              </div>
              <strong>{value}</strong>
            </article>
          ))}
        </div>
      )}
      {metrics?.collectionStats?.collections_started !== undefined && (
        <section className="beta-card">
          <div className="beta-card-title">
            <h2>Collectes de la saison active</h2>
          </div>
          <div className="season-statistics">
            {(
              [
                ["Lancées", metrics.collectionStats.collections_started],
                [
                  "Terminées",
                  metrics.collectionStats.collections_finished ?? 0,
                ],
                ["Maisons visitées", metrics.collectionStats.visited ?? 0],
                [
                  "Distance cumulée",
                  `${((metrics.collectionStats.distance_meters ?? 0) / 1000).toFixed(2)} km`,
                ],
              ] as const
            ).map(([label, value]) => (
              <article key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </article>
            ))}
          </div>
          <p className="small muted">
            Totaux transmis par les appareils, sans trace GPS ni liste des
            visites.
          </p>
        </section>
      )}
      <div className="beta-dashboard-grid">
        <section className="beta-card beta-pending">
          <div className="beta-card-title">
            <h2>Maisons en attente</h2>
            <span className="beta-badge">{pending.length}</span>
          </div>
          {!pending.length ? (
            <p className="beta-empty">
              Aucune maison en attente dans cette saison.
            </p>
          ) : (
            <ul className="beta-pending-list">
              {pending.slice(0, 8).map((h) => (
                <li key={h.id}>
                  <div>
                    <strong>{h.name}</strong>
                    <small>
                      {h.owner_name} · {h.address_parts?.city || h.address}
                    </small>
                    <time>
                      {h.submitted_at
                        ? adminDate(h.submitted_at, zone)
                        : "Date non renseignée"}
                    </time>
                  </div>
                  <span className="beta-status pending">En attente</span>
                  <button
                    aria-label={"Consulter " + h.name}
                    onClick={() => onHouse(h.id)}
                  >
                    <ArrowUpRight size={18} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {pending.length > 8 && (
            <p className="small">
              Les huit dernières demandes sont affichées. Retrouvez toutes les
              demandes dans Maisons.
            </p>
          )}
        </section>
        <section className="beta-card">
          <div className="beta-card-title">
            <h2>Activité récente</h2>
            <Activity size={18} />
          </div>
          {!audit.length ? (
            <p className="beta-empty">
              Aucune activité enregistrée pour cette saison.
            </p>
          ) : (
            <ul className="beta-activity-list">
              {audit.slice(0, 8).map((a) => (
                <li key={a.id}>
                  <span className="beta-activity-dot" />
                  <div>
                    <strong>{auditLabel(a.action)}</strong>
                    {a.target_label && <small>{a.target_label}</small>}
                    <small>{a.actor ?? "Système"}</small>
                  </div>
                  <time dateTime={a.created_at}>
                    {adminDate(a.created_at, zone)}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
