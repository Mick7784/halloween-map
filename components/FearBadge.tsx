import { Ghost, SlidersHorizontal } from "lucide-react";
import { fears } from "./common";

export function fearDescription(
  fear: number | null,
  adaptable: boolean,
  labels = fears,
) {
  return adaptable
    ? "S’adapte aux visiteurs"
    : fear === null
      ? "Frayeur non précisée"
      : `Frayeur : ${labels[fear - 1] ?? fears[fear - 1]} (${fear}/5)`;
}

export default function FearBadge({
  fear,
  adaptable,
  labels = fears,
}: {
  fear: number | null;
  adaptable: boolean;
  labels?: string[];
}) {
  const label = fearDescription(fear, adaptable, labels);
  return (
    <span className="fear-badge" title={label} aria-label={label}>
      {adaptable ? (
        <SlidersHorizontal size={15} aria-hidden="true" />
      ) : (
        <>
          <Ghost size={15} aria-hidden="true" />
          <span aria-hidden="true">{fear === null ? "?" : `${fear}/5`}</span>
        </>
      )}
    </span>
  );
}
