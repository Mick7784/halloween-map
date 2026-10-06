"use client";
import { useEffect, useRef, useState } from "react";
import type { Map as MapType } from "maplibre-gl";
import type { Feature, LineString } from "geojson";
import "maplibre-gl/dist/maplibre-gl.css";
import type { PublicHouse } from "./common";
import { frameRoute, mapPadding } from "../lib/map-framing";
import type { MapCamera, SheetPosition } from "../lib/active-route";
const houseSVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 36" width="30" height="34"><path d="M3 16 16 3l13 13M7 14v17h18V14" fill="#252125" stroke="#ff922f" stroke-width="3" stroke-linejoin="round"/><path d="M13 31V21h6v10M11 15h3m4 0h3" stroke="#ff922f" stroke-width="2"/></svg>';
export default function MapView({
  houses,
  center,
  zoom,
  styleUrl,
  onSelect,
  onPoint,
  geometry,
  origin,
  focusToken = 0,
  routeSteps = [],
  routePanelOpen = false,
  initialCamera,
  onCameraChange,
  sheetPosition,
  currentPosition,
  recenterTarget,
  unavailableIds = [],
  selectedStepId,
}: {
  houses: (PublicHouse & { status?: string })[];
  center: [number, number];
  zoom: number;
  styleUrl: string;
  onSelect?: (h: PublicHouse) => void;
  onPoint?: (lat: number, lng: number) => void;
  geometry?: number[][];
  origin?: [number, number];
  focusToken?: number;
  routeSteps?: PublicHouse[];
  routePanelOpen?: boolean;
  initialCamera?: MapCamera | null;
  onCameraChange?: (camera: MapCamera) => void;
  sheetPosition?: SheetPosition;
  currentPosition?: [number, number] | null;
  recenterTarget?: { point: [number, number]; token: number } | null;
  unavailableIds?: string[];
  selectedStepId?: string | null;
}) {
  const el = useRef<HTMLDivElement>(null),
    map = useRef<MapType | null>(null),
    [loaded, setLoaded] = useState(false),
    [error, setError] = useState("");
  const pointCallback = useRef(onPoint);
  useEffect(() => {
    pointCallback.current = onPoint;
  }, [onPoint]);
  const initial = useRef({ center, zoom, styleUrl, camera: initialCamera });
  const cameraCallback = useRef(onCameraChange);
  useEffect(() => {
    cameraCallback.current = onCameraChange;
  }, [onCameraChange]);
  const framing = useRef({ origin, routeSteps, routePanelOpen });
  useEffect(() => {
    framing.current = { origin, routeSteps, routePanelOpen };
  }, [origin, routeSteps, routePanelOpen]);
  const framedGeometry = useRef(geometry);
  const restoredCamera = useRef(!!initialCamera);
  const livePosition = useRef(currentPosition);
  const liveMarker = useRef<import("maplibre-gl").Marker | null>(null);
  const hasCurrentPosition = !!currentPosition;
  useEffect(() => {
    livePosition.current = currentPosition;
  }, [currentPosition]);
  useEffect(() => {
    let stopped = false;
    import("maplibre-gl").then((m) => {
      if (stopped || !el.current) return;
      try {
        m.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
        const g = new m.Map({
          container: el.current,
          style: initial.current.styleUrl,
          center: initial.current.camera?.center ?? initial.current.center,
          zoom: initial.current.camera?.zoom ?? initial.current.zoom,
          bearing: initial.current.camera?.bearing ?? 0,
          pitch: initial.current.camera?.pitch ?? 0,
          attributionControl: { compact: true },
        });
        map.current = g;
        g.on("moveend", () =>
          cameraCallback.current?.({
            center: [g.getCenter().lng, g.getCenter().lat],
            zoom: g.getZoom(),
            bearing: g.getBearing(),
            pitch: g.getPitch(),
          }),
        );
        const observer = new ResizeObserver(() => g.resize());
        observer.observe(el.current);
        g.on("remove", () => observer.disconnect());
        g.addControl(
          new m.NavigationControl({ showCompass: false }),
          "top-right",
        );
        g.on("load", () => {
          if (!stopped) setLoaded(true);
        });
        g.on("error", (event) => {
          console.warn("Map resource:", event.error.message);
          if (!stopped)
            setError(
              "Fond de carte indisponible. Les maisons restent consultables dans la liste.",
            );
        });
        g.on("click", (e) =>
          pointCallback.current?.(e.lngLat.lat, e.lngLat.lng),
        );
      } catch {
        setError(
          "Votre navigateur ne peut pas afficher la carte. Consultez la liste des maisons.",
        );
      }
    });
    return () => {
      stopped = true;
      map.current?.remove();
      map.current = null;
    };
  }, []);
  useEffect(() => {
    if (!loaded || !map.current) return;
    const g = map.current;
    let cancelled = false;
    const markers: import("maplibre-gl").Marker[] = [];
    import("maplibre-gl").then((m) => {
      if (cancelled) return;
      const combined: (PublicHouse & { status?: string })[] = [
        ...houses,
        ...routeSteps.filter((h) => !houses.some((item) => item.id === h.id)),
      ];
      for (const h of combined) {
        const step = routeSteps.findIndex((stop) => stop.id === h.id);
        const button = document.createElement("button");
        button.className =
          "house-marker" +
          (h.status === "HIDDEN" ? " hidden-house" : "") +
          (step >= 0 ? " route-house" : "") +
          (unavailableIds.includes(h.id) ? " is-unavailable" : "") +
          (selectedStepId === h.id ? " is-selected" : "");
        if (h.status === "HIDDEN") button.title = "Masquée · " + h.name;
        button.setAttribute(
          "aria-label",
          step >= 0 ? `Étape ${step + 1} · ${h.name}` : h.name,
        );
        const visual = document.createElement("span");
        visual.className = "house-marker-visual";
        visual.innerHTML = houseSVG;
        button.append(visual);
        if (step >= 0) {
          const badge = document.createElement("span");
          badge.className = "route-marker-number";
          badge.textContent = String(step + 1);
          visual.append(badge);
        }
        button.onclick = (e) => {
          e.stopPropagation();
          onSelect?.(h);
        };
        markers.push(
          new m.Marker({ element: button, anchor: "bottom" })
            .setLngLat([h.longitude, h.latitude])
            .addTo(g),
        );
      }
    });
    return () => {
      cancelled = true;
      markers.forEach((m) => m.remove());
    };
  }, [houses, loaded, onSelect, routeSteps, unavailableIds, selectedStepId]);
  useEffect(() => {
    const g = map.current;
    if (!loaded || !g) return;
    const data: Feature<LineString> = {
      type: "Feature",
      properties: {},
      geometry: {
        type: "LineString",
        coordinates: geometry && geometry.length > 1 ? geometry : [],
      },
    };
    if (g.getSource("route"))
      (g.getSource("route") as import("maplibre-gl").GeoJSONSource).setData(
        data,
      );
    else {
      g.addSource("route", { type: "geojson", data });
      g.addLayer({
        id: "route-halo",
        type: "line",
        source: "route",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": "#101216",
          "line-width": 8,
          "line-opacity": 0.85,
        },
      });
      g.addLayer({
        id: "route-line",
        type: "line",
        source: "route",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": "#b099da",
          "line-width": 4,
          "line-opacity": 0.95,
        },
      });
    }
  }, [geometry, loaded]);
  useEffect(() => {
    if (!loaded || !map.current || !origin) return;
    const g = map.current;
    let cancelled = false;
    let marker: import("maplibre-gl").Marker | undefined;
    import("maplibre-gl").then((m) => {
      if (cancelled) return;
      const point = document.createElement("div");
      point.className = "origin-marker";
      point.setAttribute("role", "img");
      point.setAttribute("aria-label", "Point de départ retenu");
      marker = new m.Marker({ element: point }).setLngLat(origin).addTo(g);
    });
    return () => {
      cancelled = true;
      marker?.remove();
    };
  }, [loaded, origin]);
  useEffect(() => {
    const g = map.current;
    if (!loaded || !g || !hasCurrentPosition) return;
    let cancelled = false;
    let marker: import("maplibre-gl").Marker | undefined;
    import("maplibre-gl").then((m) => {
      if (cancelled || !livePosition.current) return;
      const point = document.createElement("div");
      point.className = "current-position-marker";
      point.setAttribute("role", "img");
      point.setAttribute("aria-label", "Position GPS actuelle");
      marker = new m.Marker({ element: point })
        .setLngLat(livePosition.current)
        .addTo(g);
      liveMarker.current = marker;
    });
    return () => {
      cancelled = true;
      marker?.remove();
      liveMarker.current = null;
    };
  }, [loaded, hasCurrentPosition]);
  useEffect(() => {
    if (currentPosition) liveMarker.current?.setLngLat(currentPosition);
  }, [currentPosition]);
  useEffect(() => {
    const g = map.current;
    if (!loaded || !g || !recenterTarget) return;
    g.easeTo({
      center: recenterTarget.point,
      duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? 0
        : 450,
    });
  }, [loaded, recenterTarget]);
  useEffect(() => {
    if (!loaded || !map.current || !origin || !focusToken) return;
    const routePanelOpen = framing.current.routePanelOpen;
    map.current.easeTo({
      center: origin,
      zoom: 16,
      padding: mapPadding(
        map.current.getContainer(),
        routePanelOpen && window.innerWidth < 768
          ? document.getElementById("parcours")?.getBoundingClientRect().top
          : undefined,
      ),
      duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? 0
        : 450,
    });
  }, [loaded, origin, focusToken]);
  useEffect(() => {
    if (!loaded || !map.current || !geometry?.length) return;
    if (restoredCamera.current && framedGeometry.current === geometry) return;
    restoredCamera.current = false;
    framedGeometry.current = geometry;
    const { origin, routeSteps, routePanelOpen } = framing.current;
    frameRoute(
      map.current,
      geometry,
      origin,
      routeSteps,
      routePanelOpen,
      window.innerWidth < 768,
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      document.getElementById("parcours")?.getBoundingClientRect().top,
      document.getElementById("parcours")?.getBoundingClientRect().right,
    );
  }, [loaded, geometry]);
  useEffect(() => {
    const g = map.current;
    if (!loaded || !g) return;
    const panel = document.getElementById("parcours");
    let pendingResize = false;
    const afterMovement = () => {
      pendingResize = false;
      resize();
    };
    const resize = () => {
      // Updating padding with jumpTo during fitBounds cancels its animation.
      // Preserve the current camera adjustment and apply panel padding afterward.
      if (g.isMoving()) {
        if (!pendingResize) {
          pendingResize = true;
          g.once("moveend", afterMovement);
        }
        return;
      }
      const padding = mapPadding(
        g.getContainer(),
        routePanelOpen && window.innerWidth < 768
          ? panel?.getBoundingClientRect().top
          : undefined,
        routePanelOpen && window.innerWidth >= 768
          ? panel?.getBoundingClientRect().right
          : undefined,
      );
      const old = g.getPadding();
      if (
        old.bottom === padding.bottom &&
        old.top === padding.top &&
        old.left === padding.left &&
        old.right === padding.right
      )
        return;
      g.jumpTo({
        center: g.getCenter(),
        zoom: g.getZoom(),
        bearing: g.getBearing(),
        pitch: g.getPitch(),
        padding,
      });
    };
    resize();
    const observer = new ResizeObserver(resize);
    if (panel) observer.observe(panel);
    window.addEventListener("resize", resize);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", resize);
      g.off("moveend", afterMovement);
    };
  }, [loaded, routePanelOpen, sheetPosition]);
  return (
    <div className="map-shell">
      <div
        ref={el}
        className="map-canvas"
        aria-label="Carte des maisons participantes"
      />
      {error && (
        <p className="map-error" role="status">
          {error}
        </p>
      )}
      {onPoint && (
        <p className="map-hint">Touchez la carte pour choisir le point</p>
      )}
    </div>
  );
}
