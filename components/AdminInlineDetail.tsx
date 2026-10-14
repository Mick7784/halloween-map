"use client";
import { useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "./ui";
import { confirmDraftNavigation } from "./useDraftGuard";

export type AdminDetailTab = {
  id: string;
  label: string;
  content: ReactNode;
};

export default function AdminInlineDetail({
  title,
  subtitle,
  tabs,
  onClose,
  initialTab,
  compactHeader = false,
}: {
  title: string;
  subtitle?: string;
  tabs: AdminDetailTab[];
  onClose: () => void;
  initialTab?: string;
  compactHeader?: boolean;
}) {
  const [active, setActive] = useState(initialTab ?? tabs[0]?.id ?? "");
  const current = tabs.find((tab) => tab.id === active) ?? tabs[0];
  const change = (id: string) => {
    if (id === active || !confirmDraftNavigation()) return;
    setActive(id);
  };
  return (
    <section className="admin-inline-detail" aria-label={"Fiche " + title}>
      <header className={"admin-inline-detail-header" + (compactHeader ? " is-compact" : "")}>
        {!compactHeader && (
          <div>
            <h3>{title}</h3>
            {subtitle && <p className="small muted">{subtitle}</p>}
          </div>
        )}
        <Button
          type="button"
          aria-label={"Refermer la fiche " + title}
          title="Refermer la fiche"
          onClick={() => {
            if (confirmDraftNavigation()) onClose();
          }}
        >
          <X size={16} />
        </Button>
      </header>
      <div className="admin-inline-detail-tabs" role="tablist" aria-label={"Rubriques de " + title}>
        {tabs.map((tab) => (
          <Button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={current?.id === tab.id}
            className={current?.id === tab.id ? "is-current" : ""}
            onClick={() => change(tab.id)}
          >
            {tab.label}
          </Button>
        ))}
      </div>
      <div className="admin-inline-detail-body" role="tabpanel" aria-label={current?.label}>
        {current?.content}
      </div>
    </section>
  );
}
