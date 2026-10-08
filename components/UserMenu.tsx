"use client";
import Link from "next/link";
import {
  Map,
  House,
  Route,
  ShieldCheck,
  Settings,
  LogOut,
  Bug,
  ChevronRight,
  UserRound,
} from "lucide-react";
import type { ReactNode } from "react";
import type { User } from "../lib/domain";
import { api, AsyncButton, type PublicState } from "./common";
import { bugHref, publicProjectLinks } from "../lib/project-links";
import FloatingWindow from "./FloatingWindow";
import InstallApp from "./InstallApp";
export default function UserMenu({
  user,
  state,
  version,
  onClose,
  login,
  participationLabel = "Inscrire ma maison",
  participationSubtitle,
}: {
  user: User | null;
  state: PublicState | null;
  version: string;
  onClose: () => void;
  login: ReactNode;
  participationLabel?: string;
  participationSubtitle?: string;
}) {
  const entry = (
    href: string,
    label: string,
    icon: ReactNode,
    subtitle?: string,
  ) => (
    <Link href={href} onClick={onClose} aria-label={label}>
      {icon}
      <span>
        {label}
        {subtitle && <small>{subtitle}</small>}
      </span>
      <ChevronRight size={16} />
    </Link>
  );
  return (
    <FloatingWindow
      title="Menu utilisateur"
      id="user-menu"
      className="user-navigation-window"
      onClose={onClose}
    >
      {user ? (
        <div className="home-user">
          <span className="home-avatar">
            <UserRound />
          </span>
          <div>
            <strong>{user.display_name}</strong>
            <span>{user.email}</span>
            {user.permissions.includes("admin.access") && (
              <small>Administrateur</small>
            )}
          </div>
        </div>
      ) : (
        <div className="home-drawer-login">{login}</div>
      )}
      <nav className="home-drawer-links" aria-label="Navigation personnelle">
        {entry("/map", "La carte", <Map />)}
        {entry(
          user ? "/participant" : "/login?next=/participant",
          participationLabel,
          <House />,
          participationSubtitle,
        )}
        {entry("/map#parcours", "Préparer mon parcours", <Route />)}
        {user?.permissions.includes("admin.access") && (
          <div className="home-menu-group">
            {entry("/admin", "Administration", <ShieldCheck />)}
          </div>
        )}
        <div className="home-menu-group">
          {user && entry("/account", "Mon compte", <Settings />)}
          <InstallApp />
          {user && (
            <AsyncButton
              onClick={async () => {
                await api("logout", {});
                window.location.href = "/";
              }}
            >
              <LogOut />
              <span>Se déconnecter</span>
            </AsyncButton>
          )}
        </div>
        <div className="home-menu-group">
          <a
            href={bugHref(
              publicProjectLinks(state?.projectLinks, state?.privacy),
              version,
            )}
            onClick={onClose}
          >
            <Bug />
            <span>Signaler un bug</span>
            <ChevronRight size={16} />
          </a>
        </div>
      </nav>
    </FloatingWindow>
  );
}
