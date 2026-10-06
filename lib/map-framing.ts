import type { Map } from "maplibre-gl";
export function mapPadding(
  container: HTMLElement,
  panelTop?: number,
  panelRight?: number,
) {
  const box = container.getBoundingClientRect();
  return {
    top: 45,
    left:
      panelRight === undefined
        ? 45
        : Math.max(45, Math.min(box.width - 100, panelRight - box.left + 20)),
    right: 45,
    bottom:
      panelTop === undefined
        ? 45
        : Math.max(45, Math.min(box.height - 100, box.bottom - panelTop + 35)),
  };
}
export function frameRoute(
  map: Pick<Map, "fitBounds" | "getContainer">,
  geometry: number[][],
  origin: [number, number] | undefined,
  stops: { longitude: number; latitude: number }[],
  panelOpen: boolean,
  mobile: boolean,
  reducedMotion: boolean,
  panelTop?: number,
  panelRight?: number,
) {
  const points = [
    ...geometry,
    ...(origin ? [origin] : []),
    ...stops.map((s) => [s.longitude, s.latitude]),
  ];
  if (!points.length) return;
  const xs = points.map((p) => p[0]),
    ys = points.map((p) => p[1]);
  map.fitBounds(
    [
      [Math.min(...xs), Math.min(...ys)],
      [Math.max(...xs), Math.max(...ys)],
    ],
    {
      padding: mapPadding(
        map.getContainer(),
        mobile && panelOpen ? panelTop : undefined,
        !mobile && panelOpen ? panelRight : undefined,
      ),
      maxZoom: 16,
      // MapLibre 6 otherwise adds fit padding to an in-flight GPS recenter's
      // existing padding, which can leave no usable viewport and skip the fit.
      absolutePadding: true,
      linear: true,
      duration: reducedMotion ? 0 : 500,
    },
  );
}
