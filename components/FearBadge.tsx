import { Ghost, HeartHandshake } from "lucide-react";
import { fears } from "./common";

export const adaptedFearExplanation =
  "Les habitants adaptent l’intensité des frayeurs à l’âge et à la sensibilité des visiteurs.";

export function AdaptedFearIcon({ size = 15 }: { size?: number }) {
  return (
    <HeartHandshake size={size} aria-hidden="true" style={{ flexShrink: 0 }} />
  );
}

export function fearDescription(
  fear: number | null,
  adaptable: boolean,
  labels = fears,
) {
  return adaptable
    ? `Frissons adaptés — ${adaptedFearExplanation}`
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
        <AdaptedFearIcon />
      ) : (
        <>
          <Ghost size={15} aria-hidden="true" />
          <span aria-hidden="true">{fear === null ? "?" : `${fear}/5`}</span>
        </>
      )}
    </span>
  );
}
