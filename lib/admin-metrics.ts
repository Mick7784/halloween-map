export const unavailableMetric = "Donnée non disponible";
export type Metric = number | null | undefined;
export const measured = (value: Metric): value is number =>
  typeof value === "number" && Number.isFinite(value);
const number = (value: number, maximumFractionDigits = 1) =>
  new Intl.NumberFormat("fr-FR", { maximumFractionDigits }).format(value);
export const formatCount = (value: Metric) =>
  measured(value) ? number(value, 0) : unavailableMetric;
export const formatDistance = (meters: Metric) =>
  measured(meters) ? number(meters / 1000) + " km" : unavailableMetric;
export const formatDuration = (seconds: Metric) =>
  measured(seconds) ? number(seconds / 60) + " min" : unavailableMetric;
export const formatPercent = (ratio: Metric) =>
  measured(ratio) ? number(ratio * 100) + " %" : unavailableMetric;
export const average = (total: Metric, count: Metric) =>
  measured(total) && measured(count) && count > 0 ? total / count : undefined;
export const metricLabels = {
  participants: "Participants uniques",
  houses: "Maisons inscrites",
  approved: "Maisons validées",
  pending: "Maisons en attente",
  visited: "Maisons visitées",
  routes: "Parcours préparés",
  started: "Collectes lancées",
  finished: "Collectes terminées",
  distance: "Distance totale déclarée",
};
