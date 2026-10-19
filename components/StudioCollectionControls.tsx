import type { ReactNode } from "react";
import { Button } from "./ui";

/**
 * Studio collection controls: shared layout, visible count, and reset affordance.
 * Filtering, permissions, mutations, column definitions and paging state
 * remain exclusively owned by each product screen.
 */
export default function StudioCollectionControls({
  label,
  count,
  filtered,
  onReset,
  children,
}: {
  label: string;
  count: number;
  filtered: boolean;
  onReset: () => void;
  children?: ReactNode;
}) {
  return (
    <div className="studio-collection-controls" role="group" aria-label={label}>
      <div className="studio-collection-fields">{children}</div>
      <div className="studio-collection-summary">
        <span role="status" aria-live="polite">
          {count} {count === 1 ? "résultat" : "résultats"}
        </span>
        <Button
          type="button"
          className="studio-collection-reset"
          disabled={!filtered}
          onClick={onReset}
        >
          Effacer les filtres
        </Button>
      </div>
    </div>
  );
}
