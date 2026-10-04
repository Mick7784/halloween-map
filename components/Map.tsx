"use client";
import { useEffect, useRef, useState } from "react";
import type { Map as MapType } from "maplibre-gl";
import type { Feature, LineString } from "geojson";
import "maplibre-gl/dist/maplibre-gl.css";
import type { PublicHouse } from "./common";
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
}: {
  houses: PublicHouse[];
  center: [number, number];
  zoom: number;
  styleUrl: string;
  onSelect?: (h: PublicHouse) => void;
  onPoint?: (lat: number, lng: number) => void;
  geometry?: number[][];
}) {
  const el = useRef<HTMLDivElement>(null),
    map = useRef<MapType | null>(null),
    [loaded, setLoaded] = useState(false),
    [error, setError] = useState("");
  const pointCallback = useRef(onPoint);
  useEffect(() => {
    pointCallback.current = onPoint;
  }, [onPoint]);
  const initial = useRef({ center, zoom, styleUrl });
  useEffect(() => {
    let stopped = false;
    import("maplibre-gl").then((m) => {
      if (stopped || !el.current) return;
      try {
        m.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
        const g = new m.Map({
          container: el.current,
          style: initial.current.styleUrl,
          center: initial.current.center,
          zoom: initial.current.zoom,
          attributionControl: { compact: true },
        });
        map.current = g;
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
      for (const h of houses) {
        const button = document.createElement("button");
        button.className = "house-marker";
        button.setAttribute("aria-label", h.name);
        button.innerHTML = houseSVG;
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
  }, [houses, loaded, onSelect]);
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
        id: "route-line",
        type: "line",
        source: "route",
        paint: {
          "line-color": "#b099da",
          "line-width": 4,
          "line-dasharray": [2, 1],
        },
      });
    }
  }, [geometry, loaded]);
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
