"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, type PublicHouse, type RouteResult } from "./common";
import { houseTravelKey } from "../lib/route-state";
import { watchCurrentPosition } from "../lib/geolocation";
import {
  emptyCollection,
  emptyTracker,
  collectGPS,
  remainingHouses,
  finishCollection,
  type Collection,
} from "../lib/collection";
import {
  ACTIVE_ROUTE_KEY,
  ROUTE_POLL_MS,
  annotateAvailability,
  clearStoredRoute,
  restoreRoute,
  type MapCamera,
  type RouteAvailability,
  type RouteParameters,
  type SheetPosition,
  type StoredRoute,
} from "../lib/active-route";
type Controller = {
  identityKey: string;
  phase: "preparation" | "calculated" | "active" | "completed";
  parameters: RouteParameters | null;
  result: RouteResult | null;
  collection: Collection;
  collectionId: string | null;
  selectedHouse: PublicHouse | null;
  selectedStepId: string | null;
  sheet: SheetPosition;
  camera: MapCamera | null;
  unavailable: RouteAvailability["steps"];
  checking: boolean;
  verified: boolean;
  error: string;
  storageError: string;
  createdAt: string;
  ready: boolean;
  currentPosition: [number, number] | null;
  accuracy: number | null;
  gpsState:
    | "idle"
    | "searching"
    | "tracking"
    | "low-accuracy"
    | "denied"
    | "unavailable"
    | "paused";
  gpsError: string;
  recenterTarget: { point: [number, number]; token: number } | null;
};
const initial = (): Controller => ({
  identityKey: "",
  phase: "preparation",
  parameters: null,
  result: null,
  collection: emptyCollection(),
  collectionId: null,
  selectedHouse: null,
  selectedStepId: null,
  sheet: "collapsed",
  camera: null,
  unavailable: [],
  checking: false,
  verified: false,
  error: "",
  storageError: "",
  createdAt: new Date().toISOString(),
  ready: false,
  currentPosition: null,
  accuracy: null,
  gpsState: "idle",
  gpsError: "",
  recenterTarget: null,
});
export default function useActiveRoute({
  ownerId,
  instanceId,
  seasonId,
  closesAt,
}: {
  ownerId: string;
  instanceId: string;
  seasonId: string;
  closesAt: string;
}) {
  const [state, setState] = useState(initial),
    current = useRef(state),
    revision = useRef(0),
    inputRevision = useRef(0),
    checking = useRef(false),
    pendingCheck = useRef(false),
    checkCallback = useRef<() => Promise<void>>(async () => {}),
    tracker = useRef(emptyTracker());
  const identityKey = JSON.stringify([ownerId, instanceId, seasonId]);
  useEffect(() => {
    current.current = state;
  }, [state]);
  const bumpRevision = useCallback(() => {
    revision.current++;
  }, []);
  const reset = useCallback(() => {
    revision.current++;
    inputRevision.current++;
    clearStoredRoute();
    setState((s) => ({
      ...initial(),
      identityKey: s.identityKey,
      ready: true,
      camera: s.camera,
    }));
  }, []);
  const stopActiveRoute = useCallback(() => {
    revision.current++;
    setState((s) =>
      s.phase === "active"
        ? {
            ...s,
            phase: "completed",
            selectedHouse: null,
            selectedStepId: null,
            collection: finishCollection(s.collection, Date.now()),
            gpsState: "idle",
            checking: false,
          }
        : s,
    );
  }, []);
  useEffect(() => {
    revision.current++;
    let saved: StoredRoute | null = null,
      storageError = "";
    try {
      const raw = localStorage.getItem(ACTIVE_ROUTE_KEY);
      saved = restoreRoute(raw, { ownerId, instanceId, seasonId }, Date.now());
      if (raw && !saved) clearStoredRoute();
    } catch {
      storageError = "La sauvegarde locale est indisponible sur cet appareil.";
    }
    setState({
      ...initial(),
      identityKey,
      ready: true,
      storageError,
      ...(saved
        ? {
            phase: saved.phase,
            parameters: saved.parameters,
            result: saved.result,
            collection: saved.collection,
            collectionId: saved.collectionId ?? null,
            sheet: saved.sheet,
            camera: saved.camera,
            createdAt: saved.createdAt,
          }
        : {}),
    });
    return bumpRevision;
  }, [ownerId, instanceId, seasonId, identityKey, bumpRevision]);
  useEffect(() => {
    if (!state.ready || state.identityKey !== identityKey) return;
    if (
      state.phase === "preparation" ||
      !state.parameters ||
      !state.result?.stops.length
    ) {
      clearStoredRoute();
      return;
    }
    const saved: StoredRoute = {
      format: 2,
      phase: state.phase,
      collection: state.collection,
      collectionId: state.collectionId,
      ownerId,
      instanceId,
      seasonId,
      parameters: state.parameters,
      result: { ...state.result, geometry: [] },
      createdAt: state.createdAt,
      updatedAt: new Date().toISOString(),
      expiresAt: new Date(
        Math.min(+new Date(state.parameters.end), +new Date(closesAt)),
      ).toISOString(),
      sheet: state.sheet,
      camera: state.camera,
    };
    try {
      localStorage.setItem(ACTIVE_ROUTE_KEY, JSON.stringify(saved));
    } catch {
      setState((s) =>
        s.storageError
          ? s
          : {
              ...s,
              storageError:
                "Le parcours fonctionne, mais sa sauvegarde locale est indisponible.",
            },
      );
    }
  }, [
    state.ready,
    state.identityKey,
    state.phase,
    state.parameters,
    state.result,
    state.collection,
    state.collectionId,
    state.createdAt,
    state.sheet,
    state.camera,
    identityKey,
    ownerId,
    instanceId,
    seasonId,
    closesAt,
  ]);
  useEffect(() => {
    if (
      !state.ready ||
      state.identityKey !== identityKey ||
      !state.collectionId ||
      !state.result ||
      !["active", "completed"].includes(state.phase)
    )
      return;
    const collection = state.collection,
      event = state.phase === "completed" ? "finish" : "start";
    const report = {
      id: state.collectionId,
      seasonId,
      event,
      planned: state.result.stops.length,
      visited: event === "finish" ? collection.visitedIds.length : 0,
      distanceMeters: event === "finish" ? collection.distanceMeters : 0,
      durationSeconds:
        event === "finish" && collection.startedAt && collection.endedAt
          ? Math.max(
              0,
              (+new Date(collection.endedAt) -
                +new Date(collection.startedAt)) /
                1000,
            )
          : 0,
    };
    let delivered = false;
    const send = () => {
      if (!delivered)
        void api("collection/report", report)
          .then(() => {
            delivered = true;
          })
          .catch(() => {});
    };
    send();
    window.addEventListener("online", send);
    const retry = setInterval(send, 60000);
    return () => {
      clearInterval(retry);
      window.removeEventListener("online", send);
    };
    // GPS updates stay local; reports contain totals only and run on phase changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    state.ready,
    state.identityKey,
    state.collectionId,
    state.phase,
    identityKey,
    seasonId,
  ]);
  const checkAvailability = useCallback(async () => {
    if (document.visibilityState === "hidden") return;
    if (checking.current) {
      pendingCheck.current = true;
      return;
    }
    const snapshot = current.current;
    if (
      snapshot.identityKey !== identityKey ||
      !["calculated", "active"].includes(snapshot.phase) ||
      !snapshot.result?.stops.length ||
      !snapshot.parameters
    )
      return;
    if (
      Date.now() >=
      Math.min(+new Date(snapshot.parameters.end), +new Date(closesAt))
    ) {
      if (snapshot.phase === "active") stopActiveRoute();
      else reset();
      return;
    }
    const token = revision.current;
    checking.current = true;
    setState((s) => ({ ...s, checking: true }));
    try {
      const availability = await api<RouteAvailability>("route/availability", {
        instanceId,
        seasonId,
        mode: "COLLECTION",
        end: snapshot.parameters.end,
        activities: snapshot.parameters.activities,
        maxFear: snapshot.parameters.maxFear,
        steps: snapshot.result.stops.map((s) => ({
          id: s.house.id,
          arrival: s.arrival,
          departure: s.departure,
          key: houseTravelKey(s.house),
        })),
      });
      if (token !== revision.current) return;
      if (!availability.valid) {
        if (snapshot.phase === "active") stopActiveRoute();
        else reset();
        return;
      }
      if (
        availability.steps.length !== snapshot.result.stops.length ||
        snapshot.result.stops.some(
          (s) => !availability.steps.some((a) => a.id === s.house.id),
        )
      )
        throw new Error("Vérification du parcours incomplète. Réessayez.");
      setState((s) =>
        !s.result
          ? s
          : {
              ...s,
              result: annotateAvailability(s.result, availability),
              unavailable: availability.steps.filter((a) => !a.available),
              verified: true,
              error: "",
            },
      );
    } catch (e) {
      if (token === revision.current)
        setState((s) => ({
          ...s,
          verified: false,
          error: (e as Error).message,
        }));
    } finally {
      checking.current = false;
      if (pendingCheck.current) {
        pendingCheck.current = false;
        queueMicrotask(() => void checkCallback.current());
      }
      setState((s) =>
        s.identityKey === identityKey ? { ...s, checking: false } : s,
      );
    }
  }, [instanceId, seasonId, closesAt, identityKey, stopActiveRoute, reset]);
  useEffect(() => {
    checkCallback.current = checkAvailability;
  }, [checkAvailability]);
  useEffect(() => {
    if (!["calculated", "active"].includes(state.phase)) return;
    let interval: ReturnType<typeof setInterval> | undefined;
    const sync = () => {
      if (interval) clearInterval(interval);
      if (document.visibilityState === "hidden") return;
      void checkAvailability();
      interval = setInterval(() => void checkAvailability(), ROUTE_POLL_MS);
    };
    sync();
    document.addEventListener("visibilitychange", sync);
    window.addEventListener("pageshow", sync);
    return () => {
      if (interval) clearInterval(interval);
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("pageshow", sync);
    };
  }, [state.phase, checkAvailability]);
  useEffect(() => {
    if (state.phase !== "active") return;
    let stopWatch: (() => void) | undefined;
    const sync = () => {
      stopWatch?.();
      stopWatch = undefined;
      tracker.current = emptyTracker();
      if (document.visibilityState === "hidden") {
        setState((s) => ({ ...s, gpsState: "paused" }));
        return;
      }
      setState((s) => ({ ...s, gpsState: "searching", gpsError: "" }));
      stopWatch = watchCurrentPosition(
        navigator.geolocation,
        (position) => {
          const snapshot = current.current;
          if (snapshot.phase !== "active") return;
          const update = collectGPS(
            tracker.current,
            { ...position, timestamp: position.timestamp ?? Date.now() },
            snapshot.verified ? (snapshot.result?.stops ?? []) : [],
            snapshot.collection.visitedIds,
            Date.now(),
          );
          tracker.current = update.tracker;
          setState((s) =>
            s.phase !== "active"
              ? s
              : {
                  ...s,
                  currentPosition: update.accepted
                    ? position.point
                    : s.currentPosition,
                  accuracy: position.accuracy,
                  gpsState:
                    position.accuracy > 35
                      ? "low-accuracy"
                      : update.accepted
                        ? "tracking"
                        : s.gpsState,
                  gpsError: "",
                  collection: {
                    ...s.collection,
                    distanceMeters:
                      s.collection.distanceMeters + update.distanceDelta,
                    visitedIds: [
                      ...new Set([
                        ...s.collection.visitedIds,
                        ...update.visitedIds,
                      ]),
                    ],
                  },
                },
          );
        },
        (error) =>
          setState((s) => ({
            ...s,
            gpsState: error.code === 1 ? "denied" : "unavailable",
            gpsError: error.message,
          })),
      );
    };
    sync();
    document.addEventListener("visibilitychange", sync);
    window.addEventListener("pageshow", sync);
    return () => {
      stopWatch?.();
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("pageshow", sync);
    };
  }, [state.phase]);
  useEffect(() => {
    if (
      state.phase === "active" &&
      state.verified &&
      state.result &&
      !remainingHouses(state.result.stops, state.collection.visitedIds).length
    )
      stopActiveRoute();
  }, [
    state.phase,
    state.verified,
    state.result,
    state.collection.visitedIds,
    stopActiveRoute,
  ]);
  useEffect(() => {
    if (!state.parameters || !["active", "calculated"].includes(state.phase))
      return;
    const timer = setInterval(() => {
      if (
        Date.now() >=
        Math.min(+new Date(state.parameters!.end), +new Date(closesAt))
      ) {
        if (state.phase === "active") stopActiveRoute();
        else reset();
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [state.phase, state.parameters, closesAt, stopActiveRoute, reset]);
  const invalidate = useCallback(() => {
    inputRevision.current++;
    if (current.current.phase === "active") return;
    revision.current++;
    setState((s) =>
      s.phase === "active"
        ? s
        : {
            ...s,
            phase: "preparation",
            parameters: null,
            result: null,
            collection: emptyCollection(),
            collectionId: null,
            error: "",
          },
    );
  }, []);
  const calculateRoute = useCallback(async (parameters: RouteParameters) => {
    const token = ++inputRevision.current,
      generation = revision.current,
      result = await api<RouteResult>("route", parameters);
    if (token !== inputRevision.current || generation !== revision.current)
      return;
    revision.current++;
    setState((s) => ({
      ...s,
      phase: "calculated",
      parameters,
      result: { ...result, geometry: [] },
      collection: emptyCollection(),
      collectionId: null,
      unavailable: [],
      verified: false,
      error: "",
      createdAt: new Date().toISOString(),
      sheet: "expanded",
      currentPosition: null,
      accuracy: null,
      gpsState: "idle",
      gpsError: "",
      recenterTarget: null,
    }));
  }, []);
  const startRoute = useCallback(() => {
    if (
      current.current.phase !== "calculated" ||
      !current.current.result?.stops.length
    )
      return;
    revision.current++;
    setState((s) => ({
      ...s,
      phase: "active",
      collectionId: crypto.randomUUID(),
      collection: { ...emptyCollection(), startedAt: new Date().toISOString() },
      verified: false,
      sheet: "intermediate",
    }));
  }, []);
  const markVisited = useCallback(
    (id: string) =>
      setState((s) => {
        const stop = s.result?.stops.find((t) => t.house.id === id),
          now = Date.now();
        if (
          s.phase !== "active" ||
          !stop ||
          stop.unavailable ||
          +new Date(stop.house.starts_at) > now ||
          +new Date(stop.house.ends_at) <= now ||
          s.collection.visitedIds.includes(id)
        )
          return s;
        return {
          ...s,
          collection: {
            ...s.collection,
            visitedIds: [...s.collection.visitedIds, id],
          },
        };
      }),
    [],
  );
  const selectHouse = useCallback(
    (house: PublicHouse | null) =>
      setState((s) => ({
        ...s,
        selectedHouse: house,
        selectedStepId: house?.id ?? s.selectedStepId,
      })),
    [],
  );
  const setSheet = useCallback(
    (sheet: SheetPosition) => setState((s) => ({ ...s, sheet })),
    [],
  );
  const setCamera = useCallback(
    (camera: MapCamera) => setState((s) => ({ ...s, camera })),
    [],
  );
  const recenterCurrentPosition = useCallback(
    () =>
      setState((s) =>
        s.currentPosition && ["tracking", "low-accuracy"].includes(s.gpsState)
          ? {
              ...s,
              recenterTarget: {
                point: s.currentPosition,
                token: (s.recenterTarget?.token ?? 0) + 1,
              },
            }
          : s,
      ),
    [],
  );
  const savePreparedRoute = useCallback(
    () =>
      setState((s) =>
        s.phase === "calculated" ? { ...s, sheet: "collapsed" } : s,
      ),
    [],
  );
  return {
    ...state,
    remaining: remainingHouses(
      state.result?.stops ?? [],
      state.collection.visitedIds,
    ).length,
    notification: state.unavailable.some(
      (a) => !state.collection.visitedIds.includes(a.id),
    )
      ? "Une maison de votre sélection n’est plus disponible"
      : "",
    calculateRoute,
    startRoute,
    savePreparedRoute,
    markVisited,
    checkAvailability,
    invalidate,
    selectHouse,
    setSheet,
    setCamera,
    recenterCurrentPosition,
    deletePreparedRoute: reset,
    stopActiveRoute,
    getRevision: () => revision.current,
  };
}
