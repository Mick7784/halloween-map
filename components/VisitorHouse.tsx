"use client";
import { useState, useEffect } from "react";
import {
  X,
  MapPin,
  Clock3,
  Ghost,
  Info,
  Candy,
  Check,
  CircleAlert,
} from "lucide-react";
import { time, type PublicHouse, type RouteResult } from "./common";
import { FearGauge, houseActivityOptions } from "./HouseFields";
import "./VisitorHouse.css";
export default function VisitorHouse({
  house,
  stop,
  visited = false,
  onVisit,
  timezone,
  onClose,
  fearLabels,
  onSelection,
  selected,
  selectionDisabled,
  selectionError,
}: {
  house: PublicHouse;
  stop?: RouteResult["stops"][number];
  visited?: boolean;
  onVisit?: () => void;
  timezone: string;
  onClose: () => void;
  fearLabels?: string[];
  onSelection?: () => void;
  selected?: boolean;
  selectionDisabled?: boolean;
  selectionError?: string;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  // New metadata separates offered activities from stock; old routes remain readable.
  const offered = house.offeredActivities ?? house.activities;
  const available =
    !stop?.unavailable &&
    +new Date(house.starts_at) <= now &&
    +new Date(house.ends_at) > now;
  const status = visited
    ? "Visitée"
    : stop?.unavailable
      ? "Indisponible"
      : +new Date(house.starts_at) > now
        ? "Ouvre plus tard"
        : +new Date(house.ends_at) <= now
          ? "Fermée"
          : "Disponible";
  const StatusIcon = visited || available ? Check : CircleAlert;
  return (
    <div className="route-overlay visitor-overlay">
      <section
        className="visitor-house route-dialog"
        role="dialog"
        onClick={(event) => event.stopPropagation()}
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
          <header className="visitor-heading">
            <h1 id="visitor-house-title">{house.name}</h1>
            <p className="visitor-address">
              <MapPin size={21} />
              <span>{house.address}</span>
            </p>
          </header>
          <div className="visitor-activities" aria-label="Activités proposées">
            {houseActivityOptions.map(({ id, label, Icon }) => (
              <span
                key={id}
                className={offered.includes(id) ? "is-offered" : "is-absent"}
                aria-label={
                  label +
                  (offered.includes(id) ? " : proposée" : " : non proposée")
                }
              >
                <Icon size={25} />
                {label}
              </span>
            ))}
          </div>
          <p className="visitor-hours">
            <Clock3 size={19} />
            <span>
              Ouvert de {time(house.starts_at, timezone)} à{" "}
              {time(house.ends_at, timezone)}
            </span>
          </p>
          <section
            className="visitor-fear-section"
            aria-label="Niveau de frayeur"
          >
            <h2>
              {house.adaptable
                ? "Niveau de frayeur de référence"
                : "Niveau de frayeur"}
            </h2>
            <FearGauge
              value={house.referenceFear ?? house.fear}
              labels={fearLabels}
              disabled={house.adaptable}
            />
            {house.adaptable && (
              <p className="visitor-adapt">
                <Ghost size={21} />
                <span>
                  <strong>S’adapte à ses visiteurs</strong>
                  <small>
                    La mise en scène et la frayeur s’adaptent aux visiteurs.
                  </small>
                </span>
              </p>
            )}
          </section>
          <section className="visitor-description">
            <h2>À propos de la maison</h2>
            <p>{house.rp || "Pas de description particulière."}</p>
          </section>
          <div
            className={
              "visitor-availability" +
              (available ? " is-available" : "") +
              (visited ? " is-visited" : "")
            }
            role="status"
          >
            <div>
              <StatusIcon size={25} />
              <span>
                <strong>{status}</strong>
                {available && !visited && (
                  <small>La maison vous attend !</small>
                )}
              </span>
            </div>
            {offered.includes("CANDY") && (
              <div
                className={
                  "visitor-stock" +
                  (house.candy_available === false ? " is-depleted" : "")
                }
              >
                <Candy size={26} />
                <span>
                  Bonbons
                  <strong>
                    {house.candy_available === false
                      ? "épuisés"
                      : house.candy_available === true
                        ? "disponibles"
                        : "Stock non renseigné"}
                  </strong>
                </span>
              </div>
            )}
          </div>
          {selectionError && <p role="alert">{selectionError}</p>}
          {onSelection && (
            <button
              type="button"
              disabled={selectionDisabled}
              onClick={onSelection}
            >
              {selected ? "Retirer de ma sélection" : "Ajouter à ma collecte"}
            </button>
          )}
          {!visited &&
            onVisit &&
            +new Date(house.starts_at) <= now &&
            +new Date(house.ends_at) > now && (
              <button type="button" onClick={onVisit}>
                Marquer comme visitée
              </button>
            )}
          <section className="visitor-practical">
            <h2>
              <Info size={19} />
              Infos pratiques
            </h2>
            <p>{house.practical || "Aucune indication particulière."}</p>
          </section>
        </div>
        <footer className="visitor-footer">
          <button
            type="button"
            className="primary visitor-return"
            onClick={onClose}
          >
            <MapPin size={23} />
            Voir sur la carte
          </button>
        </footer>
      </section>
    </div>
  );
}
