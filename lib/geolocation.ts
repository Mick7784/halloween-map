export type LocatedOrigin = { point: [number, number]; accuracy: number };
const positionOptions = {
  enableHighAccuracy: true,
  timeout: 15000,
  maximumAge: 0,
};
export function readPosition(p: GeolocationPosition): LocatedOrigin {
  const { latitude, longitude, accuracy } = p.coords;
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180 ||
    !Number.isFinite(accuracy) ||
    accuracy < 0
  )
    throw new Error(
      "La position reçue est invalide. Choisissez le départ sur la carte.",
    );
  return { point: [longitude, latitude], accuracy };
}
export function locateOrigin(
  geolocation: Pick<Geolocation, "getCurrentPosition"> | undefined,
): Promise<LocatedOrigin> {
  if (!geolocation)
    return Promise.reject(
      new Error(
        "La géolocalisation n’est pas disponible. Choisissez le départ sur la carte.",
      ),
    );
  return new Promise((resolve, reject) =>
    geolocation.getCurrentPosition(
      (p) => {
        try {
          resolve(readPosition(p));
        } catch (e) {
          reject(e);
        }
      },
      (e) =>
        reject(
          new Error(
            {
              1: "Localisation refusée. Autorisez-la dans le navigateur ou choisissez sur la carte.",
              2: "Position indisponible. Choisissez le départ sur la carte.",
              3: "La recherche de position a expiré. Réessayez ou choisissez sur la carte.",
            }[e.code] ??
              "Position indisponible. Choisissez le départ sur la carte.",
          ),
        ),
      positionOptions,
    ),
  );
}
export function watchCurrentPosition(
  geolocation: Pick<Geolocation, "watchPosition" | "clearWatch"> | undefined,
  onPosition: (position: LocatedOrigin) => void,
  onError: (error: { code: number; message: string }) => void,
): () => void {
  if (!geolocation) {
    onError({
      code: 2,
      message: "Le suivi GPS est indisponible. Votre parcours reste conservé.",
    });
    return () => {};
  }
  let stopped = false;
  let id: number | undefined;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    if (id !== undefined) geolocation.clearWatch(id);
  };
  try {
    id = geolocation.watchPosition(
      (p) => {
        if (stopped) return;
        try {
          onPosition(readPosition(p));
        } catch {
          onError({
            code: 2,
            message: "Position GPS invalide. Votre parcours reste conservé.",
          });
        }
      },
      (e) => {
        if (stopped) return;
        onError({
          code: e.code,
          message:
            e.code === 1
              ? "Suivi GPS refusé. Autorisez la localisation pour suivre votre position."
              : e.code === 3
                ? "La recherche GPS a expiré. Le suivi reprendra dès qu’une position sera disponible."
                : "Signal GPS indisponible. Votre parcours reste conservé.",
        });
        if (e.code === 1) stop();
      },
      positionOptions,
    );
    if (stopped) geolocation.clearWatch(id);
  } catch {
    onError({
      code: 2,
      message: "Le suivi GPS est indisponible. Votre parcours reste conservé.",
    });
    stop();
  }
  return stop;
}
