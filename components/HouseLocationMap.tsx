"use client";
import { useEffect, useRef, useState } from "react";
import type { Map as MapType, Marker as MarkerType } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
export default function HouseLocationMap({
  center,
  point,
  choosing,
  onPoint,
  styleUrl,
}: {
  center: [number, number];
  point: [number, number] | null;
  choosing: boolean;
  onPoint: (point: [number, number]) => void;
  styleUrl: string;
}) {
  const element = useRef<HTMLDivElement>(null),
    map = useRef<MapType | null>(null),
    marker = useRef<MarkerType | null>(null);
  const callback = useRef(onPoint),
    enabled = useRef(choosing),
    initial = useRef({ center, point, styleUrl });
  const [loaded, setLoaded] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    callback.current = onPoint;
    enabled.current = choosing;
    marker.current?.setDraggable(choosing);
  }, [onPoint, choosing]);
  useEffect(() => {
    let stopped = false;
    void import("maplibre-gl").then((m) => {
      if (stopped || !element.current) return;
      try {
        m.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
        const g = new m.Map({
          container: element.current,
          style: initial.current.styleUrl,
          center: initial.current.point ?? initial.current.center,
          zoom: initial.current.point ? 17 : 13,
          attributionControl: { compact: true },
        });
        map.current = g;
        g.addControl(
          new m.NavigationControl({ showCompass: false }),
          "top-right",
        );
        const observer = new ResizeObserver(() => g.resize());
        observer.observe(element.current);
        g.on("remove", () => observer.disconnect());
        g.on("load", () => {
          if (!stopped) setLoaded(true);
        });
        g.on("click", (e) => {
          if (enabled.current) callback.current([e.lngLat.lng, e.lngLat.lat]);
        });
        g.on("error", () => {
          if (!stopped)
            setError(
              "Fond de carte indisponible. Réessayez ou utilisez les coordonnées ci-dessous.",
            );
        });
      } catch {
        setError(
          "La carte n’est pas disponible dans ce navigateur. Utilisez les coordonnées ci-dessous.",
        );
      }
    });
    return () => {
      stopped = true;
      marker.current?.remove();
      map.current?.remove();
      map.current = null;
    };
  }, []);
  useEffect(() => {
    if (!loaded || !map.current || !point) return;
    let stopped = false;
    void import("maplibre-gl").then((m) => {
      if (stopped || !map.current) return;
      if (!marker.current) {
        const pin = document.createElement("button");
        pin.type = "button";
        pin.className = "participation-pin";
        pin.setAttribute("aria-label", "Point de ma maison");
        pin.textContent = "●";
        marker.current = new m.Marker({
          element: pin,
          draggable: enabled.current,
        })
          .setLngLat(point)
          .addTo(map.current);
        marker.current.on("dragend", () => {
          const p = marker.current!.getLngLat();
          callback.current([p.lng, p.lat]);
        });
      } else marker.current.setLngLat(point);
      map.current.jumpTo({
        center: point,
        zoom: Math.max(map.current.getZoom(), 16),
      });
    });
    return () => {
      stopped = true;
    };
  }, [point, loaded]);
  return (
    <div className={"participation-map" + (choosing ? " is-choosing" : "")}>
      <div
        ref={element}
        className="participation-map-canvas"
        aria-label="Position de votre maison sur la carte"
      />
      {error && (
        <p role="status" className="participation-map-error">
          {error}
        </p>
      )}
    </div>
  );
}
