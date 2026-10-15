# Nettoyage V0.9.8 — état et limites

Référence de départ : `main` / V0.9.7, commit `8b080e02293bb59f14ac928683c98fda4b6d4fd5`, le 15 octobre 2026. Ce relevé distingue code livré, corrections ciblées et recette réelle. Il ne certifie pas l'installation hébergée.

## Corrections incluses

- `HomeAtmosphere` traite désormais `pagehide`, `pageshow` et le retour du focus. L'écoute est réarmée à la reprise, les offsets sont remis à zéro et une nouvelle mesure fixe la posture de référence. Les images facultatives ne sont retentées qu'après une reprise ou un retour réseau, si leur chargement précédent a échoué. Les pauses de navigation, les menus, la connexion, les préférences d'accessibilité et le fond statique restent respectés.
- Le contrôle des dates de saison abandonne les colonnes `reminder_enabled/reminder_at` de V0.2 comme source de décision. La migration 003 a transféré les rappels dans les campagnes. Les campagnes actuelles sont toujours recalculées et contrôlées dans la même transaction ; si une campagne active dépasse la purge, calendrier et campagnes sont intégralement restaurés.
- Le README conserve le logo modéré sans répéter l'icône plus bas. Aucun asset graphique remplacé. Les liens locaux cassés de `OPERATIONS.md` sont réparés.
- Les PNG/ICO PWA et `public/sw.js` sont des sorties générées, désormais ignorées par Git. Les sources WebP approuvées et `scripts/sw-template.js` restent suivis ; `predev`, `prebuild` et `pretest` génèrent les sorties. Docker copie le répertoire `public` de l'étape de build, après génération. Un checkout brut ne contient donc plus d'anciennes icônes ni un service worker affichant une version périmée.

## Inventaire du code

La compilation TypeScript avec `--noUnusedLocals --noUnusedParameters` ne relève aucun import, variable locale ou paramètre inutilisé. Le relevé des imports statiques/dynamiques des sources ne trouve aucun module `components/` ou `lib/` sans référence, tests compris. Ce contrôle ne prouve pas que chaque branche de code est exécutée en production ; il ne justifie donc pas de suppression massive.

Les migrations historiques, contrats API, tables et champs de compatibilité sont conservés. Leur retrait sans inventaire des données hébergées pourrait casser un upgrade, un ancien client ou une reprise de collecte. Voir [la dette technique actualisée](technical-debt.md).

## Suivi GitHub hérité

Une issue ouverte décrivant une ancienne spécification ne prouve pas une fonction manquante. Les changements de suivi doivent conserver ces descriptions et ajouter une référence à leur remplacement.

| Suivi | État établi dans V0.9.7 | Suite |
| --- | --- | --- |
| PR #27 — test chronomètre | Normalisation des durées présente dans `e2e/account-context.spec.ts`, suite verte | Brouillon remplacé par le code livré ; fermeture sans fusion |
| PR #36 — fiches sans doublons | `compactHeader` et fiches simplifiées présents dans Maisons et Utilisateurs | Brouillon remplacé ; fermeture sans fusion |
| PR #39 — README vitrine | README actuel, liens d'exploitation et visuels approuvés déjà livrés | Brouillon remplacé ; fermeture sans fusion |
| #37 — icônes | Sources officielles, PNG PWA/Apple/maskable, ICO et références présents ; génération contrôlée | Implémentation livrée ; installation réelle reste dans GO-LIVE |
| #33 — parallaxe | Lissage V0.9.7 et reprise V0.9.8 | Maintenir la recette S26 Ultra/Chrome ouverte |
| #34 — audit BO | Localisation confirmée via `common.tsx`, liens utilisateurs, tri, intitulé Vérification, fiches et accès Saison présents | Actualiser les constats ; conserver l'inventaire UX et les essais de charge |
| #3–#6, #8–#12, #16–#17 — spécifications historiques | Les grandes fonctions sont présentes et testées : comptes/droits, sécurité, activité, emails, maisons, statistiques, contenus, paramètres, entrée application, collecte et saisons | Ne pas relancer leur développement depuis les anciens textes ; conserver les détails comme référence jusqu'au rapprochement complet des critères |
| #7 — harmonisation BO | Composants partagés et shell présents | Recette visuelle ciblée restant à mener ; ne pas annoncer une refonte terminée |

## Signalement PWA : ce qui est démontré

Le propriétaire constate l'absence du mouvement du décor dans la PWA installée avec Chrome sur S26 Ultra, alors que l'onglet Chrome fonctionne. Aucun branchement du code ne désactive explicitement le décor selon `display-mode: standalone`.

Deux fragilités du code ont été corrigées : absence de traitement explicite de la restauration de fenêtre, et échec d'image définitif pour la durée du montage React. Les tests navigateur simulent ces transitions, la reprise du réseau et le mode standalone ; ils ne reproduisent ni le gestionnaire de capteurs Android ni le cycle de vie réel d'un WebAPK. La cause exacte du signalement n'est donc pas établie à distance, et sa résolution doit être confirmée sur le S26 Ultra.

L'orientation magnétique de la carte est une fonction distincte : elle conserve ses critères de fiabilité et son repli GPS. Aucun accès capteur forcé, aucune permission contournée et aucun mouvement artificiel sans mesure ne sont ajoutés.

## Ce qui reste après cette livraison

1. Recette S26 Ultra / Chrome installé et onglet sur la même version : démarrage, reprise, verrouillage, réseau et réduction des animations.
2. Recette ciblée du BO sur ordinateur : thèmes, fenêtres/focus, brouillons, ADMIN limité et erreurs réseau. Relever les écarts reproductibles avant de modifier les composants.
3. Mesurer la charge réelle des listes avant de déplacer recherche et pagination côté serveur.
4. Vérifier les usages externes et données anciennes avant toute migration de suppression.
5. Terminer [la checklist d'ouverture](GO-LIVE.md) : emails réels, mentions, GPS, PWA, saison, sauvegarde/restauration et worker.
