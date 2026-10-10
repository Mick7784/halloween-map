import { effectiveActivities, type House } from "./domain";
type Managed = House & {
  season_is_test?: boolean;
  season_opens_at?: string;
  season_closes_at?: string;
};
export function houseAvailability(h: Managed, now = Date.now(), active = true) {
  if (h.review_status && h.review_status !== "VALIDATED") return "Non publiée";
  if (h.status !== "VISIBLE") return "Masquée au public";
  if (!active) return "Saison inactive";
  if (
    !h.season_is_test &&
    h.season_opens_at &&
    now < +new Date(h.season_opens_at)
  )
    return "Carte pas encore ouverte";
  if (
    !h.season_is_test &&
    h.season_closes_at &&
    now >= +new Date(h.season_closes_at)
  )
    return "Événement terminé";
  if (h.activity === "ENDED" || now >= +new Date(h.ends_at)) return "Fermée";
  if (now < +new Date(h.starts_at)) return "Pas encore ouverte";
  if (h.activity === "PAUSED") return "En pause";
  return effectiveActivities(h).length
    ? "Ouverte"
    : "Aucune activité disponible";
}
