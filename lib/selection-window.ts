import { mapAccessible, type Season } from "./domain";
import type { RouteInput } from "./routing";
export function validateRouteWindow(
  season: Season,
  input: RouteInput,
  now: Date,
) {
  if (!mapAccessible(season, now)) throw new Error("La carte est fermée");
  const start = +new Date(input.start),
    end = +new Date(input.end);
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    end <= start ||
    start < +now - 60000 ||
    (!season.is_test &&
      (start < +new Date(season.opens_at) || end > +new Date(season.closes_at)))
  )
    throw new Error("Fenêtre de parcours invalide");
}
