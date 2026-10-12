"use client";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import Link from "next/link";
import {
  X,
  Route,
  Square,
  LocateFixed,
  AlertTriangle,
  MapPin,
  Plus,
  House as HouseIcon,
  Clock3,
  Footprints,
  UserRound,
  ChevronUp,
} from "lucide-react";
import type { User, Activity } from "../lib/domain";
import { locateOrigin } from "../lib/geolocation";
import { nearestHouse, selectableHouses } from "../lib/collection-view";
import { gpsDistance, collectionStats } from "../lib/collection";
import { ACTIVE_ROUTE_KEY, type RouteParameters } from "../lib/active-route";
import { Badges, Notice, labels, type PublicState } from "./common";
import useActiveRoute from "./useActiveRoute";
import MapView from "./Map";
import RoutePreparation from "./RoutePreparation";
import RouteSheet from "./RouteSheet";
import VisitorHouse from "./VisitorHouse";
import FloatingWindow from "./FloatingWindow";
import ActivityIcon from "./ActivityIcon";
import FearBadge from "./FearBadge";
import "./MapExperience.css";

export default function MapExperience({
  state,
  user,
  mapStyle,
  refresh,
  readOnly = false,
}: {
  state: PublicState;
  user: User | null;
  mapStyle: string;
  refresh: () => Promise<void>;
  readOnly?: boolean;
}) {
  const controller = useActiveRoute({
    ownerId: user?.id ?? "",
    instanceId: state.instance!.id,
    seasonId: state.season?.id ?? "",
    closesAt: state.season?.closes_at ?? new Date(0).toISOString(),
  });
  const [preparing, setPreparing] = useState(false),
    [preparationHouses, setPreparationHouses] = useState<
      NonNullable<PublicState["houses"]>
    >([]),
    [pick, setPick] = useState(false),
    [draftOrigin, setDraftOrigin] = useState<[number, number] | null>(null),
    [origin, setOrigin] = useState<[number, number] | null>(null),
    [originLabel, setOriginLabel] = useState("Point choisi sur la carte"),
    [focusToken, setFocusToken] = useState(0),
    [maxFear, setMaxFear] = useState(2),
    [filters, setFilters] = useState<Activity[]>([]),
    [optionsOpen, setOptionsOpen] = useState(false),
    [previewOpen, setPreviewOpen] = useState(true),
    [confirmation, setConfirmation] = useState(false),
    [launch, setLaunch] = useState(false),
    [dismissedNotification, setDismissedNotification] = useState(""),
    [sheetHeight, setSheetHeight] = useState(78),
    [adding, setAdding] = useState(false),
    [selectionBusy, setSelectionBusy] = useState(false),
    [selectionError, setSelectionError] = useState(""),
    [selectionNotice, setSelectionNotice] = useState(""),
    [locating, setLocating] = useState(false),
    [locationError, setLocationError] = useState("");
  const [consultationFix, setConsultationFix] = useState<{
    point: [number, number];
    token: number;
    accuracy: number;
    timestamp: number;
  } | null>(null);
  const route = readOnly ? null : controller.result,
    routeShown = !!route,
    focused = routeShown && controller.phase === "active";
  const setSheet = controller.setSheet;
  useEffect(() => {
    if (!controller.ready) return;
    const open = () => {
      if (window.location.hash !== "#parcours") return;
      if (controller.phase === "preparation") setPreparing(true);
      else if (controller.phase === "calculated") setPreviewOpen(true);
      else if (controller.phase === "active") setSheet("expanded");
      window.history.replaceState(
        null,
        "",
        window.location.pathname + window.location.search,
      );
    };
    open();
    window.addEventListener("hashchange", open);
    return () => window.removeEventListener("hashchange", open);
  }, [controller.ready, controller.phase, setSheet]);
  useEffect(() => {
    const open = () => setOptionsOpen(true);
    window.addEventListener("map-options", open);
    return () => window.removeEventListener("map-options", open);
  }, []);
  const selected = controller.selectedHouse;
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
    () =>
      route?.stops.filter((s) => s.unavailable).map((s) => s.house.id) ?? [],
    [route],
  );
  const houses = useMemo(
    () =>
      (state.houses ?? []).filter(
        (h) => !filters.length || filters.some((a) => h.activities.includes(a)),
      ),
    [state.houses, filters],
  );
  const steps = useMemo(() => route?.stops.map((s) => s.house) ?? [], [route]);
  const notificationKey = unavailableIds.slice().sort().join("|");
  useEffect(() => {
    if (!notificationKey) setDismissedNotification("");
  }, [notificationKey]);
  const selectedStop = selected
    ? route?.stops.find((s) => s.house.id === selected.id)
    : undefined;
  const selectedHouse =
    selectedStop?.house ??
    state.houses?.find((h) => h.id === selected?.id) ??
    selected;
  const blocked =
    preparing ||
    !!selected ||
    confirmation ||
    launch ||
    adding ||
    controller.phase === "completed";
  async function calculate(parameters: RouteParameters) {
    await controller.calculateRoute(parameters);
    setPreviewOpen(true);
    setPreparing(false);
  }
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    if (controller.phase !== "active" && !consultationFix) return;
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [controller.phase, consultationFix]);
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
  function prepare() {
    if (controller.phase === "calculated") setPreviewOpen(true);
    else setPreparing(true);
  }
  async function locate() {
    setLocating(true);
    setLocationError("");
    try {
      const fix = await locateOrigin(navigator.geolocation);
      setConsultationFix((previous) => ({
        point: fix.point,
        accuracy: fix.accuracy,
        timestamp: Date.now(),
        token: (previous?.token ?? 0) + 1,
      }));
    } catch (e) {
      setLocationError((e as Error).message);
    } finally {
      setLocating(false);
    }
  }
  const selectedCandidates = route?.stops.map((s) => s.house.id) ?? [];
  const proximityPoint =
    controller.gpsState === "tracking" &&
    controller.fixTimestamp &&
    clock - controller.fixTimestamp <= 15000
      ? controller.currentPosition
      : !focused &&
          consultationFix &&
          clock - consultationFix.timestamp <= 15000
        ? consultationFix.point
        : null;
  const distancePoint = proximityPoint ?? retainedOrigin;
  const distanceLabel = proximityPoint
    ? "votre position GPS"
    : "le point de départ";
  const addCandidates = selectableHouses(
    state.routeCandidates ?? state.houses ?? [],
    5,
    [],
    clock,
    +new Date(controller.parameters?.end ?? 0),
    true,
  )
    .filter((h) => !selectedCandidates.includes(h.id))
    .sort((a, b) => {
      const point = proximityPoint ?? retainedOrigin;
      return point
        ? gpsDistance(point, [a.longitude, a.latitude]) -
            gpsDistance(point, [b.longitude, b.latitude]) ||
            a.name.localeCompare(b.name, "fr")
        : a.name.localeCompare(b.name, "fr");
    });
  function outsideCriteria(house: NonNullable<PublicState["houses"]>[number]) {
    const preferences = controller.parameters;
    if (!preferences) return [];
    const reasons: string[] = [];
    if (
      preferences.activities.length &&
      !preferences.activities.some((activity) =>
        house.activities.includes(activity),
      )
    ) {
      reasons.push(
        `Activités différentes : ${preferences.activities.map((activity) => labels[activity]).join(", ")} recherchées`,
      );
    }
    if (
      !house.adaptable &&
      (house.fear === null || house.fear > (preferences.maxFear ?? 5))
    ) {
      reasons.push(
        house.fear === null
          ? "Niveau de frayeur non précisé"
          : `Frayeur ${house.fear} · limite choisie ${preferences.maxFear ?? 5}`,
      );
    }
    if (preferences.excludedHouseIds.includes(house.id)) {
      reasons.push("Maison retirée de votre sélection initiale");
    }
    return reasons;
  }
  async function addHouse(house: NonNullable<PublicState["houses"]>[number]) {
    setSelectionBusy(true);
    setSelectionError("");
    try {
      await controller.addHouse(house);
    } catch (e) {
      setSelectionError((e as Error).message);
    } finally {
      setSelectionBusy(false);
    }
  }
  const distanceKnown = (controller.collection.gpsAcceptedFixes ?? 0) >= 3;
  const distanceComplete =
    distanceKnown &&
    !controller.collection.distancePartial &&
    (controller.collection.gpsObservedSeconds ?? 0) >=
      stats.durationSeconds * 0.7;
  const nearestId =
    focused &&
    controller.verified &&
    controller.gpsState === "tracking" &&
    controller.fixTimestamp &&
    clock - controller.fixTimestamp <= 15000 &&
    controller.nearestHouseId &&
    controller.currentPosition &&
    controller.parameters &&
    clock < +new Date(controller.parameters.end)
      ? nearestHouse(
          route?.stops ?? [],
          controller.collection.visitedIds,
          {
            point: controller.currentPosition,
            accuracy: controller.accuracy ?? Infinity,
            timestamp: controller.fixTimestamp,
          },
          controller.nearestHouseId,
          clock,
        )
      : !focused && consultationFix
        ? nearestHouse(
            (routeShown ? steps : houses).map((house) => ({
              house,
              arrival: "",
              departure: "",
              walkingMinutes: 0,
              walkingSeconds: 0,
              distanceMeters: 0,
            })),
            controller.collection.visitedIds,
            consultationFix,
            null,
            clock,
          )
        : null;
  const selectHouse = controller.selectHouse;
  const collectionSummary = (
    <>
      <div className="collection-bottom-heading">
        <button
          type="button"
          className="collection-toggle"
          aria-label="Déplier ou replier ma sélection"
          aria-expanded={controller.sheet !== "collapsed"}
          aria-controls="collection-houses"
          onClick={() =>
            controller.setSheet(
              controller.sheet === "collapsed" ? "expanded" : "collapsed",
            )
          }
          onKeyDown={(event) => {
            if (event.key === "ArrowUp" || event.key === "ArrowDown") {
              event.preventDefault();
              controller.setSheet(
                event.key === "ArrowUp" ? "expanded" : "collapsed",
              );
            }
          }}
        >
          <strong>Ma collecte</strong>
          <ChevronUp size={18} aria-hidden="true" />
        </button>
        <Link
          href="/account"
          className="collection-account"
          aria-label="Mon compte"
          title="Mon compte"
        >
          <UserRound size={20} aria-hidden="true" />
        </Link>
        <button
          type="button"
          className="route-danger"
          aria-label="Arrêter la collecte"
          onClick={() => setConfirmation(true)}
        >
          <Square size={16} />
          Arrêter
        </button>
      </div>
      <div
        className="collection-bottom-metrics"
        aria-label="Statistiques de collecte"
      >
        <span
          aria-label={`${stats.visited} maisons visitées sur ${stats.selected}`}
          title="Maisons visitées"
        >
          <HouseIcon size={18} aria-hidden="true" />
          <strong>
            {stats.visited}/{stats.selected}
          </strong>
        </span>
        <span aria-label="Temps écoulé" title="Temps écoulé">
          <Clock3 size={18} aria-hidden="true" />
          <strong>
            {String(Math.floor(stats.durationSeconds / 60)).padStart(2, "0")}:
            {String(stats.durationSeconds % 60).padStart(2, "0")}
          </strong>
        </span>
        <span
          aria-label={
            distanceKnown
              ? distanceComplete
                ? "Distance GPS observée"
                : "Distance GPS partielle"
              : "Distance GPS indisponible"
          }
          title={
            distanceKnown
              ? distanceComplete
                ? "Distance GPS observée"
                : "Distance GPS partielle"
              : "Distance GPS indisponible"
          }
        >
          <Footprints size={18} aria-hidden="true" />
          <strong>
            {distanceKnown
              ? `${(stats.distanceMeters / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} km`
              : "—"}
          </strong>
          {distanceKnown && !distanceComplete && (
            <small aria-label="Mesure partielle">*</small>
          )}
        </span>
      </div>
      <progress
        aria-label="Progression de la collecte"
        max={Math.max(1, stats.selected)}
        value={stats.visited}
      />
    </>
  );
  const routeSheet = routeShown &&
    controller.phase !== "completed" &&
    !preparing &&
    !pick && (
      <RouteSheet
        result={route!}
        phase={controller.phase === "active" ? "active" : "calculated"}
        position={focused ? controller.sheet : "expanded"}
        onPosition={controller.setSheet}
        onHouse={selectHouse}
        onEnd={() => setConfirmation(true)}
        onStart={() => setLaunch(true)}
        onSave={() => {
          setSelectionError("");
          try {
            if (controller.storageError)
              throw new Error(controller.storageError);
            const raw = localStorage.getItem(ACTIVE_ROUTE_KEY);
            const saved = raw
              ? (JSON.parse(raw) as {
                  ownerId: string;
                  seasonId: string;
                  phase: string;
                  result: { stops: { house: { id: string } }[] };
                })
              : null;
            if (
              !saved ||
              saved.ownerId !== user?.id ||
              saved.seasonId !== state.season?.id ||
              saved.phase !== "calculated" ||
              saved.result.stops.length !== (route?.stops.length ?? -1) ||
              route?.stops.some(
                (stop) =>
                  !saved.result.stops.some(
                    (entry) => entry.house.id === stop.house.id,
                  ),
              )
            )
              throw new Error(
                "La sélection n'a pas pu être sauvegardée sur cet appareil.",
              );
            controller.savePreparedRoute();
            setPreviewOpen(false);
            setSelectionNotice("Votre sélection a été enregistrée");
          } catch (error) {
            setSelectionError((error as Error).message);
          }
        }}
        visitedIds={controller.collection.visitedIds}
        remaining={controller.remaining}
        elapsedSeconds={stats.durationSeconds}
        selectedStepId={controller.selectedStepId}
        onHeight={setSheetHeight}
        onAdd={() => {
          setSelectionError("");
          setAdding(true);
        }}
        onRemove={controller.removeHouse}
        proximityPoint={distancePoint}
        fearLabels={state.participation?.fearLabels}
        distanceSource={distanceLabel}
        activeSummary={focused ? collectionSummary : undefined}
      />
    );
  return (
    <main
      className={"route-experience" + (focused || pick ? " is-focused" : "")}
      data-route-phase={controller.phase}
      style={{ "--route-sheet-height": `${sheetHeight}px` } as CSSProperties}
    >
      <div className="route-map-layer" inert={blocked}>
        {controller.ready && (
          <MapView
            houses={
              preparing || pick
                ? preparationHouses
                : routeShown && controller.phase !== "completed"
                  ? steps
                  : houses
            }
            center={[state.instance!.longitude, state.instance!.latitude]}
            zoom={state.instance!.zoom}
            styleUrl={mapStyle}
            onSelect={selectHouse}
            visitedIds={controller.collection.visitedIds}
            origin={(pick ? draftOrigin : retainedOrigin) ?? undefined}
            focusToken={pick ? 0 : focusToken}
            routeSteps={
              preparing || pick || controller.phase === "completed" ? [] : steps
            }
            routePanelOpen={false}
            sheetPosition={controller.sheet}
            initialCamera={controller.camera}
            onCameraChange={controller.setCamera}
            currentPosition={
              ["tracking", "low-accuracy"].includes(controller.gpsState)
                ? controller.currentPosition
                : (consultationFix?.point ?? null)
            }
            recenterTarget={
              focused ? controller.recenterTarget : consultationFix
            }
            unavailableIds={unavailableIds}
            selectedStepId={selected?.id ?? null}
            nearestHouseId={nearestId}
            collectionActive={focused}
            onPoint={
              pick ? (lat, lon) => setDraftOrigin([lon, lat]) : undefined
            }
          />
        )}
        {!focused && !pick && (
          <>
            <button
              className="collection-discovery"
              type="button"
              onClick={() => {
                setOptionsOpen(true);
              }}
            >
              <MapPin size={20} />
              <span>
                <strong>Les maisons à découvrir</strong>
                <small>
                  {state.instance!.territory} · {houses.length} maisons
                </small>
              </span>
            </button>
            {!readOnly && (
              <button
                className="collection-prepare primary"
                type="button"
                disabled={!state.collectionAccessible}
                onClick={prepare}
              >
                <Route size={22} />
                {controller.phase === "calculated"
                  ? "Voir ma sélection"
                  : "Préparer ma collecte"}
              </button>
            )}
            <button
              className="route-recenter consultation-recenter"
              type="button"
              aria-label="Me localiser"
              disabled={locating}
              onClick={() => void locate()}
            >
              <LocateFixed size={22} />
            </button>
            {locationError && (
              <p className="route-gps-status" role="status">
                {locationError}
              </p>
            )}
          </>
        )}
        {!focused && !pick && optionsOpen && (
          <FloatingWindow
            title="Maisons et filtres"
            onClose={() => setOptionsOpen(false)}
            className="map-options-window"
          >
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
                  <ActivityIcon activity={a} /> {labels[a]}
                </button>
              ))}
            </div>
            <div className="map-options-list">
              {houses
                .slice()
                .sort((a, b) =>
                  distancePoint
                    ? gpsDistance(distancePoint, [a.longitude, a.latitude]) -
                      gpsDistance(distancePoint, [b.longitude, b.latitude])
                    : 0,
                )
                .map((h) => (
                  <button
                    type="button"
                    key={h.id}
                    onClick={() => {
                      setOptionsOpen(false);
                      selectHouse(h);
                    }}
                  >
                    <MapPin size={18} />
                    <span>
                      <strong>{h.name}</strong>
                      <small>
                        {distancePoint
                          ? `À environ ${Math.round(gpsDistance(distancePoint, [h.longitude, h.latitude]))} m à vol d’oiseau depuis ${distanceLabel}`
                          : "Distance actuelle indisponible"}
                      </small>
                      <span className="map-house-features">
                        <Badges activities={h.activities} compact />
                        <FearBadge
                          fear={h.fear}
                          adaptable={h.adaptable}
                          labels={state.participation?.fearLabels}
                        />
                      </span>
                    </span>
                  </button>
                ))}
              {!houses.length && <p>Aucune maison disponible.</p>}
            </div>
          </FloatingWindow>
        )}
        {readOnly && (
          <p className="route-closed-notice">
            Saison terminée — carte en lecture seule.
          </p>
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
                  ? "Vérification de la sélection…"
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
        {focused && routeSheet}
        {focused && controller.finishSuggested && (
          <div className="collection-finish-suggestion" role="status">
            Aucune maison restante disponible. Vous pouvez modifier votre
            sélection ou terminer depuis la barre du bas.
          </div>
        )}
      </div>
      {!focused &&
        !preparing &&
        !pick &&
        !launch &&
        !confirmation &&
        !selectedHouse &&
        routeSheet &&
        previewOpen && (
          <FloatingWindow
            title="Ma collecte Halloween"
            className="prepared-route-window"
            onClose={() => setPreviewOpen(false)}
          >
            <Notice error={selectionError} />
            {routeSheet}
          </FloatingWindow>
        )}
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
            onSelection={setPreparationHouses}
            maxFear={maxFear}
            onFear={setMaxFear}
            resultMessage={
              route && !route.stops.length ? route.message : undefined
            }
          />
        </div>
      )}
      {selectionNotice && !focused && (
        <p className="collection-save-notice" role="status">
          {selectionNotice}
        </p>
      )}
      {adding && (
        <FloatingWindow
          title="Ajouter des maisons"
          onClose={() => setAdding(false)}
        >
          <p>
            Votre collecte continue. Les maisons visitées restent conservées.
          </p>
          <Notice error={selectionError} />
          {addCandidates.map((h) => (
            <button
              className="collection-add-choice"
              key={h.id}
              type="button"
              disabled={selectionBusy || (route?.stops.length ?? 0) >= 30}
              onClick={() => void addHouse(h)}
            >
              <span>
                <strong>{h.name}</strong>
                <small>{h.address}</small>
                <small>
                  {distancePoint
                    ? `À environ ${Math.round(gpsDistance(distancePoint, [h.longitude, h.latitude]))} m à vol d’oiseau depuis ${distanceLabel}`
                    : "Distance actuelle indisponible"}
                </small>
                <Badges activities={h.activities} compact />
                {outsideCriteria(h).length > 0 && (
                  <small
                    className="collection-add-reasons"
                    aria-label="Pourquoi cette maison n'était pas proposée"
                  >
                    Hors critères : {outsideCriteria(h).join(" · ")}
                  </small>
                )}
                <FearBadge
                  fear={h.fear}
                  adaptable={h.adaptable}
                  labels={state.participation?.fearLabels}
                />
              </span>
              <Plus size={20} aria-hidden="true" />{" "}
              <span className="visually-hidden">Ajouter {h.name}</span>
            </button>
          ))}
          {!addCandidates.length && (
            <p>Aucune autre maison disponible pendant votre collecte.</p>
          )}
          {(route?.stops.length ?? 0) >= 30 && (
            <p>La sélection est limitée à 30 maisons.</p>
          )}
        </FloatingWindow>
      )}
      {selectedHouse && (
        <VisitorHouse
          fearLabels={state.participation?.fearLabels}
          house={selectedHouse}
          stop={selectedStop}
          visited={controller.collection.visitedIds.includes(selectedHouse.id)}
          onVisit={
            controller.phase === "active" &&
            controller.verified &&
            controller.parameters &&
            clock < +new Date(controller.parameters.end) &&
            selectedStop &&
            !selectedStop.unavailable
              ? () => controller.markVisited(selectedHouse.id)
              : undefined
          }
          onSelection={
            focused &&
            !controller.collection.visitedIds.includes(selectedHouse.id)
              ? selectedStop
                ? () => controller.removeHouse(selectedHouse.id)
                : () => void addHouse(selectedHouse)
              : undefined
          }
          selected={!!selectedStop}
          selectionDisabled={
            selectionBusy ||
            (!selectedStop &&
              ((route?.stops.length ?? 0) >= 30 ||
                !addCandidates.some((h) => h.id === selectedHouse.id)))
          }
          selectionError={selectionError}
          timezone={state.instance!.timezone}
          onClose={() => controller.selectHouse(null)}
        />
      )}
      {launch && (
        <div className="route-confirm-backdrop">
          <section
            role="dialog"
            onClick={(event) => event.stopPropagation()}
            aria-modal="true"
            aria-labelledby="route-launch-title"
            className="route-confirm route-dialog"
          >
            <button
              type="button"
              className="close"
              aria-label="Fermer la confirmation de départ"
              onClick={() => setLaunch(false)}
            >
              <X />
            </button>
            <h2 id="route-launch-title">Avant de commencer 🎃</h2>
            <p>
              Halloween Map vous aide à repérer les maisons participantes
              correspondant à votre sélection.
            </p>
            <p>
              Vous restez libre de choisir les maisons que vous souhaitez
              visiter, leur ordre, votre chemin et le moment où vous souhaitez
              arrêter votre collecte.
            </p>
            <p>
              Le chrono mesure le temps écoulé. La distance parcourue est
              mesurée avec le GPS ; elle peut être partielle si le signal est
              interrompu.
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
                J’ai compris — commencer ma collecte
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
            onClick={(event) => event.stopPropagation()}
            aria-modal="true"
            aria-labelledby="collection-summary-title"
          >
            <button
              className="close"
              aria-label="Fermer le récapitulatif"
              onClick={() => {
                setConfirmation(false);
                controller.deletePreparedRoute();
              }}
            >
              <X />
            </button>
            <h2 id="collection-summary-title">Collecte terminée 🎃</h2>
            <p className="collection-result">
              {stats.visited} / {stats.selected} maisons visitées ·{" "}
              {stats.completion} %
            </p>
            <dl>
              <dt>Distance réellement observée</dt>
              <dd>
                {distanceKnown
                  ? `${(stats.distanceMeters / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} km${distanceComplete ? "" : " · mesure partielle"}`
                  : "Distance non disponible · GPS insuffisant"}
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
            onClick={(event) => event.stopPropagation()}
            aria-modal="true"
            aria-labelledby="route-end-title"
            className="route-confirm route-dialog"
          >
            <button
              type="button"
              className="close"
              aria-label="Fermer la confirmation"
              onClick={() => setConfirmation(false)}
            >
              <X size={18} />
            </button>
            <h2 id="route-end-title">
              {controller.phase === "active"
                ? "Arrêter cette collecte ?"
                : "Supprimer cette sélection ?"}
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
