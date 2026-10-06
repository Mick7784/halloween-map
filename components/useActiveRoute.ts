"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, type PublicHouse, type RouteResult } from "./common";
import { houseTravelKey } from "../lib/route-state";
import { watchCurrentPosition } from "../lib/geolocation";
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
  phase: "preparation" | "calculated" | "active";
  parameters: RouteParameters | null;
  result: RouteResult | null;
  selectedHouse: PublicHouse | null;
  selectedStepId: string | null;
  sheet: SheetPosition;
  camera: MapCamera | null;
  unavailable: RouteAvailability["steps"];
  checking: boolean;
  verified: boolean;
  recalculating: boolean;
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
  selectedHouse: null,
  selectedStepId: null,
  sheet: "collapsed",
  camera: null,
  unavailable: [],
  checking: false,
  verified: false,
  recalculating: false,
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
  preview = false,
  previewTime,
}: {
  ownerId: string;
  instanceId: string;
  seasonId: string;
  closesAt: string;
  preview?: boolean;
  previewTime?: string;
}) {
  const [state, setState] = useState(initial);
  const identityKey = JSON.stringify([ownerId, instanceId, seasonId, preview]);
  const current = useRef(state);
  useEffect(() => {
    current.current = state;
  }, [state]);
  const revision = useRef(0),
    checking = useRef(false),
    pendingCheck = useRef(false);
  const inputRevision = useRef(0);
  const checkCallback = useRef<() => Promise<void>>(async () => {});
  const checkingGeometry = useRef<number[][] | null>(null);
  const simulatedTime = useRef(previewTime);
  useEffect(() => {
    simulatedTime.current = previewTime;
  }, [previewTime]);
  const bumpRevision = useCallback(() => {
    revision.current++;
  }, []);
  const now = useCallback(
    () =>
      preview && simulatedTime.current
        ? +new Date(simulatedTime.current)
        : Date.now(),
    [preview],
  );
  const reset = useCallback(() => {
    revision.current++;
    clearStoredRoute();
    setState((previous) => ({
      ...initial(),
      identityKey: previous.identityKey,
      ready: true,
      camera: previous.camera,
    }));
  }, []);
  useEffect(() => {
    revision.current++;
    let saved: StoredRoute | null = null;
    let storageError = "";
    try {
      const raw = localStorage.getItem(ACTIVE_ROUTE_KEY);
      saved = !preview
        ? restoreRoute(raw, { ownerId, instanceId, seasonId }, now())
        : null;
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
            phase: "active" as const,
            parameters: saved.parameters,
            result: saved.result,
            sheet: saved.sheet,
            camera: saved.camera,
            createdAt: saved.createdAt,
          }
        : {}),
    });
    return bumpRevision;
  }, [ownerId, instanceId, seasonId, preview, now, bumpRevision, identityKey]);

  useEffect(() => {
    if (!state.ready || state.identityKey !== identityKey || preview) return;
    if (
      state.phase !== "active" ||
      !state.parameters ||
      !state.result?.stops.length
    ) {
      clearStoredRoute();
      return;
    }
    const saved: StoredRoute = {
      format: 1,
      ownerId,
      instanceId,
      seasonId,
      parameters: state.parameters,
      result: state.result,
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
    state.phase,
    state.parameters,
    state.result,
    state.createdAt,
    state.sheet,
    state.camera,
    ownerId,
    instanceId,
    seasonId,
    closesAt,
    preview,
    state.identityKey,
    identityKey,
  ]);

  const checkAvailability = useCallback(async () => {
    if (document.visibilityState === "hidden") return;
    const snapshot = current.current;
    if (
      snapshot.identityKey !== identityKey ||
      snapshot.phase !== "active" ||
      !snapshot.result?.stops.length ||
      !snapshot.parameters
    )
      return;
    if (checking.current) {
      if (snapshot.result.geometry !== checkingGeometry.current)
        pendingCheck.current = true;
      return;
    }
    if (
      now() >= Math.min(+new Date(snapshot.parameters.end), +new Date(closesAt))
    ) {
      reset();
      return;
    }
    const token = revision.current;
    checking.current = true;
    checkingGeometry.current = snapshot.result.geometry;
    setState((s) => ({ ...s, checking: true }));
    try {
      const availability = await api<RouteAvailability>(
        preview ? "route/availability?preview=1" : "route/availability",
        {
          instanceId,
          seasonId,
          activities: snapshot.parameters.activities,
          maxFear: snapshot.parameters.maxFear,
          steps: snapshot.result.stops.map((s) => ({
            id: s.house.id,
            arrival: s.arrival,
            departure: s.departure,
            key: houseTravelKey(s.house),
          })),
        },
      );
      if (token !== revision.current) return;
      if (!availability.valid) {
        reset();
        return;
      }
      if (
        availability.steps.length !== snapshot.result.stops.length ||
        snapshot.result.stops.some(
          (s) => !availability.steps.some((a) => a.id === s.house.id),
        )
      )
        throw new Error("Vérification du parcours incomplète. Réessayez.");
      setState((s) => {
        if (!s.result) return s;
        const annotated = annotateAvailability(s.result, availability);
        const changed = annotated.stops.some(
          (stop, n) =>
            !!stop.unavailable !== !!s.result!.stops[n].unavailable ||
            JSON.stringify(stop.house.activities) !==
              JSON.stringify(s.result!.stops[n].house.activities),
        );
        return {
          ...s,
          result: changed ? annotated : s.result,
          unavailable: availability.steps.filter((s) => !s.available),
          verified: true,
          error: "",
        };
      });
    } catch (e) {
      if (token === revision.current)
        setState((s) => ({
          ...s,
          verified: false,
          error: (e as Error).message,
        }));
    } finally {
      checking.current = false;
      if (token === revision.current)
        setState((s) => ({ ...s, checking: false }));
      if (pendingCheck.current) {
        pendingCheck.current = false;
        queueMicrotask(() => void checkCallback.current());
      }
    }
  }, [instanceId, seasonId, closesAt, preview, now, reset, identityKey]);
  useEffect(() => {
    checkCallback.current = checkAvailability;
  }, [checkAvailability]);

  useEffect(() => {
    if (state.phase !== "active") return;
    let stopWatch: (() => void) | undefined;
    const syncGPS = () => {
      stopWatch?.();
      stopWatch = undefined;
      if (document.visibilityState === "hidden") {
        setState((s) => ({ ...s, gpsState: "paused" }));
        return;
      }
      setState((s) => ({ ...s, gpsState: "searching", gpsError: "" }));
      stopWatch = watchCurrentPosition(
        navigator.geolocation,
        (position) =>
          setState((s) => ({
            ...s,
            currentPosition: position.point,
            accuracy: position.accuracy,
            gpsState: position.accuracy > 50 ? "low-accuracy" : "tracking",
            gpsError: "",
          })),
        (error) =>
          setState((s) => ({
            ...s,
            gpsState: error.code === 1 ? "denied" : "unavailable",
            gpsError: error.message,
          })),
      );
    };
    syncGPS();
    document.addEventListener("visibilitychange", syncGPS);
    window.addEventListener("pageshow", syncGPS);
    return () => {
      stopWatch?.();
      document.removeEventListener("visibilitychange", syncGPS);
      window.removeEventListener("pageshow", syncGPS);
    };
  }, [state.phase]);

  useEffect(() => {
    if (state.phase !== "active") return;
    let interval: ReturnType<typeof setInterval> | undefined;
    const sync = () => {
      if (interval) clearInterval(interval);
      interval = undefined;
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

  // Expiration is independent of the network and also applies to prepared routes.
  useEffect(() => {
    if (!state.parameters || !state.result) return;
    const expire = () => {
      if (
        now() >= Math.min(+new Date(state.parameters!.end), +new Date(closesAt))
      )
        reset();
    };
    const timer = setInterval(expire, 1000);
    return () => clearInterval(timer);
  }, [state.parameters, state.result, closesAt, now, reset]);

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
            result: null,
            parameters: null,
            error: "",
          },
    );
  }, []);
  const calculateRoute = useCallback(
    async (parameters: RouteParameters) => {
      const token = ++inputRevision.current;
      const generation = revision.current;
      const result = await api<RouteResult>(
        preview ? "route?preview=1" : "route",
        parameters,
      );
      if (token !== inputRevision.current || generation !== revision.current)
        return;
      revision.current++;
      clearStoredRoute();
      setState((s) => ({
        ...s,
        phase: "calculated",
        parameters,
        result,
        unavailable: [],
        verified: false,
        checking: false,
        error: "",
        createdAt: new Date().toISOString(),
        sheet: "expanded",
        currentPosition: null,
        accuracy: null,
        gpsState: "idle",
        gpsError: "",
        recenterTarget: null,
        recalculating: false,
      }));
    },
    [preview],
  );
  const startRoute = useCallback(() => {
    if (!current.current.result?.stops.length) return;
    setState((s) => ({
      ...s,
      phase: "active",
      verified: false,
      sheet: "intermediate",
    }));
  }, []);
  const recalculateRoute = useCallback(async () => {
    const snapshot = current.current;
    if (!snapshot.parameters || !snapshot.result || snapshot.recalculating)
      return;
    const token = ++revision.current;
    setState((s) => ({ ...s, recalculating: true, error: "" }));
    try {
      const parameters: RouteParameters = {
        ...snapshot.parameters,
        start: new Date(
          Math.max(+new Date(snapshot.parameters.start), now()),
        ).toISOString(),
        excludedHouseIds: [
          ...new Set([
            ...snapshot.parameters.excludedHouseIds,
            ...snapshot.unavailable.map((s) => s.id),
          ]),
        ],
      };
      const result = await api<RouteResult>(
        preview ? "route?preview=1" : "route",
        parameters,
      );
      if (token !== revision.current) return;
      // One update replaces the entire result: no old geometry with new stops.
      setState((s) => ({
        ...s,
        parameters,
        result,
        unavailable: [],
        error: "",
        verified: false,
        checking: false,
        selectedHouse: null,
        selectedStepId: null,
        phase: result.stops.length ? s.phase : "calculated",
        ...(result.stops.length
          ? {}
          : {
              currentPosition: null,
              accuracy: null,
              gpsState: "idle" as const,
              gpsError: "",
              recenterTarget: null,
            }),
      }));
    } catch (e) {
      if (token === revision.current)
        setState((s) => ({ ...s, error: (e as Error).message }));
    } finally {
      if (token === revision.current)
        setState((s) => ({ ...s, recalculating: false }));
    }
  }, [preview, now]);
  // Replacements during an active route must be checked without waiting a minute.
  useEffect(() => {
    if (state.phase === "active") void checkAvailability();
  }, [state.result?.geometry, state.phase, checkAvailability]);
  const selectHouse = useCallback(
    (house: PublicHouse | null) =>
      setState((s) => ({
        ...s,
        selectedHouse: house,
        selectedStepId:
          house && s.result?.stops.some((stop) => stop.house.id === house.id)
            ? house.id
            : null,
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
  return {
    ...state,
    notification: state.unavailable.length
      ? "Une maison de votre parcours n’est plus disponible"
      : "",
    nextStep: state.result?.stops.find((s) => !s.unavailable) ?? null,
    calculateRoute,
    startRoute,
    recalculateRoute,
    checkAvailability,
    invalidate,
    selectHouse,
    setSheet,
    setCamera,
    recenterCurrentPosition,
    deletePreparedRoute: reset,
    stopActiveRoute: reset,
    getRevision: () => revision.current,
  };
}
