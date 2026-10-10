"use client";
import { Input, Button } from "./ui";
import { useState } from "react";
import { DateTime } from "luxon";
export default function FrenchDate({
  label,
  onValueChange,
  name,
  value,
  required = true,
  min,
  max,
  recurring = false,
  readOnly = false,
}: {
  label: string;
  onValueChange?: () => void;
  name: string;
  value?: string | number;
  required?: boolean;
  min?: string | number;
  max?: string | number;
  recurring?: boolean;
  readOnly?: boolean;
}) {
  const initial = String(value ?? "");
  const [date, setDate] = useState(initial.slice(0, 10)),
    [clock, setClock] = useState(initial.slice(11, 16) || "00:00"),
    [open, setOpen] = useState(false),
    [month, setMonth] = useState(() =>
      DateTime.fromISO(initial.slice(0, 10) || "2000-10-01").startOf("month"),
    );
  const parsed = DateTime.fromISO(date + "T" + clock).setLocale("fr");
  function update(
    nextDate: string,
    nextClock: string,
    form: HTMLFormElement | null,
  ) {
    const field = form?.elements.namedItem(name) as HTMLInputElement | null;
    if (field) {
      field.value = nextDate + "T" + nextClock;
      field.dispatchEvent(new Event("input", { bubbles: true }));
    }
    onValueChange?.();
    setDate(nextDate);
    setClock(nextClock);
  }
  const count = month.daysInMonth ?? 31,
    leading = month.weekday - 1;
  return (
    <div className="field french-date">
      <span>
        {label}
        {required && <b className="required"> *</b>}
      </span>
      <Input type="hidden" name={name} value={date + "T" + clock} />
      <div className="date-controls">
        <Button
          type="button"
          disabled={readOnly}
          aria-label={label + " : choisir la date"}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {parsed.isValid
            ? parsed.toFormat(recurring ? "dd LLLL" : "dd LLLL yyyy")
            : "Choisir une date"}
        </Button>
        <label>
          <span className="sr-only">{label + " : heure"}</span>
          <Input
            aria-label={label + " : heure"}
            type="time"
            readOnly={readOnly}
            lang="fr"
            required={required}
            value={clock}
            onChange={(e) => update(date, e.target.value, e.currentTarget.form)}
          />
        </label>
      </div>
      {open && (
        <div className="calendar-popover">
          <div className="calendar-heading">
            <Button
              type="button"
              aria-label="Mois précédent"
              onClick={() => setMonth(month.minus({ months: 1 }))}
            >
              ‹
            </Button>
            <strong>
              {month.setLocale("fr").toFormat(recurring ? "LLLL" : "LLLL yyyy")}
            </strong>
            <Button
              type="button"
              aria-label="Mois suivant"
              onClick={() => setMonth(month.plus({ months: 1 }))}
            >
              ›
            </Button>
          </div>
          <div className="calendar-grid">
            {["L", "M", "M", "J", "V", "S", "D"].map((d, i) => (
              <span key={"day" + i}>{d}</span>
            ))}
            {Array.from({ length: leading }, (_, i) => (
              <span key={"empty" + i} />
            ))}
            {Array.from({ length: count }, (_, i) => {
              const d = month.set({ day: i + 1 }).toISODate()!;
              return (
                <Button
                  type="button"
                  className={d === date ? "selected" : ""}
                  key={d}
                  disabled={
                    (!!min && d < String(min).slice(0, 10)) ||
                    (!!max && d > String(max).slice(0, 10))
                  }
                  aria-label={DateTime.fromISO(d)
                    .setLocale("fr")
                    .toFormat("dd LLLL yyyy")}
                  onClick={(e) => {
                    update(d, clock, e.currentTarget.form);
                    setOpen(false);
                  }}
                >
                  {i + 1}
                </Button>
              );
            })}
          </div>
        </div>
      )}
      <small>
        {parsed.isValid
          ? parsed.toFormat(
              recurring ? "dd LLLL à HH:mm" : "dd LLLL yyyy à HH:mm",
            )
          : ""}
      </small>
    </div>
  );
}
