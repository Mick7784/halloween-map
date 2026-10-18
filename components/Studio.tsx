"use client";
import { useState, useEffect, type ReactNode } from "react";
import { Button, Select } from "./ui";
import "./studio.css";
export function StudioShell({
  children,
  navigation,
}: {
  children: ReactNode;
  navigation: ReactNode;
}) {
  const [theme, setTheme] = useState("system");
  useEffect(() => {
    const stored = localStorage.getItem("domotik-content-theme");
    if (["light", "dark", "system"].includes(stored ?? "")) setTheme(stored!);
  }, []);
  return (
    <div className="studio-shell" data-theme={theme}>
      <header className="studio-header">
        <div>
          <span className="studio-eyebrow">DomotiK Studio · Halloween Map</span>
          <h2>Contenus & documents</h2>
          <p>Les mots de votre événement, de la rédaction à la publication.</p>
        </div>
        <label>
          Apparence
          <Select
            value={theme}
            onChange={(e) => {
              setTheme(e.target.value);
              localStorage.setItem("domotik-content-theme", e.target.value);
            }}
          >
            <option value="system">Système</option>
            <option value="light">Clair</option>
            <option value="dark">Sombre</option>
          </Select>
        </label>
      </header>
      <div className="studio-layout">
        {navigation}
        <div className="studio-main">{children}</div>
      </div>
    </div>
  );
}
export function StudioNav({
  items,
  current,
  onSelect,
  label = "Sections des contenus",
}: {
  items: { id: string; label: string; description: string }[];
  current: string;
  onSelect: (id: string) => void;
  label?: string;
}) {
  return (
    <nav className="studio-nav" aria-label={label}>
      {items.map((item) => (
        <Button
          type="button"
          key={item.id}
          aria-current={current === item.id ? "page" : undefined}
          onClick={() => onSelect(item.id)}
        >
          <strong>{item.label}</strong>
          <span>{item.description}</span>
        </Button>
      ))}
    </nav>
  );
}
export function StudioPanel({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="studio-panel">
      <header className="studio-section-head">
        <h3>{title}</h3>
        {description && <p>{description}</p>}
      </header>
      {children}
    </section>
  );
}
export function SaveStatus({
  dirty,
  busy,
  saved,
}: {
  dirty: boolean;
  busy: boolean;
  saved?: boolean;
}) {
  return (
    <span className="studio-save-status" role="status" aria-live="polite">
      {busy
        ? "Enregistrement…"
        : dirty
          ? "Modifications non enregistrées"
          : saved
            ? "Enregistré"
            : "À jour"}
    </span>
  );
}
export function StudioEmpty({ children }: { children: ReactNode }) {
  return <p className="studio-empty">{children}</p>;
}
