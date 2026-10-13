import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

export default function AccountGroup({
  title,
  icon,
  open,
  onToggle,
  children,
}: {
  title: string;
  icon: ReactNode;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const id =
    "menu-group-" +
    title
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z]/g, "-");
  return (
    <section className="account-group">
      <button
        type="button"
        className="account-row account-group-toggle"
        aria-expanded={open}
        aria-controls={id}
        onClick={onToggle}
      >
        <span className="account-row-icon">{icon}</span>
        <span className="account-row-copy">
          <strong>{title}</strong>
        </span>
        <ChevronRight size={19} />
      </button>
      <div id={id} className={"account-group-content" + (open ? " is-open" : "")}>
        <div className="account-group-inner" inert={!open} aria-hidden={!open}>
          {children}
        </div>
      </div>
    </section>
  );
}
