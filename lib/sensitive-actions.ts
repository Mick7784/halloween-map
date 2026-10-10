export type SensitiveAction = {
  message: string;
  phrase?: string;
  danger?: boolean;
};

// Shared classification only. Authentication and authorization stay on the server.
export function sensitiveAction(
  path: string,
  input: Record<string, unknown>,
): SensitiveAction | null {
  if (path === "admin") {
    const actions: Record<string, SensitiveAction> = {
      purge: {
        message:
          "Effacer les données personnelles de cette saison. Les comptes, années de participation et agrégats anonymes sont conservés.",
        phrase: "PURGER",
        danger: true,
      },
      deleteSeason: {
        message:
          "Supprimer définitivement cette saison et ses données. Les comptes utilisateurs sont conservés.",
        phrase: typeof input.payload === "string" ? input.payload : undefined,
        danger: true,
      },
      deleteHouse: {
        message:
          "Supprimer définitivement cette maison. Le compte du propriétaire est conservé.",
        phrase: "SUPPRIMER LA MAISON",
        danger: true,
      },
      activateSeason: {
        message:
          "Activer cette saison et désactiver la saison actuellement active. Une saison TEST reste réservée à l’administration.",
      },
      deactivateSeason: {
        message:
          "Désactiver cette saison. La carte et les inscriptions correspondantes deviennent indisponibles.",
      },
      settings: {
        message:
          "Enregistrer la configuration de l’instance. Les valeurs proposées ne changent pas les saisons existantes.",
      },
    };
    return actions[String(input.action)] ?? null;
  }
  if (path === "admin/users") {
    if (input.action === "delete")
      return {
        message:
          "Supprimer définitivement ce compte et ses données personnelles, y compris son historique de participation.",
        phrase: "SUPPRIMER CE COMPTE",
        danger: true,
      };
    if (input.action === "disable")
      return {
        message: "Désactiver ce compte et révoquer ses sessions.",
        danger: true,
      };
    if (input.role_id || input.permissions)
      return {
        message:
          "Confirmer le grade et les permissions de ce compte. Les changements prennent effet immédiatement sur ses accès.",
      };
  }
  return null;
}
