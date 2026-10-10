"use client";
import {
  useId,
  useState,
  type ComponentProps,
  type HTMLAttributes,
  type ReactNode,
} from "react";

export function Button({
  variant,
  className = "",
  ...props
}: ComponentProps<"button"> & {
  variant?: "primary" | "secondary" | "danger" | "quiet";
}) {
  return (
    <button
      {...props}
      className={["ui-button", variant === "quiet" ? "" : variant, className]
        .filter(Boolean)
        .join(" ")}
    />
  );
}
export function Dialog({
  children,
  className = "dialog panel",
  title,
  ...props
}: HTMLAttributes<HTMLElement> & { title?: string }) {
  const id = useId();
  return (
    <section
      {...props}
      className={className}
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? id : props["aria-labelledby"]}
    >
      {title && <h2 id={id}>{title}</h2>}
      {children}
    </section>
  );
}
export function DataTable({
  className = "",
  ...props
}: HTMLAttributes<HTMLTableElement>) {
  return <table {...props} className={"ui-table " + className} />;
}
export function ActionMenu({
  label = "Autres actions",
  children,
  className = "",
}: {
  label?: string;
  children: ReactNode;
  className?: string;
}) {
  const [position, setPosition] = useState({ top: 0, left: 0 });
  return (
    <details
      className={"ui-action-menu " + className}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("button,a"))
          e.currentTarget.open = false;
      }}
      onToggle={(e) => {
        if (!e.currentTarget.open) return;
        const bounds = e.currentTarget
          .querySelector("summary")!
          .getBoundingClientRect();
        setPosition({
          top: Math.max(
            12,
            Math.min(bounds.bottom + 6, window.innerHeight - 260),
          ),
          left: Math.max(
            12,
            Math.min(bounds.right - 230, window.innerWidth - 242),
          ),
        });
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.currentTarget.open = false;
          e.currentTarget.querySelector("summary")?.focus();
          e.stopPropagation();
        }
      }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null))
          e.currentTarget.open = false;
      }}
    >
      <summary aria-label={label} title={label}>
        …
      </summary>
      <div className="ui-action-menu-items" style={position}>
        {children}
      </div>
    </details>
  );
}
export function Input({ className = "", ...props }: ComponentProps<"input">) {
  return <input {...props} className={"ui-input " + className} />;
}
export function Select({ className = "", ...props }: ComponentProps<"select">) {
  return <select {...props} className={"ui-input " + className} />;
}
export function TextArea({
  className = "",
  ...props
}: ComponentProps<"textarea">) {
  return <textarea {...props} className={"ui-input " + className} />;
}
export function Pagination({
  count,
  page,
  pageSize = 25,
  onPage,
}: {
  count: number;
  page: number;
  pageSize?: number;
  onPage: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(count / pageSize));
  if (pages === 1) return null;
  return (
    <nav className="ui-pagination" aria-label="Pagination">
      <Button
        type="button"
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
      >
        Précédent
      </Button>
      <span role="status">
        Page {page} / {pages} · {count} résultats
      </span>
      <Button
        type="button"
        disabled={page >= pages}
        onClick={() => onPage(page + 1)}
      >
        Suivant
      </Button>
    </nav>
  );
}

export function MetricCard({
  label,
  value,
  icon,
  className = "",
}: {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <article className={className}>
      {icon ? (
        <div>
          <span>{label}</span>
          {icon}
        </div>
      ) : (
        <span>{label}</span>
      )}
      <strong>{value}</strong>
    </article>
  );
}

export function Timeline({
  className = "beta-activity-list",
  ...props
}: HTMLAttributes<HTMLUListElement>) {
  return <ul {...props} className={className} />;
}
