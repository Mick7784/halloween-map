import Link from "next/link";
import ManorMark from "./ManorMark";

export default function PublicBrand({
  compact = false,
  territory,
}: {
  compact?: boolean;
  territory?: string;
}) {
  return (
    <Link
      href="/"
      className={compact ? "home-brand" : "brand"}
      aria-label="Halloween — accueil"
    >
      <span className={compact ? "home-brand-mark" : "brand-mark"}>
        <ManorMark />
      </span>
      <span>
        <strong>Halloween Map</strong>
        <small>CARTE DES MAISONS</small>
        {!compact && <em>{territory ?? "Une commune plus vivante"}</em>}
      </span>
    </Link>
  );
}
