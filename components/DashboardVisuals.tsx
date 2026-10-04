"use client";
import { useEffect, useState } from "react";
import type { User } from "../lib/domain";
import { api, type PublicHouse } from "./common";
import MapView from "./Map";
export default function DashboardVisuals({
  user,
  center,
  zoom,
  mapStyle,
}: {
  user: User;
  center: [number, number];
  zoom: number;
  mapStyle: string;
}) {
  const [houses, setHouses] = useState<PublicHouse[]>([]),
    [error, setError] = useState("");
  useEffect(() => {
    if (user.permissions.includes("participants.read"))
      void api<PublicHouse[]>("admin/houses")
        .then(setHouses)
        .catch((e) => setError(e.message));
  }, [user.permissions]);
  if (!user.permissions.includes("participants.read")) return null;
  const bars = [
    [
      "Décoration",
      houses.filter((h) => h.activities.includes("DECORATION")).length,
    ],
    ["Bonbons", houses.filter((h) => h.activities.includes("CANDY")).length],
    [
      "Mise en scène",
      houses.filter((h) => h.activities.includes("ACTING")).length,
    ],
  ] as const;
  return (
    <div className="dashboard-visuals grid two">
      <section className="panel dashboard-map">
        <div className="section-heading">
          <h2>Les maisons de la commune</h2>
          <span className="badge">{houses.length} inscriptions</span>
        </div>
        {error ? (
          <p role="alert">{error}</p>
        ) : (
          <MapView
            houses={houses}
            center={center}
            zoom={zoom}
            styleUrl={mapStyle}
          />
        )}
        <p className="muted small">
          Vue privée de l’équipe · toutes les inscriptions
        </p>
      </section>
      <section className="panel">
        <h2>Une nuit à partager</h2>
        <p className="muted small">
          Activités proposées par les maisons inscrites
        </p>
        <div className="activity-chart">
          {bars.map(([label, count], n) => (
            <div key={label}>
              <div>
                <span>{label}</span>
                <strong>{count}</strong>
              </div>
              <div className="chart-track">
                <span
                  style={{
                    width: `${houses.length ? (count / houses.length) * 100 : 0}%`,
                  }}
                  className={n === 1 ? "violet" : ""}
                />
              </div>
            </div>
          ))}
        </div>
        <div className="moderation-summary">
          <strong>
            {
              houses.filter(
                (h) =>
                  (h as PublicHouse & { status: string }).status === "APPROVED",
              ).length
            }
          </strong>
          <span>
            maisons validées
            <br />
            prêtes à accueillir les visiteurs
          </span>
        </div>
      </section>
    </div>
  );
}
