# Refonte du back-office Halloween Map — convergence DomotiK Studio

Statut : plan de chantier (aucun changement produit à ce stade).
Point de départ : Halloween Map V0.9.10 / LinKs V1.312.
Objectif : livraison en **une release Halloween Map vérifiée**, après mise en œuvre, sans altérer les fonctionnalités publiques ni les données existantes.

## 1. Vision et critères

Le back-office LinKs est la référence ergonomique pour Halloween Map : architecture visuelle, densité, typographie, navigation, composants, interactions, états, graphiques et expérience mobile. Le résultat doit être visuellement et fonctionnellement cohérent avec LinKs, tout en conservant l'identité Halloween Map et ses règles métier.

- Harmonisation de l'administration uniquement ; aucune copie de la page publique, aucun remplacement des logos ou des couleurs propres aux contenus publics.
- Conserver les fonctionnalités et permissions existantes, y compris les cas hors saison, les saisons préparées, la modération, les documents, la communication et les preuves légales.
- Le menu principal ne doit pas masquer des fonctions sous prétexte de ressembler à LinKs ; privilégier une navigation simple, complétée par une navigation secondaire contextuelle.
- Mode clair, sombre, système ; un seul sélecteur d'apparence cohérent dans l'administration.
- États de chargement, succès, erreurs, désactivation, absence de données et brouillon cohérents ; focus et navigation clavier fiables.
- Même logique de composants et mêmes comportements ; pas nécessairement le même code, car LinKs est en HTML/JavaScript et Halloween Map en React/Next.js.
- Respect de l'identité « Halloween Map by DomotiK Studio » et compatibilité avec la vision future d'un back-office multi-applications, **sans** fusion immédiate des authentifications, des bases, des API ou des déploiements.
- Pas de nouvelle bibliothèque simplement pour copier un rendu ; mesurer l'intérêt par rapport aux dépendances déjà installées.

## 2. Inventaire vérifié au lancement

### LinKs (référence)
- `admin/style.css`, `admin/index.html`, `admin/theme-init.js` : shell, surfaces, typographie, thèmes, états visuels et responsive.
- `admin/navigation.js` : activation de vues et indicateurs `aria-current`, indépendante du chargement des données.
- `admin/collection.js` : recherche, tri et pagination de données génériques ; rendu spécifique à l'appelant.
- `admin/charts.js` : classements, donut, chronologie ; affichage lisible, avec accès clavier et légende.
- `admin/calendar.js`, `admin/dates.js` : calendrier semaine/mois et gestion des dates dans le fuseau.
- `admin/uploads.js` : protection de sauvegarde durant un import, prévention des callbacks obsolètes ; réutilisation conceptuelle seulement, sans recopier les API.
- `docs/backoffice-components.md` : contrat du socle de composants déjà extrait pour réemploi.

### Halloween Map (base actuelle)
- `components/Admin.tsx`, `AdminBeta.css` : shell, droits d'accès, navigation, sélection de saison et vues.
- `components/ui.tsx`, `Studio.tsx`, `studio.css` : premières primitives ; évaluer avant d'en créer de nouvelles.
- `AdminDashboard.tsx`, `AdminStatistics.tsx`, `AttendanceChart.tsx`, `AdminActivity.tsx` : métriques et graphiques existants.
- `AdminUsers.tsx`, `AdminInlineDetail.tsx`, `SeasonManager.tsx`, `Campaigns.tsx`, `MessageTemplates.tsx` : administration métier.
- `ContentAdmin.tsx`, `DocumentWorkspace.tsx`, `DocumentEditor.tsx`, `document.css` : espace rédaction Tiptap, publications et versions.
- `docs/content-documents-architecture.md` : contrats de sauvegarde/publication, sécurité, réacceptations et historique à préserver.
- `docs/technical-debt.md` : compatibilités anciennes qu'une refonte visuelle ne doit pas casser.

## 3. Règles d'architecture

