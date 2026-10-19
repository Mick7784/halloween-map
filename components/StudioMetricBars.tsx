/**
 * Reusable Studio metric comparison block: framework view only, no app data
 * source, permission, seasonal semantics or preselected business metrics.
 * Caller supplies localized display labels and missing-value wording.
 */
export type StudioBarItem = readonly [label: string, value: number | null | undefined];

export function StudioMetricBars({
  title,
  items,
  formatValue,
  unavailable,
  chart = true,
  unit = "éléments",
}: {
  title: string;
  items: readonly StudioBarItem[];
  formatValue: (value: number | null | undefined) => string;
  unavailable: string;
  chart?: boolean;
  unit?: string;
}) {
  // A comparison bar starts at zero and represents non-negative quantities.
  // Zero is measured; null, undefined, NaN, Infinity and negatives are not.
  const isMeasured = (value: number | null | undefined): value is number =>
    typeof value === "number" && Number.isFinite(value) && value >= 0;
  const available = items.filter(([, value]) => isMeasured(value));
  const maximum = Math.max(0, ...available.map(([, value]) => value ?? 0));
  const denominator = maximum || 1;
  return (
    <section className="beta-card stats-chart studio-metric-bars" aria-label={title}>
      <h2>{title}</h2>
      {!available.length ? (
        <p className="muted">{unavailable}</p>
      ) : (
        <ul>
          {items.map(([label, value]) => (
            <li key={label} data-measurement={isMeasured(value) ? "measured" : "unavailable"}>
              <span>{label}</span>
              <strong>{isMeasured(value) ? formatValue(value) : unavailable}</strong>
              {chart && isMeasured(value) && (
                <div className="stats-track" aria-hidden="true">
                  <div style={{ width: `${(value / denominator) * 100}%` }} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {chart && available.length > 0 && (
        <p className="small muted studio-chart-note">
          {maximum === 0
            ? "Toutes les valeurs mesurées sont à 0."
            : <>Échelle relative : 0 à {maximum} {unit}.</>}
          {available.length !== items.length && (
            <> Certaines valeurs ne sont pas disponibles.</>
          )}
        </p>
      )}
    </section>
  );
}
