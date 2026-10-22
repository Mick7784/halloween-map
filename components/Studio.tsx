"use client";
import { type ReactNode } from "react";
import { Button } from "./ui";
import "./studio.css";
export function StudioShell({
  children,
  navigation,
}: {
  children: ReactNode;
  navigation: ReactNode;
}) {
  return (
    <div className="studio-shell">
      <p className="studio-intro">
        Rédigez, gérez et publiez les contenus de Halloween Map.
      </p>
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
