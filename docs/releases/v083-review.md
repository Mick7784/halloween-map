# V0.8.3 — revue avant publication

La PR #18 reste en brouillon sur `work/v083-collection-seasons`. Tickets #16 et #17. Aucun merge, tag, release, `latest` ou déploiement Dockhand n'est autorisé par cette revue.

## Comportement attendu

- Préparation REAL : preview ADMIN/SUPER_ADMIN et création BO avant activation ; inscription publique si le calendrier d'inscription est ouvert. Le compte à rebours apparaît également sans connexion.
- Accès public : activation ET ouverture atteinte, fermeture non atteinte. Sans ces conditions, aucune maison, aucun candidat ni identifiant de maison fermée ne figure dans la réponse publique destinée aux visiteurs.
- Fin : remerciements pour tous, preview administrative en lecture seule, collecte refusée. Purge : détails saisonniers retirés selon le calendrier existant ; comptes globaux et statistiques anonymes conservés.
- TEST historiques conservées et isolées : aucun contexte TEST aux visiteurs, aucune nouvelle création TEST proposée dans l'interface. Aucun changement de migration ni intervention sur une base de production.
- Collecte : sélection sans routage, géométrie neutralisée, aucune requête directions ; classement depuis le départ puis GPS fiable. Ajouts hors critères expliqués. Mesure GPS observée, interruptions signalées, aucun tracé sauvegardé.

## Vérifications

`npm run lint`, `npm test`, `npm run build`, toute la suite Playwright avec PostgreSQL jetable en GitHub Actions, puis Docker Compose app/worker et healthcheck. Le job Docker de cette branche publie exclusivement `ghcr.io/mick7784/halloween-map:pr-18-<SHA>` après vérification, puis relit l'image et sa version. Le job release reste exclu sur la PR.

La régression serveur couvre notamment un horaire d'ouverture atteint sans activation, avec une maison effectivement ouverte : aucun payload détaillé avant activation, accès après activation. Les tests existants couvrent inscriptions avant activation, preview ADMIN/SUPER_ADMIN, TEST, clôture, purge et conservation des comptes. Les tests navigateur vérifient l'horloge serveur malgré une date appareil décalée, ainsi que l'accueil anonyme après fermeture et la création BO avant activation.

Les captures Playwright sont jointes à l'artefact `browser-report` de la CI : `review-collection-390.png`, `review-collection-1440.png`, `route-expanded-mobile.png`, `v083-countdown-390.png` et `v083-thanks-390.png`. Les tests vérifient également les dimensions et positions des commandes.

L'état définitif de validation est celui des checks du dernier HEAD de la PR. Un résultat d'un ancien SHA ne valide pas une correction ultérieure. Le GPS simulé ne remplace pas une vérification sur téléphone réel ; aucune mesure de réception email externe ou déploiement n'est réalisée ici.
