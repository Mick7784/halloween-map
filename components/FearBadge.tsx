import { Ghost } from "lucide-react";
import { fears } from "./common";

export const adaptedFearExplanation =
  "Les habitants adaptent l’intensité des frayeurs à l’âge et à la sensibilité des visiteurs.";

export function AdaptedFearIcon({ size = 15 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 3.5c3-1 6-1 9 0v5c0 4-2.5 6-4.5 7C4.5 14.5 2 12.5 2 8.5Z" />
      <path d="M4.5 6.5h.5m3 0h.5M4.5 10c1 1 3 1 4 0" />
      <path d="M13 9c3-1 6-1 9 0v5c0 4-2.5 6-4.5 7-2-1-4.5-3-4.5-7Z" />
      <path d="m15.5 12 .5.5m3 0 .5-.5M15.5 17c1-1 3-1 4 0" />
    </svg>
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