1. Créer un **système de design administratif** isolé des styles publics : tokens de fond/surfaces, contrastes, bordures, espacements, rayons, typographie, couleurs sémantiques, focus, breakpoints. Conserver les variables publiques existantes hors du périmètre.
2. Établir une seule implémentation React de chaque primitive commune. D'abord examiner `components/ui.tsx` et `Studio.tsx` ; migrer progressivement les appelants. Éviter une deuxième collection de composants quasi identiques.
3. Établir un shell React : `AdminShell` / `AdminSidebar` / `AdminHeader` / `PageHeading` / `SectionTabs` avec menus adaptés aux droits et au contexte saisonnier. Extraire progressivement de `Admin.tsx` la présentation, **sans déplacer dans le shell la logique métier et les requêtes**.
4. Réimplémenter les primitives DOM de LinKs en fonctions pures et composants React accessibles ; ne pas monter des `StudioCharts` ou `StudioCollection` impératifs dans le cycle React.
5. Préférer les métriques et modèles existants ; ne pas adapter les API ou ajouter des calculs métier pour rendre une visualisation plus séduisante. Décrire précisément chaque unité et dénominateur.
6. Toutes les commandes doivent avoir une action réelle. Maintenir `aria-label`, `title`, raccourcis documentés, `aria-pressed`, focus visible, sorties clavier, `prefers-reduced-motion`, retours d'erreur explicites.
7. Le champ saison active et la saison consultée ont des sémantiques distinctes : ne pas les fusionner ou les modifier par simplification de l'interface.
8. Prévoir des composants exportables vers un futur socle partagé **seulement après validation** ; ne pas créer aujourd'hui de couplage fort avec le dépôt LinKs ni de dépendance distante obligatoire.

## 4. Ordre des lots : un lot validé avant de reprendre les mêmes fichiers

### Lot 0 — Audit, maquette et matrice de non-régression
- Cartographier **tous** les écrans, menus, dialogues et actions de l'administration, avec droits requis et périmètres globaux/saisonniers.
- Comparer LinKs et Halloween Map à plusieurs tailles d'écran en clair/sombre/système.
- Fixer les tokens, grille, densité, disposition du shell, couleurs sémantiques, contrôles et états.
- Capturer des références avant travaux et vérifier la suite CI de base.
- Critère : inventaire exhaustif et conventions adoptées avant transformation de composants.

### Lot 1 — Fondations et composants communs
- Tokens + thèmes + primitives React : Button/IconButton, Input/Select/Textarea, Field, Toggle/Checkbox, Badge, Card/Panel, Alert/Toast, Dialog/Confirmation, Dropdown/ActionMenu, Empty/Loading, Tabs, Table, Pagination, SaveStatus.
- Implémenter recherche/tri/pagination dans un outil de collection générique, adapté de LinKs, sans dépendance au métier.
- Écrire exemples d'usage et tests unitaires/accessibilité ; préserver les signatures utilisées ou migrer tous les appels concernés.
- Critère : composants testés, thème sans flash gênant, aucune régression des interfaces publiques.

### Lot 2 — Shell et navigation
- Repenser menu gauche, contexte de page, thème, profil, lien site public, responsive, raccourcis et titres.
- Rendre la navigation conditionnelle aux permissions **existantes** ; conserver l'accès de l'administrateur à toutes les fonctions autorisées.
- Gérer le contexte saison : actif, en préparation, aucune saison, consultation historique, global.
- Sortir les règles de présentation de `Admin.tsx` par étapes cohérentes ; ne pas réécrire son chargement de données.
- Critère : navigation stable desktop/mobile/clavier, aucun écran orphelin.

### Lot 3 — Tableaux de bord et statistiques
- KPI, cartes, classements, chronologies, sources et distributions avec la grammaire visuelle de LinKs.
- Adapter les outils `StudioCharts` au modèle React ; réutiliser `AttendanceChart` quand son contrat et ses données répondent déjà au besoin.
- Ne pas multiplier les compteurs entre dashboard et Statistiques ; placer détails et filtres uniquement dans les sections pertinentes.
- Tests des agrégations/étiquettes/périodes/états vides, sans statistiques fictives.
- Critère : mêmes chiffres qu'avant la refonte, visualisation plus lisible.

### Lot 4 — Gestion métier
- Maisons : recherche/tri/filtres/modération, statut clair, détails contextuels et actions sensibles confirmées.
- Utilisateurs : rôles/permissions, recherche et affichage cohérent.
- Saisons : vue liste + échéances + gestion sans altérer les règles de visibilité et de rattachement.
- Communications et campagnes : liste, modèles, progression, calendrier lorsqu'il améliore réellement la compréhension des campagnes ; respecter fuseaux et dates métier existants.
- Journal d'activité et paramètres : harmonisation des filtres, tables, navigation et aides.
- Critère : tous les écrans principaux utilisent les composants communs sans contournement métier.

