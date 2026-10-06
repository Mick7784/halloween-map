"use client";
import { useState, useEffect, useRef } from "react";
import { DateTime } from "luxon";
import {
  X,
  LocateFixed,
  MapPin,
  Clock3,
  Ghost,
  Send,
  Check,
  Sparkles,
} from "lucide-react";
import { locateOrigin } from "../lib/geolocation";
import type { RouteParameters } from "../lib/active-route";
import type { PublicState } from "./common";
import type { Activity } from "../lib/domain";
import { Field, Notice, fears, values } from "./common";
import Editorial from "./Editorial";
import ManorMark from "./ManorMark";

export default function RoutePreparation({
  state,
  origin,
  originLabel,
  activities,
  onOrigin,
  onPick,
  onClose,
  onCalculate,
  onInvalidate,
  maxFear,
  onFear,
  resultMessage,
}: {
  state: PublicState;
  origin: [number, number] | null;
  originLabel: string;
  activities: Activity[];
  onOrigin: (point: [number, number], accuracy: number) => void;
  onPick: () => void;
  onClose: () => void;
  onCalculate: (parameters: RouteParameters) => Promise<void>;
  onInvalidate: () => void;
  maxFear: number;
  onFear: (value: number) => void;
  resultMessage?: string;
}) {
  const [locating, setLocating] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [allFear, setAllFear] = useState(false),
    [acceptedVersion, setAcceptedVersion] = useState<string | null>(null),
    [guidelinesOpen, setGuidelinesOpen] = useState(false);
  const zone = state.instance!.timezone,
    guideline = state.documents?.GUIDELINES;
  const now = DateTime.now().setZone(zone);
  const end = DateTime.fromISO(state.season!.closes_at).setZone(zone);
  const accepted = !!guideline && acceptedVersion === guideline.version;
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  async function locate() {
    setLocating(true);
    setError("");
    onInvalidate();
    try {
      const position = await locateOrigin(navigator.geolocation);
      if (alive.current) onOrigin(position.point, position.accuracy);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLocating(false);
    }
  }
  return (
    <div className="route-overlay route-preparation-overlay">
      <section
        className="route-preparation route-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="route-preparation-title"
        inert={guidelinesOpen}
      >
        <header className="route-dialog-header">
          <span className="route-brand">
            <ManorMark />
          </span>
          <span>HALLOWEEN MAP</span>
          <button
            type="button"
            className="close"
            aria-label="Fermer la préparation"
            onClick={onClose}
          >
            <X />
          </button>
        </header>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!origin || !accepted || locating || busy) return;
            setBusy(true);
            setError("");
            const v = values(e.currentTarget);
            try {
              await onCalculate({
                start: DateTime.fromISO(v.start, { zone }).toUTC().toISO()!,
                end: DateTime.fromISO(v.end, { zone }).toUTC().toISO()!,
                origin: { latitude: origin[1], longitude: origin[0] },
                activities,
                maxFear: allFear ? undefined : maxFear,
                excludedHouseIds: [],
                acceptance: {
                  mode: "GUIDELINES_ONLY",
                  guidelines: true,
                  guidelines_version: guideline!.version,
                },
              });
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="route-preparation-scroll">
            <h1 id="route-preparation-title">Préparer mon parcours</h1>
            <p className="route-subtitle">
              Créez un itinéraire personnalisé selon vos envies.
            </p>
            <fieldset disabled={busy || locating}>
              <legend>
                <MapPin size={17} /> Point de départ <b>*</b>
              </legend>
              <div className="route-origin-label">
                {origin ? originLabel : "Choisissez votre point de départ"}
              </div>
              <div className="route-origin-actions">
                <button type="button" onClick={() => void locate()}>
                  <LocateFixed size={18} />
                  {locating ? "Recherche de position…" : "Me localiser"}
                </button>
                <button type="button" onClick={onPick}>
                  <MapPin size={18} />
                  Choisir sur la carte
                </button>
              </div>
              {origin && (
                <small className="route-coordinates">
                  {origin[1].toFixed(5)}, {origin[0].toFixed(5)}
                </small>
              )}
            </fieldset>
            {locating && (
              <p role="status" className="route-status">
                Recherche de votre position précise…
              </p>
            )}
            <div className="route-times">
              <div>
                <Clock3 size={17} />
                <Field
                  label="Heure de début"
                  name="start"
                  type="datetime-local"
                  value={now
                    .plus({ minutes: 2 })
                    .toFormat("yyyy-MM-dd'T'HH:mm")}
                  readOnly={busy || locating}
                  onValueChange={onInvalidate}
                />
              </div>
              <div>
                <Clock3 size={17} />
                <Field
                  label="Heure de fin"
                  name="end"
                  type="datetime-local"
                  value={(now.plus({ hours: 2 }) < end
                    ? now.plus({ hours: 2 })
                    : end
                  ).toFormat("yyyy-MM-dd'T'HH:mm")}
                  readOnly={busy || locating}
                  onValueChange={onInvalidate}
                />
              </div>
            </div>
            <fieldset className="route-fear" disabled={busy || locating}>
              <legend>
                <Ghost size={17} /> Niveau de frayeur
              </legend>
              <input
                type="range"
                aria-label="Niveau de frayeur"
                min="1"
                max="5"
                step="1"
                value={maxFear}
                disabled={allFear}
                onChange={(e) => {
                  onFear(Number(e.target.value));
                  onInvalidate();
                }}
                style={
                  {
                    "--fear-progress": `${(maxFear - 1) * 25}%`,
                  } as React.CSSProperties
                }
              />
              <div className="route-fear-labels">
                {fears.map((fear, n) => (
                  <span
                    key={fear}
                    className={!allFear && maxFear === n + 1 ? "selected" : ""}
                  >
                    {fear}
                  </span>
                ))}
              </div>
              <label className="route-switch">
                <input
                  type="checkbox"
                  checked={allFear}
                  onChange={(e) => {
                    setAllFear(e.target.checked);
                    onInvalidate();
                  }}
                />
                <span />
                <span>Je m’adapte à tous les niveaux</span>
                <Sparkles size={15} />
              </label>
            </fieldset>
            <Notice
              error={
                error ||
                (!guideline
                  ? "Les bonnes pratiques sont indisponibles. Actualisez la page."
                  : "")
              }
            />
            {resultMessage && (
              <p className="route-status" role="status">
                {resultMessage}
              </p>
            )}
          </div>
          <footer className="route-preparation-footer">
            <label className="route-acceptance">
              <input
                type="checkbox"
                checked={accepted}
                disabled={busy || locating || !guideline}
                onChange={(e) => {
                  setAcceptedVersion(
                    e.target.checked ? guideline!.version : null,
                  );
                  onInvalidate();
                }}
              />
              <span>
                J’ai pris connaissance des{" "}
                <button type="button" onClick={() => setGuidelinesOpen(true)}>
                  bonnes pratiques
                </button>
                .
              </span>
            </label>
            <button
              className="primary route-submit"
              disabled={!origin || !accepted || locating || busy}
            >
              <Send size={19} />
              {busy ? "Calcul piéton…" : "Créer mon parcours"}
            </button>
          </footer>
        </form>
      </section>
      {guidelinesOpen && guideline && (
        <div className="route-guidelines-backdrop">
          <section
            className="route-guidelines route-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="route-guidelines-title"
          >
            <button
              className="close"
              aria-label="Fermer les bonnes pratiques"
              onClick={() => setGuidelinesOpen(false)}
            >
              <X />
            </button>
            <div className="route-guide-icon">
              <Ghost />
            </div>
            <h2 id="route-guidelines-title">{guideline.title}</h2>
            <p className="route-subtitle">
              Quelques règles pour une soirée magique, sereine et respectueuse.
            </p>
            <div className="route-guidelines-scroll">
              <Editorial text={guideline.body} />
            </div>
            <button
              className="primary"
              onClick={() => setGuidelinesOpen(false)}
            >
              <Check size={18} />
              J’ai compris
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
