import Link from "next/link";
import ManorMark from "./ManorMark";

function PumpkinMark() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path d="M25 11C23 7 25 5 29 4" fill="none" stroke="#f3b06e" strokeWidth="3" strokeLinecap="round" />
      <path d="M25 10c-3-5-8-5-8-5 0 5 3 7 7 7" fill="#398044" />
      <path d="M24 12C9 6 3 17 5 31c1 12 11 14 19 12 8 2 18 0 19-12 2-14-4-25-19-19Z" fill="#ff972d" stroke="#ca611f" strokeWidth="1.5" />
      <path d="M15 15C10 18 10 36 17 41M33 15c5 3 5 21-2 26M24 13c-4 9-4 21 0 29" fill="none" stroke="#cf6224" strokeWidth="1.5" opacity=".55" />
      <path d="m11 24 8 1-5 5zm26 0-8 1 5 5zM23 27l-3 7h7z" fill="#180b1c" />
      <path d="M10 34c10 5 18 5 28 0-5 9-22 11-28 0Z" fill="#180b1c" />
      <path d="M17 36v4m14-4v4" stroke="#ff9c36" strokeWidth="2" />
    </svg>
  );
}


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
        {compact ? <PumpkinMark /> : <ManorMark />}
      </span>
      <span>
        <strong>{compact ? <>Halloween <span>Map</span></> : "Halloween Map"}</strong>
        <small>CARTE DES MAISONS</small>
        {!compact && <em>{territory ?? "Une commune plus vivante"}</em>}
      </span>
    </Link>
  );
}