### Lot 5 — Contenus et documents
- Mettre `ContentAdmin` et `DocumentWorkspace` au même niveau d'ergonomie : en-tête compact, navigation claire, barre d'actions contextuelle, documents lisibles.
- `DocumentEditor` : conserver Tiptap et le moteur de rendu sécurisé existants ; remplacer les commandes à texte de la barre par les icônes Lucide reconnues, regroupées avec séparateurs et infobulles (ex. Annuler, Rétablir, Gras, Italique, Souligné, Barré, Alignement, listes, citation, lien, tableau, couleurs). Garder un **libellé** pour le choix du style de paragraphe. Actifs/disabled visibles, aria-labels et raccourcis seulement s'ils existent.
- Faire passer l'espace rédaction avant la préparation juridique ; panneau de publication compact ou latéral/repliable selon la largeur. Aperçu public fidèle et séparé de la rédaction.
- Les textes courts de l'application restent de simples champs de texte ; ne pas imposer Tiptap à tous les contenus.
- Préserver exactement les brouillons, révisions, conflits 409, versions immuables, relecture, publication et réacceptation, sans migration opportuniste.
- Critère : cycle complet rédaction → sauvegarde → aperçu → contrôle → publication → acceptation inchangé.

### Lot 6 — Nettoyage, tests, release unique
- Supprimer uniquement les styles/composants **prouvés** inutilisés après migration des appelants.
- Contrôler responsive (mobile, tablette, desktop large), contraste, navigation clavier, thème système, états vides et chargements.
- Rejouer lint, TypeScript, tests Vitest, Playwright, build, migrations, Docker/HTTPS suivant le workflow de Halloween Map.
- Scénarios critiques : plusieurs rôles, plusieurs saisons, sans saison, saison en attente, participations et modération, campagnes, restauration et publication de documents, réacceptations, sauvegarde non publiée.
- Relecture des captures avant/après ; aucune dégradation de la page publique.
- Après PR entièrement verte : version **suivante déterminée par le workflow existant**, changelog, fusion main, image GHCR versionnée + latest, tag et GitHub Release vérifiés. Ne pas deviner/incrémenter VERSION au démarrage.
- Déploiement VPS distinct : ne pas l'entreprendre dans ce chantier sans demande explicite.

## 5. Matrice de réemploi LinKs → Halloween Map

| Source LinKs | Transposition proposée | Exigence |
| --- | --- | --- |
| `admin/style.css`, thèmes | Tokens admin / AdminShell | Identité produit préservée, sans collisions CSS |
| `admin/navigation.js` | Navigation React accessible | Droits, états de saison et garde de brouillon conservés |
| `admin/collection.js` | `useCollection` / TableList génériques | Filtrage, ordre, pagination cohérents sans doubler l'existant |
| `admin/charts.js` | Charts React, données et libellés explicites | Identité des métriques préservée, aucun double comptage |
| `admin/calendar.js`, `dates.js` | Calendrier calendrier/agenda adapté | Ne pas importer les concepts de campagnes LinKs dans ceux de Halloween Map |
| `admin/uploads.js` | Hook de mutation/import protégé si nécessaire | Appels obsolètes sans effet, sauvegarde désactivée pendant import |
| États et contrôles du BO LinKs | Composants React existants étendus | Accessibilité, confirmation, loading, success, échec |
| Éditeur documentaire Halloween | Tiptap conservé ; toolbar et layout harmonisés | Versions, publication et preuve juridique strictement préservées |

## 6. Discipline de livraison

- **Une branche dédiée** pour la refonte ; commits traçables par lot. Éviter de modifier en parallèle les mêmes fichiers à partir d'états divergents.
- Ne pas lancer le lot N+1 tant que les primitives qu'il consomme ne sont pas stables.
- Aucun changement API, schéma, sécurité ou modèle de données sans besoin démontré et lot/test distinct.
- Tout écran modifié doit reposer sur les primitives adoptées, sans duplication CSS ou création d'un second design system.
- Documenter les différences voulues avec LinKs au lieu de chercher une copie à l'identique.
- PR conservée en brouillon jusqu'à validation du produit et de la CI ; **une seule release finale** pour cette refonte.

## 7. Définition de terminé

Une personne habituée au back-office LinKs retrouve dans Halloween Map les mêmes codes visuels, les mêmes commandes courantes, la même lecture des données et la même organisation du travail. Un administrateur de Halloween Map conserve **toutes** ses capacités métier, ses données, ses droits et ses scénarios saisonniers. La suite de tests et la chaîne release sont vertes. Aucune intervention manuelle en production n'est imposée par une refonte de présentation.
