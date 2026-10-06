"use client";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
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
    [dismissedNotification, setDismissedNotification] = useState(""),
    [sheetHeight, setSheetHeight] = useState(96);
  const startAfterCalculation = useRef(false);
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
  const startRoute = controller.startRoute;
  const setSheet = controller.setSheet;
  useEffect(() => {
    if (
      controller.phase !== "calculated" ||
      !startAfterCalculation.current ||
      !route
    )
      return;
    startAfterCalculation.current = false;
    if (route.stops.length) {
      startRoute();
      setSheet("collapsed");
      setPreparing(false);
      setList(false);
    }
  }, [controller.phase, route, startRoute, setSheet]);
  const selected = controller.selectedHouse;
  const locked = focused || preparing || pick || !!selected || confirmation;
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
  const blocked = preparing || !!selected || confirmation;
  async function calculate(parameters: RouteParameters) {
    startAfterCalculation.current = true;
    try {
      await controller.calculateRoute(parameters);
    } catch (e) {
      startAfterCalculation.current = false;
      throw e;
    }
  }
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
            houses={houses}
            center={[state.instance!.longitude, state.instance!.latitude]}
            zoom={state.instance!.zoom}
            styleUrl={mapStyle}
            onSelect={selectHouse}
            geometry={preparing ? undefined : route?.geometry}
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
        {focused &&
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
                  Une maison de votre parcours n’est plus disponible.
                </strong>
                <small>Son étape reste visible jusqu’au recalcul.</small>
                <button
                  className="primary"
                  type="button"
                  disabled={controller.recalculating}
                  onClick={() => void controller.recalculateRoute()}
                >
                  <Route size={15} />
                  {controller.recalculating
                    ? "Recalcul…"
                    : "Recalculer mon parcours"}
                </button>
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
        {routeShown && !preparing && !pick && (
          <RouteSheet
            result={route!}
            phase={controller.phase === "active" ? "active" : "calculated"}
            position={controller.sheet}
            onPosition={controller.setSheet}
            onHouse={selectHouse}
            onEnd={() => setConfirmation(true)}
            onStart={controller.startRoute}
            timezone={state.instance!.timezone}
            nextStepId={controller.nextStep?.house.id}
            selectedStepId={controller.selectedStepId}
            onHeight={setSheetHeight}
            onRecalculate={() => void controller.recalculateRoute()}
            recalculating={controller.recalculating}
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
          number={
            route
              ? route.stops.findIndex((s) => s.house.id === selectedHouse.id) +
                1
              : undefined
          }
          total={route?.stops.length}
          timezone={state.instance!.timezone}
          onClose={() => controller.selectHouse(null)}
        />
      )}
      {confirmation && (
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
            <p>Vous retrouverez la carte des maisons.</p>
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
