"use client";
import { useEffect, useRef, useState } from "react";
import "./CollectionProgress.css";

export default function CollectionProgress({
  visited,
  selected,
}: {
  visited: number;
  selected: number;
}) {
  const percent =
    selected > 0
      ? Math.min(100, Math.max(0, Math.round((visited / selected) * 100)))
      : 0;
  const previous = useRef(percent);
  const [pulse, setPulse] = useState(false);
  useEffect(() => {
    const completed = percent === 100 && previous.current < 100;
    previous.current = percent;
    setPulse(completed);
    if (!completed) return;
    const timer = setTimeout(() => setPulse(false), 650);
    return () => clearTimeout(timer);
  }, [percent]);
  return (
    <div
      className={"collection-potion" + (pulse ? " is-complete" : "")}
      role="progressbar"
      aria-label="Progression de la collecte"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      aria-valuetext={`${percent} % · ${visited}/${selected} maisons validées`}
    >
      <div
        className="collection-potion-fill"
        style={{ width: `${percent}%` }}
        aria-hidden="true"
      >
        {percent > 0 && (
          <>
            <span className="potion-wave" />
            <i />
            <i />
            <i />
          </>
        )}
      </div>
      <span className="collection-potion-label" aria-hidden="true">
        {percent} %
      </span>
    </div>
  );
}
