"use client";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import Link from "next/link";
import {
  X,
  Route,
  LocateFixed,
  AlertTriangle,
  ChevronDown,
  CircleUserRound,
  MapPin,
  List,
  Map as MapIcon,
} from "lucide-react";
import type { User, Activity } from "../lib/domain";
import { collectionStats } from "../lib/collection";
import type { RouteParameters } from "../lib/active-route";
import { Notice, labels, type PublicState } from "./common";
import useActiveRoute from "./useActiveRoute";
import MapView from "./Map";
import RoutePreparation from "./RoutePreparation";
import RouteSheet, { routeSummary } from "./RouteSheet";
import VisitorHouse from "./VisitorHouse";
import ManorMark from "./ManorMark";
import "./MapExperience.css";

export default function MapExperience({
  state,
  user,
  mapStyle,
  refresh,
}: {
  state: PublicState;
  user: User | null;
  mapStyle: string;
  refresh: () => Promise<void>;
}) {
  const controller = useActiveRoute({
    ownerId: user?.id ?? "",
    instanceId: state.instance!.id,
    seasonId: state.season?.id ?? "",
    closesAt: state.season?.closes_at ?? new Date(0).toISOString(),
  });
  const [preparing, setPreparing] = useState(false),
    [pick, setPick] = useState(false),
    [draftOrigin, setDraftOrigin] = useState<[number, number] | null>(null),
    [origin, setOrigin] = useState<[number, number] | null>(null),
    [originLabel, setOriginLabel] = useState("Point choisi sur la carte"),
    [focusToken, setFocusToken] = useState(0),
    [maxFear, setMaxFear] = useState(2),
    [filters, setFilters] = useState<Activity[]>([]),
    [list, setList] = useState(false),
    [confirmation, setConfirmation] = useState(false),
    [launch, setLaunch] = useState(false),
    [dismissedNotification, setDismissedNotification] = useState(""),
    [sheetHeight, setSheetHeight] = useState(96);
  const route = controller.result,
    routeShown = !!route,
    focused = routeShown && !!route.stops.length;
  useEffect(() => {
    if (!controller.ready) return;
    const open = () => {
      if (window.location.hash !== "#parcours") return;
      if (controller.phase === "preparation") setPreparing(true);
      window.history.replaceState(
        null,
        "",
        window.location.pathname + window.location.search,
      );
    };
    open();
    window.addEventListener("hashchange", open);
    return () => window.removeEventListener("hashchange", open);
  }, [controller.ready, controller.phase]);
  const selected = controller.selectedHouse;
  const locked =
    focused || preparing || pick || !!selected || confirmation || launch;
  useEffect(() => {
    if (!locked) return;
    const body = document.body,
      html = document.documentElement;
    const previous = [body.style.overflow, html.style.overflow],
      x = window.scrollX,
      y = window.scrollY;
    body.style.overflow = "hidden";
    html.style.overflow = "hidden";
    return () => {
      body.style.overflow = previous[0];
      html.style.overflow = previous[1];
      window.scrollTo({ left: x, top: y, behavior: "instant" });
    };
  }, [locked]);
  const retainedOrigin = useMemo(
    () =>
      origin ??
      (controller.parameters
        ? ([
            controller.parameters.origin.longitude,
            controller.parameters.origin.latitude,
          ] as [number, number])
        : null),
    [origin, controller.parameters],
  );
  const unavailableIds = useMemo(
    () => controller.unavailable.map((s) => s.id),
    [controller.unavailable],
  );
  const houses = useMemo(
    () =>
      (state.houses ?? []).filter(
        (h) =>
          !unavailableIds.includes(h.id) &&
          (!filters.length || filters.some((a) => h.activities.includes(a))),
      ),
    [state.houses, filters, unavailableIds],
  );
  const steps = useMemo(() => route?.stops.map((s) => s.house) ?? [], [route]);
  const notificationKey = unavailableIds.slice().sort().join("|");
  useEffect(() => {
    if (!notificationKey) setDismissedNotification("");
  }, [notificationKey]);
  const selectedStop = selected
    ? route?.stops.find((s) => s.house.id === selected.id)
    : undefined;
  const selectedHouse = selectedStop?.house ?? selected;
  const blocked =
    preparing ||
    !!selected ||
    confirmation ||
    launch ||
    controller.phase === "completed";
  async function calculate(parameters: RouteParameters) {
    await controller.calculateRoute(parameters);
    setPreparing(false);
    setList(false);
  }
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    if (controller.phase !== "active") return;
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [controller.phase]);
  const stats = collectionStats(
    controller.collection,
    route?.stops.length ?? 0,
    clock,
  );
  function chooseOrigin(point: [number, number], accuracy?: number) {
    controller.invalidate();
    setOrigin(point);
    setOriginLabel(
      accuracy === undefined
        ? "Point choisi sur la carte"
        : `Ma localisation · ±${Math.round(accuracy)} m${accuracy > 50 ? " · Position approximative" : ""}`,
    );
    setFocusToken((n) => n + 1);
  }
  function endRoute() {
    if (controller.phase === "active") controller.stopActiveRoute();
    else controller.deletePreparedRoute();
    setConfirmation(false);
    setDismissedNotification("");
    setPreparing(false);
    void refresh().catch(() => {});
  }
  const selectHouse = controller.selectHouse;
  return (
    <main
      className={"route-experience" + (focused || pick ? " is-focused" : "")}
      data-route-phase={controller.phase}
      style={{ "--route-sheet-height": `${sheetHeight}px` } as CSSProperties}
    >
      <div className="route-map-layer" inert={blocked}>
        {controller.ready && (
          <MapView
            houses={focused ? [] : houses}
            center={[state.instance!.longitude, state.instance!.latitude]}
            zoom={state.instance!.zoom}
            styleUrl={mapStyle}
            onSelect={selectHouse}
            visitedIds={controller.collection.visitedIds}
            origin={(pick ? draftOrigin : retainedOrigin) ?? undefined}
            focusToken={pick ? 0 : focusToken}
            routeSteps={steps}
            routePanelOpen={routeShown && !preparing}
            sheetPosition={controller.sheet}
            initialCamera={controller.camera}
            onCameraChange={controller.setCamera}
            currentPosition={
              ["tracking", "low-accuracy"].includes(controller.gpsState)
                ? controller.currentPosition
                : null
            }
            recenterTarget={controller.recenterTarget}
            unavailableIds={unavailableIds}
            selectedStepId={controller.selectedStepId}
            onPoint={
              pick ? (lat, lon) => setDraftOrigin([lon, lat]) : undefined
            }
          />
        )}
        <header className="route-map-toolbar">
          {focused && route ? (
            <button
              type="button"
              className="route-overview"
              onClick={() =>
                controller.setSheet(
                  controller.sheet === "collapsed" ? "expanded" : "collapsed",
                )
              }
            >
              <Route size={23} />
              <span>
                <strong>Mon parcours Halloween</strong>
                <small>{routeSummary(route)}</small>
              </span>
              <ChevronDown size={17} />
            </button>
          ) : (
            <div className="route-map-title">
              <span className="route-brand">
                <ManorMark />
              </span>
              <span>
                <strong>Les maisons à découvrir</strong>
                <small>{state.instance!.territory}</small>
              </span>
            </div>
          )}
          <Link
            className="route-account-link"
            href="/account"
            aria-label="Mon compte"
          >
            <CircleUserRound size={21} />
          </Link>
        </header>
        {!focused && !pick && (
          <div className="route-map-discovery">
            <button
              className="primary"
              type="button"
              disabled={state.state !== "MAP_OPEN"}
              onClick={() => {
                setList(false);
                setPreparing(true);
              }}
            >
              {" "}
              <Route size={18} />
              Préparer mon parcours
            </button>
            <button
              type="button"
              aria-label={
                list ? "Afficher la carte" : "Afficher la liste des maisons"
              }
              onClick={() => setList(!list)}
            >
              {list ? <MapIcon size={19} /> : <List size={19} />}
            </button>
            <div className="route-discovery-filters">
              {(["DECORATION", "CANDY", "ACTING"] as Activity[]).map((a) => (
                <button
                  type="button"
                  key={a}
                  aria-pressed={filters.includes(a)}
                  onClick={() =>
                    setFilters((f) =>
                      f.includes(a) ? f.filter((v) => v !== a) : [...f, a],
                    )
                  }
                >
                  {labels[a]}
                </button>
              ))}
            </div>
          </div>
        )}
        {state.state !== "MAP_OPEN" && (
          <p className="route-closed-notice">
            Les autres maisons seront visibles à l’ouverture de la carte.
          </p>
        )}
        {list && !focused && (
          <div className="route-house-list">
            {houses.map((h) => (
              <button type="button" key={h.id} onClick={() => selectHouse(h)}>
                <MapPin size={18} />
                <span>
                  <strong>{h.name}</strong>
                  <small>{h.address}</small>
                </span>
              </button>
            ))}
            {!houses.length && <p>Aucune maison disponible.</p>}
          </div>
        )}
        {focused && (
          <button
            type="button"
            className="route-recenter"
            aria-label="Recentrer sur ma position"
            disabled={
              !["tracking", "low-accuracy"].includes(controller.gpsState)
            }
            onClick={controller.recenterCurrentPosition}
          >
            <LocateFixed size={22} />
          </button>
        )}
        {controller.phase === "active" &&
          (controller.gpsState !== "tracking" || !controller.verified) && (
            <p className="route-gps-status" role="status">
              {!controller.verified
                ? controller.checking
                  ? "Vérification du parcours…"
                  : "Disponibilité non vérifiée"
                : controller.gpsState === "low-accuracy"
                  ? `GPS approximatif · ±${Math.round(controller.accuracy ?? 0)} m`
                  : controller.gpsState === "searching"
                    ? "Recherche GPS…"
                    : controller.gpsError || "GPS en pause"}
            </p>
          )}
        {controller.notification &&
          notificationKey !== dismissedNotification && (
            <section className="route-availability-notice" role="status">
              <AlertTriangle size={23} />
              <div>
                <strong>
                  Une maison de votre sélection n’est plus disponible.
                </strong>
                <small>
                  Elle ne compte plus parmi les maisons restantes. Vous restez
                  libre de poursuivre.
                </small>
              </div>
              <button
                type="button"
                className="close"
                aria-label="Fermer la notification"
                onClick={() => setDismissedNotification(notificationKey)}
              >
                <X size={17} />
              </button>
            </section>
          )}
        {controller.error && (
          <div className="route-map-error">
            <Notice error={controller.error} />
            {controller.phase === "active" && (
              <button
                type="button"
                disabled={controller.checking}
                onClick={() => void controller.checkAvailability()}
              >
                Vérifier à nouveau
              </button>
            )}
          </div>
        )}
        {controller.storageError && (
          <p className="route-storage-status" role="status">
            {controller.storageError}
          </p>
        )}
        {pick && (
          <div className="route-point-picker">
            <strong>
              {draftOrigin
                ? "Confirmez votre point de départ"
                : "Touchez la carte pour placer le départ"}
            </strong>
            <div>
              <button
                type="button"
                onClick={() => {
                  setPick(false);
                  setDraftOrigin(null);
                  setPreparing(true);
                }}
              >
                Annuler
              </button>
              <button
                type="button"
                className="primary"
                disabled={!draftOrigin}
                onClick={() => {
                  if (draftOrigin) chooseOrigin(draftOrigin);
                  setPick(false);
                  setPreparing(true);
                }}
              >
                Valider le départ
              </button>
            </div>
          </div>
        )}
        {routeShown &&
          controller.phase !== "completed" &&
          !preparing &&
          !pick && (
            <RouteSheet
              result={route!}
              phase={controller.phase === "active" ? "active" : "calculated"}
              position={controller.sheet}
              onPosition={controller.setSheet}
              onHouse={selectHouse}
              onEnd={() => setConfirmation(true)}
              onStart={() => setLaunch(true)}
              onSave={controller.savePreparedRoute}
              visitedIds={controller.collection.visitedIds}
              remaining={controller.remaining}
              elapsedSeconds={stats.durationSeconds}
              selectedStepId={controller.selectedStepId}
              onHeight={setSheetHeight}
            />
          )}
      </div>
      {(preparing || pick) && state.season && (
        <div hidden={!preparing} inert={!preparing}>
          <RoutePreparation
            state={state}
            origin={retainedOrigin}
            originLabel={originLabel}
            activities={filters}
            onOrigin={chooseOrigin}
            onPick={() => {
              controller.invalidate();
              setPreparing(false);
              setPick(true);
              setDraftOrigin(null);
            }}
            onClose={() => setPreparing(false)}
            onCalculate={calculate}
            onInvalidate={controller.invalidate}
            maxFear={maxFear}
            onFear={setMaxFear}
            resultMessage={
              route && !route.stops.length ? route.message : undefined
            }
          />
        </div>
      )}
      {selectedHouse && (
        <VisitorHouse
          house={selectedHouse}
          stop={selectedStop}
          visited={controller.collection.visitedIds.includes(selectedHouse.id)}
          onVisit={
            controller.phase === "active" &&
            selectedStop &&
            !selectedStop.unavailable
              ? () => controller.markVisited(selectedHouse.id)
              : undefined
          }
          timezone={state.instance!.timezone}
          onClose={() => controller.selectHouse(null)}
        />
      )}
      {launch && (
        <div className="route-confirm-backdrop">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="route-launch-title"
            className="route-confirm route-dialog"
          >
            <h2 id="route-launch-title">Avant de commencer 🎃</h2>
            <p>
              Halloween Map vous aide à repérer les maisons participantes
              correspondant à votre sélection.
            </p>
            <p>
              Vous restez libre de choisir les maisons que vous souhaitez
              visiter, leur ordre, votre chemin et le moment où vous souhaitez
              arrêter votre parcours.
            </p>
            <p>
              Les distances et durées affichées sont uniquement indicatives.
            </p>
            <p>
              Les déplacements restent sous votre responsabilité. Les enfants
              doivent rester sous la surveillance d’un adulte. Respectez la
              circulation, les propriétés privées et les consignes indiquées par
              les habitants.
            </p>
            <div>
              <button onClick={() => setLaunch(false)}>Annuler</button>
              <button
                className="primary"
                onClick={() => {
                  controller.startRoute();
                  setLaunch(false);
                }}
              >
                J’ai compris — lancer le parcours
              </button>
            </div>
          </section>
        </div>
      )}
      {controller.phase === "completed" && (
        <div className="route-confirm-backdrop">
          <section
            className="route-confirm route-dialog collection-summary"
            role="dialog"
            aria-modal="true"
            aria-labelledby="collection-summary-title"
          >
            <h2 id="collection-summary-title">Parcours terminé 🎃</h2>
            <p className="collection-result">
              {stats.visited} / {stats.selected} maisons visitées ·{" "}
              {stats.completion} %
            </p>
            <dl>
              <dt>Distance réellement observée</dt>
              <dd>
                {(stats.distanceMeters / 1000).toLocaleString("fr-FR", {
                  maximumFractionDigits: 2,
                })}{" "}
                km
              </dd>
              <dt>Durée réelle</dt>
              <dd>
                {Math.floor(stats.durationSeconds / 60)} min{" "}
                {stats.durationSeconds % 60} s
              </dd>
              <dt>Début</dt>
              <dd>
                {new Date(controller.collection.startedAt!).toLocaleTimeString(
                  "fr-FR",
                  { timeZone: state.instance!.timezone },
                )}
              </dd>
              <dt>Fin</dt>
              <dd>
                {new Date(controller.collection.endedAt!).toLocaleTimeString(
                  "fr-FR",
                  { timeZone: state.instance!.timezone },
                )}
              </dd>
            </dl>
            <p>
              La distance couvre uniquement les déplacements GPS exploitables
              observés pendant la collecte. Sans signal ou en arrière-plan, elle
              peut être partielle.
            </p>
            <button
              className="primary"
              onClick={() => {
                setConfirmation(false);
                controller.deletePreparedRoute();
              }}
            >
              Revenir à la carte
            </button>
          </section>
        </div>
      )}
      {confirmation && controller.phase !== "completed" && (
        <div className="route-confirm-backdrop">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="route-end-title"
            className="route-confirm route-dialog"
          >
            <button
              type="button"
              className="close"
              aria-label="Annuler"
              onClick={() => setConfirmation(false)}
            >
              <X size={18} />
            </button>
            <h2 id="route-end-title">
              {controller.phase === "active"
                ? "Arrêter ce parcours ?"
                : "Supprimer ce parcours ?"}
            </h2>
            <p>
              {controller.phase === "active"
                ? "Votre durée, votre distance observée et vos visites seront conservées dans le récapitulatif."
                : "Cette sélection sera supprimée de cet appareil."}
            </p>
            <div>
              <button type="button" onClick={() => setConfirmation(false)}>
                Continuer
              </button>
              <button type="button" className="primary" onClick={endRoute}>
                {controller.phase === "active" ? "Arrêter" : "Supprimer"}
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
