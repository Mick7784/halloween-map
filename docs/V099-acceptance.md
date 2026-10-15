# Recette V0.9.9 — issue #43

Source : https://github.com/Mick7784/halloween-map/issues/43
Base V0.9.8 : `ac968f38b4db34ba1c8a65ee8dcd17141f96bbcf`.
Reprise de la PR #44 : `457682f1dcfc19027d9a3942d68cc0011218269b`.

## Inventaire à la reprise

La PR modifiait 16 fichiers sans ajouter de tests. CI 38773990226 :
lint, migrations et rejeu des migrations réussis ; 259 tests réussis, 19
échecs ; build/Playwright du job verify et Docker non exécutés. Le job
HTTPS (build et navigateur) était réussi.

| Critère #43 | État initial | Vérification / travail de reprise |
|---|---|---|
| Retrait TEST, compatibilité historique | Partiel | Schéma refuse TEST ; historique conservé, activation SQL/API interdite, sélection retirée ; suppression des générateurs métier TEST |
| Un seul pointeur, activation manuelle | Implémenté, tests incompatibles | Activations concurrentes et restriction SUPER_ADMIN testées |
| Aucune carte/inscription sans saison active ; comptes possibles | Partiel | Matrice de rôles, inscription refusée, création de compte permanente |
| Avant inscriptions : SUPER_ADMIN seul, API privées | Partiel | Tests de frontière et refus route/distances pour USER/ADMIN |
| Inscriptions ouvertes, carte fermée | Partiel | Matrice serveur ; revalidation de la date d'inscription dans Application |
| Horaires publics, maisons validées/visibles | Implémenté, non vérifié | Tests métier et parcours de masquage/modération ; carte anonyme publique |
| Après Halloween : SUPER_ADMIN conserve carte et routes | Partiel | Pointeur conservé, routes aux dates de la saison, restauration locale de préparation après clôture |
| Transitions automatiques sans rechargement | Partiel | Timer serveur pour inscription/ouverture/fermeture, fermeture locale immédiate |
| Comptes globaux et persistants | Implémenté | Tests de purge, suppression d'édition, sessions et mots de passe |
| Inscription = activation ET calendrier | Implémenté, anciennes attentes fausses | Tests avant/début/fin ; refus API sans activation |
| BO hors dates selon permissions et archivage | Partiel | Création/modération/visibilité après clôture, refus après purge ; accès mobile aux actions |
| BO rattache à active ou attente explicite | Défaillant | Active prioritaire sous verrou ; contexte BO conservé sans active ; ambiguïté sans contexte refusée |
| Une maison / une saison, pas de reconduction | Implémenté | Création de participations séparées, aucune recopie automatique |
| Snapshot agrégé complet | Partiel | Maisons, validations, participants, activités, routes, collectes couverts par tests |
| Purge des détails, comptes et années conservés | Implémenté, à vérifier | Tests suppression participations/outbox/campagnes/reçus, comptes et années validées conservés |
| Historique en lecture seule, purge ≠ suppression | Partiel | Statistiques de saison ; actions distinctes et confirmations ; refus réactivation après purge |
| Statistiques finales actualisées après clôture | Partiel | Recalcul à la purge, lecture vivante avant purge, simulation SUPER_ADMIN exclue des compteurs |
| Pastilles compactes accessibles orange/verte/rouge | Implémenté, non vérifié | Styles uniquement BO ; texte explicite de modération |
| En attente : Valider / Refuser avec motif | Implémenté, non vérifié | API + rafraîchissement ; formulaire de motif et règles conservés |
| Validée : Modifier / Masquer / Réafficher | Implémenté, non vérifié | Actions directes + menu secondaire ; contrôle permissions |
| Refusée : Réexaminer | Implémenté, non vérifié | Ouverture directe de la modération sans mutation implicite |
| Actions secondaires dans …, mobile, suppression confirmée | Partiel | Actions dans ActionMenu ; accès Maisons mobile ajouté ; suppression sécurisée préservée |
| États distincts, fonctionnalités et fiches préservées | Implémenté, non vérifié | Réutilisation des formulaires/fiches ; tests disponibilité, filtres, pagination, navigation |
| Tests composants/API et Playwright des actions | Absent | Mise à jour des attentes et scénarios de refus/réexamen/visibilité |
| Lint, TypeScript, unités, Playwright, migrations, Docker | Défaillant | En cours : les résultats définitifs doivent être renseignés avant publication |
| Régressions accueil/PWA/navigation/comptes/communications | Non vérifié | Suites existantes conservées ; correction des seules attentes métier obsolètes |
| Documentation, VERSION, tag, release | Absent | Release conditionnée à la recette complète et CI verte |
| Recette environnement réel | Non réalisée | Les bases locales et CI sont jetables. Essais sur l'installation réelle de l'organisateur à effectuer avec la release. |

## Résultats provisoires

- Audit des dépendances de production : aucune vulnérabilité détectée.
- Lint / TypeScript et build de production réussis pendant la reprise.
- 281 tests unitaires réussis après ajout du cas de restauration de préparation.
- Recette Playwright et CI finale en cours ; aucune autorisation de publication
  ne doit être déduite de ces résultats provisoires.
