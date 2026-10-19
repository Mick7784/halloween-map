import type { ReactNode } from "react";

/**
 * Shared row action layout. The caller owns permissions, intent, confirmation,
 * and which actions are sensitive; the component only groups visible controls.
 */
export default function StudioRowActions({
  label,
  actions,
  sensitive,
}: {
  label: string;
  actions: ReactNode;
  sensitive?: ReactNode;
}) {
  return (
    <div className="beta-actions season-row-actions studio-row-actions" role="group" aria-label={label}>
      <div className="studio-row-actions-main">{actions}</div>
      {sensitive && (
        <div className="studio-row-actions-sensitive" role="group" aria-label="Actions sensibles">
          {sensitive}
        </div>
      )}
    </div>
  );
}
