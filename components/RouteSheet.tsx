"use client";
import { useEffect, useRef, useState } from "react";
import {
  ChevronUp,
  Pause,
  Trash2,
  Footprints,
  Play,
  Route as RouteIcon,
} from "lucide-react";
import type { PublicHouse, RouteResult } from "./common";
import { fears, time } from "./common";
import type { SheetPosition } from "../lib/active-route";
import ManorMark from "./ManorMark";
export function routeSummary(result: RouteResult) {
  return `${result.stops.length} ${result.stops.length === 1 ? "maison" : "maisons"} · ${(result.distanceMeters / 1000).toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km · ~${result.durationMinutes} min`;
}
export function fearLabel(house: PublicHouse) {
  return house.adaptable
    ? "S’adapte à ses visiteurs"
    : house.fear === null
      ? "Frayeur non précisée"
      : fears[house.fear - 1];
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
  timezone,
  nextStepId,
  onHeight,
  selectedStepId,
  onRecalculate,
  recalculating,
}: {
  result: RouteResult;
  phase: "calculated" | "active";
  position: SheetPosition;
  onPosition: (position: SheetPosition) => void;
  onHouse: (house: PublicHouse) => void;
  onEnd: () => void;
  onStart: () => void;
  timezone: string;
  nextStepId?: string;
  onHeight: (height: number) => void;
  selectedStepId: string | null;
  onRecalculate: () => void;
  recalculating: boolean;
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
    return [96, Math.min(360, h * 0.46), Math.max(360, h - 180)];
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
  const nextIndex = Math.max(
    0,
    result.stops.findIndex((s) => s.house.id === nextStepId),
  );
  const visible =
    position === "intermediate"
      ? result.stops.slice(nextIndex, nextIndex + 3)
      : result.stops;
  return (
    <aside
      id="parcours"
      ref={panel}
      className={"route-sheet" + (dragHeight !== null ? " is-dragging" : "")}
      data-sheet-position={position}
      aria-label="Mon parcours"
      style={dragHeight === null ? undefined : { height: dragHeight }}
    >
      <button
        type="button"
        className="route-sheet-handle"
        aria-label="Position du panneau parcours"
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
                  positions.indexOf(position) + (e.key === "ArrowUp" ? 1 : -1),
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
          <strong>Mon parcours</strong>
          <small>{routeSummary(result)}</small>
        </span>
        <ChevronUp className="route-sheet-chevron" size={19} />
      </button>
      <div className="route-sheet-content" inert={position === "collapsed"}>
        {position === "intermediate" && <h2>Prochaine étape</h2>}
        {position === "expanded" && (
          <h2>{result.stops.length} étapes à découvrir</h2>
        )}
        <ol className="route-steps">
          {visible.map((stop) => {
            const number =
              result.stops.findIndex((s) => s.house.id === stop.house.id) + 1;
            return (
              <li key={stop.house.id}>
                <button
                  type="button"
                  className={
                    "route-step" +
                    (stop.unavailable ? " is-unavailable" : "") +
                    (selectedStepId === stop.house.id ? " is-selected" : "")
                  }
                  aria-label={`Voir l’étape ${number} : ${stop.house.name}`}
                  onClick={() => onHouse(stop.house)}
                >
                  <span className="route-step-number">{number}</span>
                  <span className="route-step-image" />
                  <span className="route-step-info">
                    <strong>{stop.house.name}</strong>
                    <small>
                      <Footprints size={11} />
                      {stop.walkingMinutes} min ·{" "}
                      {Math.round(stop.distanceMeters)} m
                    </small>
                    <span
                      className={
                        "route-fear-tag" +
                        (stop.house.adaptable ? " adaptable" : "")
                      }
                    >
                      {fearLabel(stop.house)}
                    </span>
                    {stop.unavailable && (
                      <span className="route-unavailable-label">
                        Indisponible
                      </span>
                    )}
                  </span>
                  <time dateTime={stop.arrival}>
                    {time(stop.arrival, timezone)}
                  </time>
                </button>
              </li>
            );
          })}
        </ol>
        {result.message && <p className="route-status">{result.message}</p>}
        <p className="route-disclaimer">{result.disclaimer}</p>
      </div>
      {position !== "collapsed" && (
        <footer className="route-sheet-footer">
          {result.stops.some((stop) => stop.unavailable) && (
            <button
              type="button"
              disabled={recalculating}
              onClick={onRecalculate}
            >
              <RouteIcon size={15} />
              {recalculating ? "Recalcul…" : "Recalculer mon parcours"}
            </button>
          )}
          {phase === "calculated" && !!result.stops.length && (
            <button type="button" className="primary" onClick={onStart}>
              <Play size={16} />
              Démarrer le parcours
            </button>
          )}
          <button
            type="button"
            className={phase === "active" ? "primary" : "route-danger"}
            onClick={onEnd}
          >
            {phase === "active" ? <Pause size={16} /> : <Trash2 size={16} />}{" "}
            {phase === "active"
              ? "Arrêter le parcours"
              : "Supprimer le parcours"}
          </button>
        </footer>
      )}
    </aside>
  );
}
