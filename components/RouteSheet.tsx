"use client";
import { useEffect, useRef, useState } from "react";
import {
  ChevronUp,
  Plus,
  Minus,
  Trash2,
  Footprints,
  Play,
  Check,
  Bookmark,
} from "lucide-react";
import type { PublicHouse, RouteResult } from "./common";
import { fears } from "./common";
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
  onSave,
  visitedIds,
  onHeight,
  selectedStepId,
  onAdd,
  onRemove,
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
    return [78, Math.min(300, h * 0.42), Math.min(520, h * 0.52)];
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
  const ordered = result.stops
    .slice()
    .sort((a, b) => a.house.name.localeCompare(b.house.name, "fr"));
  const visible = ordered;
  return (
    <aside
      id="parcours"
      ref={panel}
      className={
        "route-sheet" +
        (phase === "active" ? " collection-top-panel" : "") +
        (dragHeight !== null ? " is-dragging" : "")
      }
      data-sheet-position={position}
      aria-label={phase === "active" ? "Collecte en cours" : "Ma collecte"}
      style={dragHeight === null ? undefined : { height: dragHeight }}
    >
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
          const dy = phase === "active" ? e.clientY - d.y : d.y - e.clientY;
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
            dy = phase === "active" ? e.clientY - d.y : d.y - e.clientY;
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
                    ((
                      phase === "active"
                        ? e.key === "ArrowDown"
                        : e.key === "ArrowUp"
                    )
                      ? 1
                      : -1),
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
              ? `${result.stops.length} maisons sélectionnées · ${visitedIds.length} visitées`
              : routeSummary(result)}
          </small>
        </span>
        <ChevronUp className="route-sheet-chevron" size={19} />
      </button>
      <div className="route-sheet-content" inert={position === "collapsed"}>
        <h2>Ma sélection · ordre libre</h2>
        {phase === "active" && onAdd && (
          <button className="collection-add" type="button" onClick={onAdd}>
            <Plus size={18} /> Ajouter des maisons
          </button>
        )}
        <ul className="route-steps">
          {visible.map((stop) => {
            const visited = visitedIds.includes(stop.house.id);
            return (
              <li key={stop.house.id}>
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
                  aria-label={`Voir la maison : ${stop.house.name}`}
                  onClick={() => onHouse(stop.house)}
                >
                  {visited && <Check size={18} aria-label="Visitée" />}
                  <span className="route-step-image" />
                  <span className="route-step-info">
                    <strong>{stop.house.name}</strong>
                    <small>
                      <Footprints size={11} />
                      {visited
                        ? "Visitée"
                        : stop.unavailable
                          ? "Indisponible"
                          : "À découvrir"}
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
                </button>
                {phase === "active" && onRemove && !visited && (
                  <button
                    className="collection-remove"
                    type="button"
                    aria-label={`Retirer ${stop.house.name} de ma sélection`}
                    onClick={() => onRemove(stop.house.id)}
                  >
                    <Minus size={18} />
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
