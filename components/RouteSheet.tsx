"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ChevronUp,
  Plus,
  Minus,
  Trash2,
  MapPin,
  Info,
  Play,
  Check,
  Bookmark,
} from "lucide-react";
import type { PublicHouse, RouteResult } from "./common";
import type { SheetPosition } from "../lib/active-route";
import ManorMark from "./ManorMark";
import { gpsDistance } from "../lib/collection";
import ActivityIcon, { activityLabels } from "./ActivityIcon";
import FearBadge, { fearDescription } from "./FearBadge";
export function routeSummary(result: RouteResult) {
  return `${result.stops.length} ${result.stops.length === 1 ? "maison" : "maisons"} · Visites dans l’ordre de votre choix`;
}
const positions: SheetPosition[] = ["collapsed", "intermediate", "expanded"];
export default function RouteSheet({
  result,
  phase,
  position,
  onPosition,
  onHouse,
  onEnd,
  onStart,
  onSave,
  visitedIds,
  onHeight,
  selectedStepId,
  onAdd,
  onRemove,
  proximityPoint,
  activeSummary,
  fearLabels,
  distanceSource = "votre position GPS",
}: {
  result: RouteResult;
  phase: "calculated" | "active";
  position: SheetPosition;
  onPosition: (position: SheetPosition) => void;
  onHouse: (house: PublicHouse) => void;
  onEnd: () => void;
  onStart: () => void;
  onSave: () => void;
  visitedIds: string[];
  remaining: number;
  elapsedSeconds: number;
  onHeight: (height: number) => void;
  selectedStepId: string | null;
  onAdd?: () => void;
  onRemove?: (id: string) => void;
  proximityPoint?: [number, number] | null;
  activeSummary?: ReactNode;
  fearLabels?: string[];
  distanceSource?: string;
}) {
  const panel = useRef<HTMLElement>(null),
    drag = useRef<{
      y: number;
      height: number;
      time: number;
      moved: boolean;
    } | null>(null),
    ignoreClick = useRef(false);
  const [dragHeight, setDragHeight] = useState<number | null>(null);
  function heights() {
    const h = window.visualViewport?.height ?? window.innerHeight;
    const openHeight =
      phase === "active" ? Math.max(240, h - 160) : Math.min(520, h * 0.7);
    return [78, Math.min(300, h * 0.42), openHeight];
  }
  useEffect(() => {
    const el = panel.current;
    if (!el) return;
    const measure = () => onHeight(el.getBoundingClientRect().height);
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    measure();
    return () => observer.disconnect();
  }, [onHeight]);
  // A distance ranking is advisory, never a forced visit order or a route.
  // Already visited houses stay visible after houses still to discover.
  const visible = result.stops.slice().sort((a, b) => {
    const aVisited = visitedIds.includes(a.house.id);
    const bVisited = visitedIds.includes(b.house.id);
    if (aVisited !== bVisited) return aVisited ? 1 : -1;
    if (!proximityPoint) return 0;
    return (
      gpsDistance(proximityPoint, [a.house.longitude, a.house.latitude]) -
      gpsDistance(proximityPoint, [b.house.longitude, b.house.latitude])
    );
  });
  return (
    <aside
      id="parcours"
      ref={panel}
      className={
        "route-sheet" +
        (phase === "active" ? " collection-bottom-bar" : "") +
        (dragHeight !== null ? " is-dragging" : "")
      }
      data-sheet-position={position}
      aria-label={phase === "active" ? "Collecte en cours" : "Ma collecte"}
      style={dragHeight === null ? undefined : { height: dragHeight }}
    >
      {activeSummary ?? (
        <button
          type="button"
          className="route-sheet-handle"
          aria-label="Déplier ou replier ma sélection"
          aria-expanded={position !== "collapsed"}
          onPointerDown={(e) => {
            if (e.button !== 0 || window.innerWidth >= 768) return;
            drag.current = {
              y: e.clientY,
              height: panel.current!.getBoundingClientRect().height,
              time: performance.now(),
              moved: false,
            };
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (!d) return;
            const dy = d.y - e.clientY;
            if (Math.abs(dy) > 4) d.moved = true;
            if (d.moved) {
              const limits = heights();
              setDragHeight(
                Math.max(limits[0], Math.min(limits[2], d.height + dy)),
              );
            }
          }}
          onPointerUp={(e) => {
            const d = drag.current;
            if (!d) return;
            drag.current = null;
            if (!d.moved) return;
            ignoreClick.current = true;
            const sizes = heights(),
              dy = d.y - e.clientY;
            let index = sizes.reduce(
              (best, height, n) =>
                Math.abs(height - (d.height + dy)) <
                Math.abs(sizes[best] - (d.height + dy))
                  ? n
                  : best,
              0,
            );
            if (Math.abs(dy) > 45 && performance.now() - d.time < 260)
              index = Math.max(
                0,
                Math.min(2, positions.indexOf(position) + (dy > 0 ? 1 : -1)),
              );
            setDragHeight(null);
            onPosition(positions[index]);
          }}
          onPointerCancel={() => {
            drag.current = null;
            setDragHeight(null);
          }}
          onKeyDown={(e) => {
            if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
            e.preventDefault();
            onPosition(
              positions[
                Math.max(
                  0,
                  Math.min(
                    2,
                    positions.indexOf(position) +
                      (e.key === "ArrowUp" ? 1 : -1),
                  ),
                )
              ],
            );
          }}
          onClick={() => {
            if (ignoreClick.current) {
              ignoreClick.current = false;
              return;
            }
            onPosition(positions[(positions.indexOf(position) + 1) % 3]);
          }}
        >
          <span className="route-sheet-grip" />
          <span className="route-brand">
            <ManorMark />
          </span>
          <span>
            <strong>
              {phase === "active" ? "Collecte en cours" : "Ma collecte"}
            </strong>
            <small>
              {phase === "active"
                ? `${result.stops.length} ${result.stops.length === 1 ? "maison sélectionnée" : "maisons sélectionnées"} · ${visitedIds.length} ${visitedIds.length === 1 ? "visitée" : "visitées"}`
                : routeSummary(result)}
            </small>
          </span>
          <ChevronUp className="route-sheet-chevron" size={19} />
        </button>
      )}
      <div
        id="collection-houses"
        className="route-sheet-content"
        inert={position === "collapsed"}
      >
        <h2 className="collection-order-label">
          Maisons — de la plus proche à la plus éloignée
        </h2>
        <p className="route-status">
          Le classement suit votre position GPS. Vous restez libre de visiter
          les maisons dans l’ordre de votre choix.
        </p>
        {phase === "active" && onAdd && (
          <button className="collection-add" type="button" onClick={onAdd}>
            <Plus size={18} /> Ajouter des maisons
          </button>
        )}
        <ul className="route-steps collection-dense-steps">
          {visible.map((stop) => {
            const visited = visitedIds.includes(stop.house.id);
            const distance =
              proximityPoint &&
              Number.isFinite(stop.house.latitude) &&
              Number.isFinite(stop.house.longitude)
                ? Math.round(
                    gpsDistance(proximityPoint, [
                      stop.house.longitude,
                      stop.house.latitude,
                    ]),
                  )
                : null;
            return (
              <li key={stop.house.id} className={visited ? "is-visited" : ""}>
                <button
                  type="button"
                  className={
                    "route-step" +
                    (visited
                      ? " is-visited"
                      : stop.unavailable
                        ? " is-unavailable"
                        : "") +
                    (selectedStepId === stop.house.id ? " is-selected" : "")
                  }
                  aria-label={`Voir la maison : ${stop.house.name} · ${visited ? "Visitée" : stop.unavailable ? "Indisponible" : "À visiter"} · ${fearDescription(stop.house.fear, stop.house.adaptable, fearLabels)} · ${stop.house.activities.map((a) => activityLabels[a]).join(", ")}`}
                  onClick={() => onHouse(stop.house)}
                >
                  {visited ? (
                    <Check
                      size={17}
                      className="collection-row-marker"
                      aria-label="Visitée"
                    />
                  ) : (
                    <MapPin
                      size={17}
                      className="collection-row-marker"
                      aria-hidden="true"
                    />
                  )}
                  <strong
                    className="collection-row-name"
                    title={stop.house.name}
                  >
                    {stop.house.name}
                  </strong>
                  <span
                    className="collection-row-activities"
                    aria-label="Activités"
                  >
                    {stop.house.activities.map((activity) => (
                      <span
                        key={activity}
                        title={activityLabels[activity]}
                        aria-label={activityLabels[activity]}
                      >
                        <ActivityIcon activity={activity} />
                      </span>
                    ))}
                  </span>
                  <FearBadge
                    fear={stop.house.fear}
                    adaptable={stop.house.adaptable}
                    labels={fearLabels}
                  />
                  <small
                    className="collection-row-distance"
                    title={`Distance à vol d’oiseau depuis ${distanceSource}`}
                  >
                    {distance === null
                      ? "—"
                      : distance < 1000
                        ? `${distance} m`
                        : `${(distance / 1000).toFixed(1)} km`}
                  </small>
                  {stop.unavailable && (
                    <Info size={14} aria-label="Indisponible" />
                  )}
                </button>
                {phase === "active" && onRemove && !visited && (
                  <button
                    className="collection-remove"
                    type="button"
                    aria-label={`Retirer ${stop.house.name} de ma sélection`}
                    onClick={() => onRemove(stop.house.id)}
                  >
                    <Minus size={17} />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
        {phase === "calculated" && result.message && (
          <p className="route-status">{result.message}</p>
        )}
        {phase === "calculated" && (
          <p className="route-disclaimer">{result.disclaimer}</p>
        )}
      </div>
      {phase === "calculated" && position !== "collapsed" && (
        <footer className="route-sheet-footer">
          {phase === "calculated" && (
            <button type="button" onClick={onSave}>
              <Bookmark size={16} />
              Garder pour plus tard
            </button>
          )}
          {phase === "calculated" && !!result.stops.length && (
            <button type="button" className="primary" onClick={onStart}>
              <Play size={16} />
              Commencer ma collecte
            </button>
          )}
          <button type="button" className="route-danger" onClick={onEnd}>
            <Trash2 size={16} /> Supprimer la sélection
          </button>
        </footer>
      )}
    </aside>
  );
}
