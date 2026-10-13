"use client";
import { useState, useEffect, useRef, useMemo } from "react";
import { DateTime } from "luxon";
import {
  X,
  ArrowLeft,
  LocateFixed,
  MapPin,
  Clock3,
  Ghost,
  Send,
  Check,
} from "lucide-react";
import { locateOrigin } from "../lib/geolocation";
import type { RouteParameters } from "../lib/active-route";
import type { PublicState, PublicHouse } from "./common";
import type { Activity } from "../lib/domain";
import { Field, Notice, fears, values } from "./common";
import Editorial from "./Editorial";
import { selectableHouses } from "../lib/collection-view";
import { gpsDistance } from "../lib/collection";
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
  onSelection,
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
  onSelection?: (houses: PublicHouse[]) => void;
}) {
  const [locating, setLocating] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [windowStart, setWindowStart] = useState(() => {
      const zone = state.instance!.timezone;
      const now = DateTime.now().setZone(zone).plus({ minutes: 2 });
      const opens = DateTime.fromISO(state.season!.opens_at).setZone(zone);
      return (!state.season!.is_test && now < opens ? opens : now)
        .toFormat("yyyy-MM-dd'T'HH:mm");
    }),
    [windowEnd, setWindowEnd] = useState(() => {
      const zone = state.instance!.timezone;
      const now = DateTime.now().setZone(zone).plus({ minutes: 2 });
      const opens = DateTime.fromISO(state.season!.opens_at).setZone(zone);
      const start = !state.season!.is_test && now < opens ? opens : now;
      const limit = DateTime.fromISO(
        state.season!.route_end_at ?? state.season!.closes_at,
      ).setZone(zone);
      return (start.plus({ hours: 2 }) < limit ? start.plus({ hours: 2 }) : limit)
        .toFormat("yyyy-MM-dd'T'HH:mm");
    }),
    [acceptedVersion, setAcceptedVersion] = useState<string | null>(null),
    [guidelinesOpen, setGuidelinesOpen] = useState(false);
  const zone = state.instance!.timezone,
    guideline = state.documents?.GUIDELINES;
  const candidates = useMemo(() => {
    const houses = [...(state.routeCandidates ?? state.houses ?? [])];
    if (!origin) return houses;
    return houses.sort(
      (a, b) =>
        gpsDistance(origin, [a.longitude, a.latitude]) -
          gpsDistance(origin, [b.longitude, b.latitude]) ||
        a.name.localeCompare(b.name, "fr"),
    );
  }, [state.routeCandidates, state.houses, origin]);
  const eligible = useMemo(
    () => selectableHouses(
      candidates, maxFear, activities,
      +DateTime.fromISO(windowStart, { zone }),
      +DateTime.fromISO(windowEnd, { zone }),
    ),
    [candidates, maxFear, activities, windowStart, windowEnd, zone],
  );
  const chosen = useMemo(() => eligible.slice(0, 30), [eligible]);
  useEffect(() => {
    onSelection?.(chosen);
  }, [chosen, onSelection]);
  const accepted = !!guideline && acceptedVersion === guideline.version;
  const alive = useRef(true),
    form = useRef<HTMLFormElement>(null);
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
  function updateHours() {
    if (!form.current) return;
    const fields = values(form.current);
    if (!/^\\d{2}:\\d{2}$/.test(fields.start) ||
        !/^\\d{2}:\\d{2}$/.test(fields.end)) return;
    const day = windowStart.slice(0, 10);
    const start = DateTime.fromISO(`${day}T${fields.start}`, { zone });
    let end = DateTime.fromISO(`${day}T${fields.end}`, { zone });
    if (!start.isValid || !end.isValid) return;
    if (end <= start) end = end.plus({ days: 1 });
    setWindowStart(start.toFormat("yyyy-MM-dd'T'HH:mm"));
    setWindowEnd(end.toFormat("yyyy-MM-dd'T'HH:mm"));
    onInvalidate();
  }
  return (
    <div className="route-overlay route-preparation-overlay">
      <section
        className="route-preparation route-dialog"
        role="dialog"
        onClick={(event) => event.stopPropagation()}
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
          ref={form}
          onSubmit={async (e) => {
            e.preventDefault();
            if (
              !origin ||
              !accepted ||
              !chosen.length ||
              chosen.length > 30 ||
              locating ||
              busy
            )
              return;
            setBusy(true);
            setError("");
            try {
              await onCalculate({
                start: DateTime.fromISO(windowStart, { zone }).toUTC().toISO()!,
                end: DateTime.fromISO(windowEnd, { zone }).toUTC().toISO()!,
                origin: { latitude: origin[1], longitude: origin[0] },
                activities,
                maxFear,
                excludedHouseIds: [],
                selectedHouseIds: chosen.map((house) => house.id),
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
            <h1 id="route-preparation-title">Préparer ma collecte</h1>
            <p className="route-subtitle">
              Fixez votre créneau puis explorez les maisons librement, sans itinéraire.
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
              <p className="route-times-day">
                <Clock3 size={16} /> Horaires de collecte
                <span>
                  {state.season!.is_test
                    ? "Saison TEST"
                    : "31 octobre " + state.season!.year}
                </span>
              </p>
              <div className="route-times-fields">
                <Field
                  label="Heure de début"
                  name="start"
                  type="time"
                  value={DateTime.fromISO(windowStart, { zone }).toFormat("HH:mm")}
                  readOnly={busy || locating}
                  onValueChange={updateHours}
                />
                <Field
                  label="Heure de fin"
                  name="end"
                  type="time"
                  value={DateTime.fromISO(windowEnd, { zone }).toFormat("HH:mm")}
                  readOnly={busy || locating}
                  onValueChange={updateHours}
                />
              </div>
              {windowEnd.slice(0, 10) !== windowStart.slice(0, 10) && (
                <small className="route-status">Fin le lendemain.</small>
              )}
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
                    className={maxFear === n + 1 ? "selected" : ""}
                  >
                    {fear}
                  </span>
                ))}
              </div>
              <p className="route-status">
                Le niveau choisi inclut également toutes les maisons de niveau
                inférieur.
              </p>
            </fieldset>
            <section className="collection-count" aria-live="polite">
              <span className="collection-count-icon"><MapPin size={21} /></span>
              <span>
                <strong>
                  Votre collecte inclut {chosen.length} {chosen.length === 1 ? "maison" : "maisons"}
                </strong>
                <small>
                  {eligible.length > 30
                    ? `30 maisons retenues sur ${eligible.length} compatibles · visites libres`
                    : "Visites libres, sans ordre imposé"}
                </small>
              </span>
            </section>
            {!eligible.length && (
              <p className="route-status" role="status">
                Aucune maison compatible avec ces horaires et ce niveau de frayeur.
              </p>
            )}
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
              disabled={
                !origin ||
                !accepted ||
                !chosen.length ||
                chosen.length > 30 ||
                locating ||
                busy
              }
            >
              <Send size={19} />
              {busy ? "Vérification des maisons…" : "Préparer ma collecte"}
            </button>
          </footer>
        </form>
      </section>
      {guidelinesOpen && guideline && (
        <div className="route-guidelines-backdrop">
          <section
            className="route-guidelines route-dialog"
            role="dialog"
            onClick={(event) => event.stopPropagation()}
            aria-modal="true"
            aria-labelledby="route-guidelines-title"
          >
            <button
              className="close"
              aria-label="Fermer la préparation"
              onClick={onClose}
            >
              <X />
            </button>
            <button
              type="button"
              className="floating-back"
              aria-label="Revenir à la préparation"
              onClick={() => setGuidelinesOpen(false)}
            >
              <ArrowLeft />
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
