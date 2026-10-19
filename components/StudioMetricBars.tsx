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
  const isMeasured = (value: number | null | undefined): value is number =>
    typeof value === "number" && Number.isFinite(value);
  const available = items.filter(([, value]) => isMeasured(value));
  const maximum = Math.max(1, ...available.map(([, value]) => value ?? 0));
  return (
    <section className="beta-card stats-chart studio-metric-bars" aria-label={title}>
      <h2>{title}</h2>
      {!available.length ? (
        <p className="muted">{unavailable}</p>
      ) : (
        <ul>
          {items.map(([label, value]) => (
            <li key={label}>
              <span>{label}</span>
              <strong>{formatValue(value)}</strong>
              {chart && isMeasured(value) && (
                <div className="stats-track" aria-hidden="true">
                  <div style={{ width: `${Math.min(100, Math.max(0, (value / maximum) * 100))}%` }} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {chart && available.length > 0 && (
        <p className="small muted">Échelle relative : 0 à {maximum} {unit}.</p>
      )}
    </section>
  );
}
