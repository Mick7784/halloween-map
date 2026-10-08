"use client";
import { ArrowLeft, X } from "lucide-react";
import { useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import "./FloatingWindow.css";
const subscribe = () => () => {};
export default function FloatingWindow({
  title,
  onClose,
  onBack,
  children,
  className = "",
  id,
}: {
  title: string;
  onClose: () => void;
  onBack?: () => void;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  const ready = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  if (!ready) return null;
  return createPortal(
    <div
      className="floating-overlay"
      onClick={(e) => {
        e.stopPropagation();
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        className={"floating-window " + className}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        id={id}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="floating-header">
          {onBack && (
            <button
              type="button"
              aria-label="Revenir à la vue précédente"
              onClick={onBack}
            >
              <ArrowLeft />
            </button>
          )}
          <h2>{title}</h2>
          <button
            type="button"
            className="close"
            aria-label={"Fermer " + title}
            onClick={onClose}
          >
            <X />
          </button>
        </header>
        <div className="floating-scroll">{children}</div>
      </section>
    </div>,
    document.body,
  );
}
