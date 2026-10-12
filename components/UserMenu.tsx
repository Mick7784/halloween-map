"use client";
import Link from "next/link";
import { ArrowLeft, Bug, ChevronRight, House, Mail, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import type { User } from "../lib/domain";
import type { PublicState } from "./common";
import { bugHref, publicProjectLinks } from "../lib/project-links";
import AccountOverlay from "./AccountOverlay";
import InstallApp from "./InstallApp";

export default function UserMenu({
  user,
  state,
  version,
  onClose,
  login,
  refresh = async () => {},
  styleUrl,
  initialView,
}: {
  user: User | null;
  state: PublicState | null;
  version: string;
  onClose: () => void;
  login: ReactNode;
  refresh?: () => Promise<void>;
  styleUrl?: string;
  initialView?: "main" | "participation";
}) {
  const [help, setHelp] = useState("");
  if (user && state)
    return (
      <AccountOverlay
        user={user}
        state={state}
        version={version}
        refresh={refresh}
        onClose={onClose}
        styleUrl={styleUrl}
        initialView={initialView}
      />
    );
  const links = publicProjectLinks(state?.projectLinks, state?.privacy);
  return (
    <div
      className="account-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        id="user-menu"
        className="account-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="guest-menu-title"
      >
        <header className="account-header">
          {help && (
            <button
              className="account-back"
              aria-label="Revenir au menu"
              onClick={() => setHelp("")}
            >
              <ArrowLeft size={20} />
            </button>
          )}
          <h1 id="guest-menu-title">
            {help ? "Ajouter l’application" : "Menu utilisateur"}
          </h1>
          <button
            className="close account-close"
            aria-label="Fermer Menu utilisateur"
            onClick={onClose}
          >
            <X size={23} />
          </button>
        </header>
        <div className="account-scroll">
          {help ? (
            <p role="status">{help}</p>
          ) : (
            <>
              <div className="home-drawer-login">{login}</div>
              <nav
                className="account-secondary"
                aria-label="Navigation personnelle"
              >
                <Link
                  className="account-row"
                  href="/login?next=/participant"
                  onClick={onClose}
                >
                  <span className="account-row-icon">
                    <House />
                  </span>
                  <span className="account-row-copy">
                    <strong>Inscrire ma maison</strong>
                  </span>
                  <ChevronRight size={19} />
                </Link>
                <InstallApp account onHelp={setHelp} />
                {links.contactEnabled &&
                  (links.contactUrl || links.contactEmail) && (
                    <a
                      className="account-row"
                      href={links.contactUrl ?? `mailto:${links.contactEmail}`}
                    >
                      <span className="account-row-icon">
                        <Mail />
                      </span>
                      <span className="account-row-copy">
                        <strong>Contacter l’organisateur</strong>
                      </span>
                      <ChevronRight size={19} />
                    </a>
                  )}
                {links.bugEnabled && (
                  <a className="account-row" href={bugHref(links, version)}>
                    <span className="account-row-icon">
                      <Bug />
                    </span>
                    <span className="account-row-copy">
                      <strong>Signaler un bug</strong>
                    </span>
                    <ChevronRight size={19} />
                  </a>
                )}
              </nav>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
