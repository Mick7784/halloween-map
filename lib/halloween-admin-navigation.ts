import type { StudioNavGroup } from "./studio-navigation";

/** Product-specific modules and permissions, independent of their rendering. */
export type HalloweenAdminSection =
  | "dashboard"
  | "houses"
  | "users"
  | "seasons"
  | "statistics"
  | "activity"
  | "communications"
  | "content"
  | "settings";

export const halloweenAdminNavigation = [
  {
    title: "Accueil",
    items: [
      { id: "dashboard", title: "Tableau de bord", permission: "stats.read", icon: "dashboard" },
    ],
  },
  {
    title: "Gestion",
    items: [
      { id: "houses", title: "Maisons", permission: "participants.read", icon: "houses" },
      { id: "users", title: "Utilisateurs", permission: "users.read", icon: "users" },
      { id: "seasons", title: "Saison", permission: "season.read", icon: "seasons" },
    ],
  },
  {
    title: "Suivi & communication",
    items: [
      { id: "statistics", title: "Statistiques", permission: "stats.read", icon: "statistics" },
      { id: "activity", title: "Activité", permission: "audit.read", icon: "activity" },
      { id: "communications", title: "Communications", permission: "communications.read", icon: "communications" },
    ],
  },
  {
    title: "Configuration",
    items: [
      { id: "content", title: "Contenus & documents", permission: "content.manage", icon: "content" },
      { id: "settings", title: "Paramètres", permission: "settings.read", icon: "settings" },
    ],
  },
] as const satisfies readonly StudioNavGroup<HalloweenAdminSection>[];
