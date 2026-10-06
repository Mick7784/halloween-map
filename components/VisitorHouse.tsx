"use client";
import { useState, useEffect } from "react";
import {
  X,
  MapPin,
  Clock3,
  Ghost,
  Info,
  Candy,
  Sparkles,
  Drama,
} from "lucide-react";
import { time, labels, type PublicHouse, type RouteResult } from "./common";
import { fearLabel } from "./RouteSheet";
export default function VisitorHouse({
  house,
  stop,
  visited = false,
  onVisit,
  timezone,
  onClose,
}: {
  house: PublicHouse;
  stop?: RouteResult["stops"][number];
  visited?: boolean;
  onVisit?: () => void;
  timezone: string;
  onClose: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const activities = { DECORATION: Sparkles, CANDY: Candy, ACTING: Drama };
  const shorten = (text: string, max: number) =>
    text.length > max ? text.slice(0, max - 1).trimEnd() + "…" : text;
  return (
    <div className="route-overlay visitor-overlay">
      <section
        className="visitor-house route-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="visitor-house-title"
      >
        <div className="visitor-house-hero" aria-hidden="true" />
        <button
          type="button"
          className="close"
          aria-label="Fermer la fiche"
          onClick={onClose}
        >
          <X />
        </button>
        <div className="visitor-house-body">
          <h1 id="visitor-house-title">{house.name}</h1>
          <p className="visitor-address">
            <MapPin size={14} />
            {house.address}
          </p>
          <div className="visitor-activities">
            {house.activities.map((activity) => {
              const Icon = activities[activity];
              return (
                <span
                  key={activity}
                  className={activity === "DECORATION" ? "orange" : ""}
                >
                  <Icon size={20} />
                  {labels[activity]}
                </span>
              );
            })}
          </div>
          <p className="visitor-hours">
            <Clock3 size={17} /> Ouvert de {time(house.starts_at, timezone)} à{" "}
            {time(house.ends_at, timezone)}
          </p>
          <div className="visitor-fear">
            <Ghost size={18} />
            <span>
              {house.adaptable
                ? fearLabel(house)
                : `Niveau de frayeur : ${fearLabel(house)}`}
            </span>
          </div>
          <p className="visitor-description">
            {shorten(house.rp || "Pas de description particulière.", 180)}
          </p>
          <p
            className={
              "visitor-collection-state" + (visited ? " is-visited" : "")
            }
            role="status"
          >
            {visited
              ? "Visitée"
              : stop?.unavailable
                ? "Indisponible"
                : +new Date(house.starts_at) > now
                  ? "Ouvre plus tard"
                  : +new Date(house.ends_at) <= now
                    ? "Fermée"
                    : "Disponible"}
          </p>
          {!visited &&
            onVisit &&
            +new Date(house.starts_at) <= now &&
            +new Date(house.ends_at) > now && (
              <button type="button" onClick={onVisit}>
                Marquer comme visitée
              </button>
            )}
          <div className="visitor-practical">
            <h2>
              <Info size={15} />
              Infos pratiques
            </h2>
            <p>
              {shorten(
                house.practical || "Aucune indication particulière.",
                120,
              )}
            </p>
          </div>
          <button
            type="button"
            className="primary visitor-return"
            onClick={onClose}
          >
            <MapPin size={19} />
            Voir sur la carte
          </button>
        </div>
      </section>
    </div>
  );
}
