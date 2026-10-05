export type LocatedOrigin = { point: [number, number]; accuracy: number };
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
        const { latitude, longitude, accuracy } = p.coords;
        if (
          !Number.isFinite(latitude) ||
          !Number.isFinite(longitude) ||
          Math.abs(latitude) > 90 ||
          Math.abs(longitude) > 180 ||
          !Number.isFinite(accuracy) ||
          accuracy < 0
        ) {
          reject(
            new Error(
              "La position reçue est invalide. Choisissez le départ sur la carte.",
            ),
          );
          return;
        }
        resolve({ point: [longitude, latitude], accuracy });
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
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    ),
  );
}
