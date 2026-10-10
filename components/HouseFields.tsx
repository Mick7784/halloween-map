"use client";
import { Input, TextArea } from "./ui";
import { Candy, Drama, Ghost, Sparkles } from "lucide-react";
import type { Activity } from "../lib/domain";
import { participationDefaults } from "../lib/participation-settings";
import { houseScheduleBounds } from "../lib/house-form";
import "./HouseFields.css";
export const houseActivityOptions = [
  { id: "DECORATION", label: "Décoration", Icon: Sparkles },
  { id: "CANDY", label: "Bonbons", Icon: Candy },
  { id: "ACTING", label: "Mise en scène", Icon: Drama },
] as const;
export function HouseNameField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="field">
      <span className="visually-hidden">Nom de la maison *</span>
      <Input
        name="name"
        maxLength={100}
        required
        placeholder="Ma Maison Hantée"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
export function HouseActivityFields({
  value,
  options = participationDefaults.activities,
  onChange,
}: {
  value: Activity[];
  options?: Activity[];
  onChange: (value: Activity[]) => void;
}) {
  return (
    <div
      className="participation-activities"
      role="group"
      aria-label="Activités proposées"
    >
      {houseActivityOptions
        .filter((a) => options.includes(a.id))
        .map(({ id, label, Icon }) => (
          <label key={id} className={value.includes(id) ? "is-selected" : ""}>
            <Icon />
            <span>{label}</span>
            <Input
              type="checkbox"
              name={id}
              checked={value.includes(id)}
              onChange={(e) =>
                onChange(
                  e.target.checked
                    ? [...value, id]
                    : value.filter((a) => a !== id),
                )
              }
            />
          </label>
        ))}
    </div>
  );
}
export function HouseScheduleFields({
  starts,
  ends,
  zone,
  opens,
  closes,
  isTest = false,
  onStart,
  onEnd,
}: {
  starts: string;
  ends: string;
  zone: string;
  opens: string;
  closes: string;
  isTest?: boolean;
  onStart: (v: string) => void;
  onEnd: (v: string) => void;
}) {
  const schedule = houseScheduleBounds(opens, closes, zone);
  return (
    <>
      <div className="participation-address-grid">
        <label className="field">
          <span>Début *</span>
          <Input
            name="starts_at"
            type="datetime-local"
            required
            min={isTest ? undefined : schedule.starts}
            max={isTest ? undefined : schedule.ends}
            value={starts}
            onChange={(e) => onStart(e.target.value)}
          />
        </label>
        <label className="field">
          <span>Fin *</span>
          <Input
            name="ends_at"
            type="datetime-local"
            required
            min={starts || (isTest ? undefined : schedule.starts)}
            max={isTest ? undefined : schedule.ends}
            value={ends}
            onChange={(e) => onEnd(e.target.value)}
          />
        </label>
      </div>
      <small className="participation-help">Horaires d’accueil · {zone}</small>
    </>
  );
}
export function FearGauge({
  value,
  labels = participationDefaults.fearLabels,
  disabled = false,
  onChange,
}: {
  value?: number | null;
  labels?: string[];
  disabled?: boolean;
  onChange?: (v: number) => void;
}) {
  const known = typeof value === "number" && value >= 1 && value <= 5;
  return (
    <div className={"house-fear-gauge" + (disabled ? " is-neutral" : "")}>
      {onChange ? (
        <Input
          aria-label="Niveau de frayeur"
          type="range"
          min={1}
          max={5}
          value={value ?? 2}
          disabled={disabled}
          onChange={(e) => onChange(Number(e.target.value))}
        />
      ) : (
        <div
          className="house-fear-track"
          role={known ? "meter" : "img"}
          aria-label={
            known
              ? "Niveau de frayeur : " + labels[value - 1]
              : "Niveau de référence non renseigné"
          }
          aria-valuemin={known ? 1 : undefined}
          aria-valuemax={known ? 5 : undefined}
          aria-valuenow={known ? value : undefined}
          aria-valuetext={known ? labels[value - 1] : undefined}
        >
          {known && (
            <span
              className="house-fear-fill"
              style={{ width: ((value - 1) / 4) * 100 + "%" }}
            />
          )}
          {labels.map((label, i) => (
            <span
              key={label}
              className="house-fear-tick"
              style={{ left: (i / 4) * 100 + "%" }}
            />
          ))}
          {known && (
            <span
              className="house-fear-cursor"
              style={{ left: ((value - 1) / 4) * 100 + "%" }}
            >
              <Ghost size={23} />
            </span>
          )}
        </div>
      )}
      <div className="house-fear-labels">
        {labels.map((label, i) => (
          <span key={i} className={known && value === i + 1 ? "selected" : ""}>
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
export function HouseFearFields({
  fear,
  adapt,
  labels,
  onFear,
  onAdapt,
}: {
  fear: number;
  adapt: boolean;
  labels?: string[];
  onFear: (v: number) => void;
  onAdapt: (v: boolean) => void;
}) {
  return (
    <>
      <FearGauge
        value={fear}
        labels={labels}
        disabled={adapt}
        onChange={onFear}
      />
      <label className="participation-adapt">
        <Ghost size={22} />
        <span>Je m’adapte à mes visiteurs</span>
        <Input
          type="checkbox"
          role="switch"
          checked={adapt}
          onChange={(e) => onAdapt(e.target.checked)}
        />
        <span className="participation-toggle" aria-hidden="true" />
      </label>
      <small className="participation-help">
        {adapt
          ? "L’expérience s’adapte à vos visiteurs ; le niveau fixe est désactivé."
          : "Activez ce mode pour adapter la frayeur à vos visiteurs."}
      </small>
    </>
  );
}
export function HouseTextField({
  name,
  value,
  limit,
  onChange,
}: {
  name: "rp" | "practical";
  value: string;
  limit: number;
  onChange: (v: string) => void;
}) {
  return (
    <label className="field">
      <span>Facultatif</span>
      <TextArea
        name={name}
        rows={3}
        maxLength={limit}
        placeholder={
          name === "rp"
            ? "Décrivez en quelques mots l’ambiance de votre maison, votre décoration ou ce que les visiteurs vont découvrir…"
            : "Ex. : Portail blanc, au fond de la cour, entrée côté jardin…"
        }
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <small
        className={
          value.length > limit
            ? "participation-over-limit"
            : "participation-counter"
        }
      >
        {value.length} / {limit}
      </small>
    </label>
  );
}
