"use client";
import { useState } from "react";
import { Sparkles, Candy, Drama } from "lucide-react";
import { DateTime } from "luxon";
import type { Activity, Instance, Season, User } from "../lib/domain";
export type PublicHouse = {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  activities: Activity[];
  starts_at: string;
  ends_at: string;
  fear: number | null;
  adaptable: boolean;
  rp: string;
  practical: string;
};
export type PublicState = {
  setupRequired: boolean;
  preview?: boolean;
  instance?: Pick<
    Instance,
    "public_name" | "territory" | "timezone" | "latitude" | "longitude" | "zoom"
  > & { footer: string; defaultOpen: string; defaultClose: string };
  season?:
    | (Pick<Season, "year" | "registrations_open"> & {
        opens_at: string;
        closes_at: string;
      })
    | null;
  state?: string;
  count?: number;
  houses?: PublicHouse[];
  serverTime?: string;
};
export type RouteResult = {
  stops: {
    house: PublicHouse;
    arrival: string;
    departure: string;
    walkingMinutes: number;
  }[];
  distanceMeters: number;
  durationMinutes: number;
  estimatedEnd: string;
  geometry: number[][];
  disclaimer: string;
};
export const labels: Record<string, string> = {
  DECORATION: "Décoration",
  CANDY: "Bonbons",
  ACTING: "Mise en scène",
  PENDING: "En attente",
  APPROVED: "Validée",
  REJECTED: "Refusée",
  DISABLED: "Désactivée",
  ACTIVE: "En activité",
  PAUSED: "En pause",
  ENDED: "Terminée",
  PREPARATION: "Préparation",
  COUNTDOWN: "Compte à rebours",
  MAP_OPEN: "Carte ouverte",
  CLOSED: "Saison terminée",
  ARCHIVED: "Archivée",
  SUPER_ADMIN: "Super Admin",
  LOCAL_ADMIN: "Administrateur local",
  MODERATOR: "Modérateur",
  READ_ONLY: "Lecture seule",
};
export const fears = [
  "Très doux",
  "Familial",
  "Modéré",
  "Frissonnant",
  "Intense",
];
export async function api<T>(path: string, body?: unknown): Promise<T> {
  const r = await fetch("/api/" + path, {
    method: body === undefined ? "GET" : "POST",
    headers:
      body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const data = await r.json();
  if (!r.ok)
    throw new Error(data.error ?? "Impossible de terminer cette action");
  return data;
}
export function time(value: string | Date, zone: string) {
  return DateTime.fromISO(
    typeof value === "string" ? value : value.toISOString(),
  )
    .setZone(zone)
    .toFormat("HH:mm");
}
export function localDate(value: string | Date, zone: string) {
  return DateTime.fromISO(
    typeof value === "string" ? value : value.toISOString(),
  )
    .setZone(zone)
    .toFormat("yyyy-MM-dd'T'HH:mm");
}
export function values(form: HTMLFormElement) {
  return Object.fromEntries(new FormData(form).entries()) as Record<
    string,
    string
  >;
}
export function numeric<T extends Record<string, unknown>>(
  data: T,
  keys: string[],
) {
  const result: Record<string, unknown> = { ...data };
  for (const k of keys) result[k] = Number(result[k]);
  return result;
}
export function Field({
  label,
  name,
  type = "text",
  value,
  required = true,
  min,
  max,
  placeholder,
  maxLength,
}: {
  label: string;
  name: string;
  type?: string;
  value?: string | number;
  required?: boolean;
  min?: string | number;
  max?: string | number;
  placeholder?: string;
  maxLength?: number;
}) {
  return (
    <label className="field">
      <span>
        {label}
        {required && <b className="required"> *</b>}
      </span>
      <input
        name={name}
        type={type}
        defaultValue={value}
        required={required}
        min={min}
        max={max}
        step={type === "number" ? "any" : undefined}
        placeholder={placeholder}
        maxLength={maxLength}
      />
    </label>
  );
}
export function Notice({ error }: { error: string }) {
  return error ? (
    <p className="notice" role="alert">
      {error}
    </p>
  ) : null;
}
export function AsyncButton({
  children,
  onClick,
  danger = false,
}: {
  children: React.ReactNode;
  onClick: () => Promise<void>;
  danger?: boolean;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <>
      <button
        type="button"
        className={danger ? "danger" : ""}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            await onClick();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Veuillez patienter…" : children}
      </button>
      <Notice error={error} />
    </>
  );
}
export function Check({
  name,
  label,
  checked = false,
}: {
  name: string;
  label: string;
  checked?: boolean;
}) {
  return (
    <label className="check">
      <input type="checkbox" name={name} defaultChecked={checked} />
      {name === "DECORATION" ? (
        <Sparkles size={16} />
      ) : name === "CANDY" ? (
        <Candy size={16} />
      ) : name === "ACTING" ? (
        <Drama size={16} />
      ) : null}
      <span>{label}</span>
    </label>
  );
}
export function Badges({ activities }: { activities: Activity[] }) {
  return (
    <div className="badges">
      {activities.map((a) => (
        <span key={a} className="badge">
          {a === "DECORATION" ? (
            <Sparkles size={15} />
          ) : a === "CANDY" ? (
            <Candy size={15} />
          ) : (
            <Drama size={15} />
          )}{" "}
          {labels[a]}
        </span>
      ))}
    </div>
  );
}
export function has(user: User | null, p: string) {
  return !!user?.permissions.includes(p);
}
