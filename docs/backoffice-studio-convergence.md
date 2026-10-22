# Refonte du back-office Halloween Map — convergence DomotiK Studio

Statut : plan de chantier (aucun changement produit à ce stade).
Point de départ : Halloween Map V0.9.10 / LinKs V1.312.
Objectif : livrer une **bêta complète, installable et isolée**, puis la **version majeure stable V1.0** après tests et corrections, sans altérer les fonctionnalités publiques ni les données existantes.

## 1. Vision et critères

**Exigence produit non négociable : le back-office Halloween Map doit reprendre le même environnement visuel que le back-office LinKs**, et non simplement s'en inspirer. Reproduire au plus près la structure de navigation, la silhouette du shell, les proportions, la typographie, les densités, espacements, surfaces, boutons, menus, fenêtres, thèmes, feedbacks, graphiques et comportements sur desktop, tablette et mobile. Les différences visuelles intentionnelles sont les besoins métier, la navigation adaptée aux modules Halloween Map, **son véritable logo officiel et ses accents orange citrouille/violet**. Les teintes cyan/bleu sont propres à LinKs et ne doivent pas devenir l'identité de Halloween Map. Toute divergence doit être expliquée et justifiée dans le compte rendu de refonte.

- Refonte **du back-office uniquement** ; le site public ne change pas. La référence graphique/interaction est l'administration LinKs V1.312, **pas** la page publique LinKs.
- **Branding obligatoire : utiliser le vrai logo Halloween Map conçu pour l'écosystème DomotiK Studio.** Source identifiée dans le dépôt : `artwork/branding/halloween-map-wordmark-official.webp` et, pour les petits usages, `artwork/branding/halloween-map-app-icon-official.webp`. Contrôler leur rendu réel et leurs contraintes de thème avant intégration ; rendre accessible l'asset du back-office via le mécanisme d'assets Next.js, sans modifier arbitrairement le fichier source. La sidebar actuelle affiche `PumpkinMark` via `components/Admin.tsx` : ce dessin générique doit être remplacé **dans le back-office** par le logo officiel, pas recréé en icône/emoji/texte. La signature officielle incluse dans le visuel doit rester intacte. Aucun changement du branding public sans demande séparée.
- **Conserver 100 % des fonctionnalités et permissions de Halloween Map**, y compris les détails, paramètres, actions secondaires et scénarios rares : hors saison, saisons préparées, modération, documents, communication, preuves légales, et toutes les fonctions identifiées à l'audit. Aucune suppression, disparition d'accès ou dégradation de capacité sous couvert de simplification.
- **Repenser si nécessaire l'interface et les parcours d'une fonction existante** (menus, regroupement, organisation des étapes, boutons, vues contextualisées, outils d'édition) pour les aligner sur la logique LinKs. Une refonte ergonomique peut aller au-delà des styles CSS, **mais le résultat métier, les données, les permissions et les garanties de sécurité doivent rester identiques** ; si une fonction risque de changer, valider explicitement avant de la modifier.
- **LinKs est une référence d'interface, pas une liste de fonctionnalités à importer.** Séparer strictement le design/UX, les primitives génériques et les fonctions métier. **Ne pas ajouter** une fonction de LinKs qui ne répond pas à un besoin démontré de Halloween Map.
- Reprendre ou adapter les outils **transversaux uniquement lorsque leur usage est justifié par un écran ou parcours Halloween Map existant** : navigation, listes, tris, tableaux, pagination, graphiques, confirmations, gestion d'images ou états. Le calendrier de LinKs n'est réutilisé que s'il sert clairement des échéances/campagnes/saisons Halloween Map, pas pour reproduire un module LinKs. Aucun équivalent générique utile au besoin identifié ne doit être oublié.
- **Exclus par défaut :** fonctions propres à la page de liens LinKs (liens sponsorisés ou promotionnels, Stories, raccourcis réseau social, codes promotionnels, redirections suivies, KPI de clics/CTR, bibliothèque/thèmes de la page publique LinKs, citations de footer, campagnes commerciales ou autres fonctions sans objet dans Halloween Map). Les modules Halloween Map conservent à la place leurs propres métiers et métriques.
- **Aucun bouton factice, écran vide ajouté pour ressembler à LinKs, réglage sans effet, fausse statistique ni menu correspondant à une fonction LinKs non nécessaire.** La parité demandée concerne l'environnement graphique et la cohérence des interactions, pas la liste des entrées ni un volume artificiel de fonctionnalités.
- Le menu principal reprend la disposition et les interactions de LinKs, mais reflète les **rubriques complètes de Halloween Map** ; navigation secondaire et menus contextuels autorisés seulement si la découverte de chaque fonction reste évidente et testable. Aucune fonction simplement cachée dans un sous-menu sans contrôle de découvrabilité.
- Mode clair, sombre, système ; un seul sélecteur d'apparence cohérent dans l'administration.
- États de chargement, succès, erreurs, désactivation, absence de données et brouillon cohérents ; focus et navigation clavier fiables.
- Même logique de composants et mêmes comportements ; pas nécessairement le même code, car LinKs est en HTML/JavaScript et Halloween Map en React/Next.js.
- **Décision architecturale permanente : back-office réutilisable mais administration indépendante pour chaque application.** LinKs, Halloween Map et les futurs projets conservent leur propre URL d'administration, authentification, utilisateurs, permissions, API, base, configuration, secrets, infrastructure, mises à jour et déploiements. Le socle visuel et les blocs génériques sont partagés ; **aucun portail d'administration central, SSO obligatoire, base partagée ni dépendance opérationnelle entre applications** ne fait partie de l'objectif.
- Respecter l'identité « Halloween Map by DomotiK Studio » dans son propre back-office ; partager les outils, mais conserver les spécificités métier et l'autonomie de chaque produit.
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
8. Structurer les outils à vocation commune comme des **blocs fonctionnels réutilisables et versionnables** avec contrats documentés, en distinguant noyau générique, interface et adaptateurs métier. Extraire un module partagé lorsque son comportement est confirmé par des usages réels, sans couplage fort entre les déploiements ou les dépôts.

## 4. Ordre des lots : un lot validé avant de reprendre les mêmes fichiers

### Lot 0 — Audit, maquette et matrice de non-régression
**Démarré le 19 octobre 2026.** Livrables initiaux réalisés par inspection du code : [inventaire et matrice des fonctionnalités](v1.0-lot0-fonctionnalites-et-regressions.md) (57 parcours), [contrat d'interface et catalogue initial des blocs](v1.0-lot0-contrat-interface.md). Référence V0.9.10 : [CI main verte](https://github.com/Mick7784/halloween-map/actions/runs/39152116080). **État : en cours, non validé pour passage au lot 1** ; restent les captures comparatives et la recette par rôles, dont l'exécution navigateur n'a pas été effectuée lors de ce premier audit documentaire.

- Cartographier **tous** les écrans, menus, dialogues et actions de l'administration, avec droits requis et périmètres globaux/saisonniers. Établir une **matrice de conservation exhaustive** (fonction actuelle → nouvel emplacement → composants utilisés → rôle(s) habilité(s) → scénario e2e) signée avant d'entreprendre le redesign.
- Comparer **écran à écran** l'administration LinKs et Halloween Map à plusieurs tailles en clair/sombre/système, y compris sidebar, topbar, carte, liste, formulaire, dialogue, menus, états de chargement, graphiques et mobile. Captures de référence obligatoires : c'est une **parité d'expérience visuelle** recherchée, pas seulement des couleurs proches.
- Fixer les tokens, grille, densité, disposition du shell, couleurs sémantiques, contrôles et états.
- Capturer des références avant travaux et vérifier la suite CI de base.
- Critère : inventaire exhaustif et conventions adoptées avant transformation de composants.

### Lot 1 — Fondations et composants communs
- Tokens + thèmes + primitives React : Button/IconButton, Input/Select/Textarea, Field, Toggle/Checkbox, Badge, Card/Panel, Alert/Toast, Dialog/Confirmation, Dropdown/ActionMenu, Empty/Loading, Tabs, Table, Pagination, SaveStatus.
- Implémenter recherche/tri/pagination dans un outil de collection générique, adapté de LinKs, sans dépendance au métier.
- Écrire exemples d'usage et tests unitaires/accessibilité ; préserver les signatures utilisées ou migrer tous les appels concernés.
- Critère : composants testés, thème sans flash gênant, aucune régression des interfaces publiques.

### Lot 2 — Shell et navigation
- Reproduire au plus près **le shell de LinKs** : menu latéral, positionnement, topbar, dimensions, typographie, état actif, groupes, bas de sidebar, contenu, thèmes, profil, lien site public, responsive, raccourcis et titres. Adapter le contenu des menus à Halloween Map, pas leur philosophie ergonomique.
- Afficher le **wordmark officiel Halloween Map by DomotiK Studio** dans l'en-tête/branding de la sidebar en remplacement de l'actuel `PumpkinMark`, avec éventuelle variante compacte fondée sur l'icône officielle. Éviter tout dessin ou marquage de substitution.
- Rendre la navigation conditionnelle aux permissions **existantes** ; conserver l'accès de l'administrateur à toutes les fonctions autorisées.
- Gérer le contexte saison : actif, en préparation, aucune saison, consultation historique, global.
- Sortir les règles de présentation de `Admin.tsx` par étapes cohérentes ; ne pas réécrire son chargement de données.
- Critère : navigation stable desktop/mobile/clavier, aucun écran ou action orphelin ; comparaison de captures LinKs/Halloween Map sur états équivalents et validation explicite du logo officiel.

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
- Critère : **tous** les écrans métier, détails, dialogues, actions et paramètres de l'inventaire ont un nouvel emplacement et sont utilisables ; pas seulement les écrans principaux. Parcours existants conservés malgré une navigation repensée.

### Lot 5 — Contenus et documents
- Mettre `ContentAdmin` et `DocumentWorkspace` au même niveau d'ergonomie : en-tête compact, navigation claire, barre d'actions contextuelle, documents lisibles.
- `DocumentEditor` : conserver Tiptap et le moteur de rendu sécurisé existants ; remplacer les commandes à texte de la barre par les icônes Lucide reconnues, regroupées avec séparateurs et infobulles (ex. Annuler, Rétablir, Gras, Italique, Souligné, Barré, Alignement, listes, citation, lien, tableau, couleurs). Garder un **libellé** pour le choix du style de paragraphe. Actifs/disabled visibles, aria-labels et raccourcis seulement s'ils existent.
- Faire passer l'espace rédaction avant la préparation juridique ; panneau de publication compact ou latéral/repliable selon la largeur. Aperçu public fidèle et séparé de la rédaction.
- Les textes courts de l'application restent de simples champs de texte ; ne pas imposer Tiptap à tous les contenus.
- Préserver exactement les brouillons, révisions, conflits 409, versions immuables, relecture, publication et réacceptation, sans migration opportuniste.
- Critère : cycle complet rédaction → sauvegarde → aperçu → contrôle → publication → acceptation inchangé.

### Lot 6 — Nettoyage et qualification de la bêta complète
- Supprimer uniquement les styles/composants **prouvés** inutilisés après migration des appelants.
- Contrôler responsive (mobile, tablette, desktop large), contraste, navigation clavier, thème système, états vides et chargements.
- Rejouer lint, TypeScript, tests Vitest, Playwright, build, migrations, Docker/HTTPS suivant le workflow de Halloween Map.
- Scénarios critiques : plusieurs rôles, plusieurs saisons, sans saison, saison en attente, participations et modération, campagnes, restauration et publication de documents, réacceptations, sauvegarde non publiée.
- Passer **ligne par ligne la matrice de conservation** : chaque fonction doit avoir sa preuve d'accès et de fonctionnement après refonte ; aucun abandon silencieux. Comparaison visuelle des parties équivalentes à LinKs et vérification de l'identité officielle Halloween Map.
- Relecture des captures avant/après ; aucune dégradation de la page publique.
- Après validation du chantier complet : préparer une **bêta déployable V1.0-beta.1** (ou itération beta.2 en cas de correction), avec changelog, image GHCR identifiable par tag et digest, et GitHub Release explicitement prerelease ; ne pas toucher à `latest` ni à la production lors de la publication bêta.
- Après recette réelle de la bêta et corrections testées : préparer **V1.0 stable**, fusion contrôlée sur main, vérification version/image GHCR/tag/GitHub Release. `latest` est mis à jour uniquement pendant cette publication stable, jamais lors d'une bêta.
- Ne pas changer VERSION prématurément ni deviner une version intermédiaire ; suivre une stratégie de versionnement explicite validée, avec contrôles CI dédiés.
- Déploiement VPS distinct : ne pas l'entreprendre dans ce chantier sans demande explicite.

## 4 bis. Filtre explicite anti « copier-coller fonctionnel »

Avant de retenir une fonctionnalité ou un composant de LinKs, appliquer cet ordre de décision :

1. **Habillage / interaction partagée ?** Reprendre au plus près : shell, sidebar, topbar, typographie, palettes, marges, cartes, boutons, navigation, comportements et états.
2. **Composant ou utilitaire générique servant à Halloween Map ?** Adapter à React et aux besoins réels des écrans existants, en conservant les contrats Halloween Map. Exemple : tableau triable pour les maisons, graphique accessible pour les métriques de saison, contrôles de dates pour ses communications.
3. **Fonction métier LinKs sans besoin Halloween Map ?** **Ne pas l'implémenter, ne pas afficher son menu et ne pas introduire ses données**, même si elle est très aboutie dans LinKs.
4. **Fonction métier Halloween Map sans équivalent LinKs ?** **La conserver intégralement**, réimaginer si utile son parcours et son emplacement, et appliquer les conventions d'interface LinKs ; ne pas la masquer ou la supprimer.

| Exemple | Décision |
| --- | --- |
| Sidebar, toolbar, listes, formulaires, statuts et modales LinKs | **Même système visuel et comportement** |
| Recherche/tri/pagination dans les maisons et utilisateurs | **Adapter la primitive générique aux contrats Halloween Map** |
| Graphiques LinKs | **Réemployer la grammaire visuelle avec les seules vraies mesures Halloween Map** |
| Calendrier promotionnel LinKs | **Pas de copie** ; recycler des patterns uniquement si une vraie vue calendrier d'Halloween Map en a besoin |
| Liens suivis, campagnes promo, codes réduction et Stories LinKs | **Ne pas importer** |
| Éditeur de thèmes de la page publique LinKs, bibliothèques de fonds et citations | **Ne pas importer**, sauf demande produit séparée ; thèmes d'administration partagés, eux, conservés |
| Saisons, inscription de maisons, modération, parcours, consentements, emails et permissions Halloween Map | **Conserver et adapter l'ergonomie à LinKs** |

**Recette supplémentaire :** chaque nouvel écran, entrée de navigation, paramètre, champ, composant fonctionnel ou statistique doit être justifié par une fonction métier existante de Halloween Map ou par une amélioration ergonomique explicitement validée ; éliminer tout ajout gratuit issu de LinKs. Inversement, aucune fonction antérieure de Halloween Map ne doit disparaître.

## 5. Matrice de réemploi LinKs → Halloween Map

| Source LinKs | Transposition proposée | Exigence |
| --- | --- | --- |
| `admin/style.css`, thèmes | Tokens admin / AdminShell | **Même rendu et comportement que l'administration LinKs**, avec logo officiel Halloween Map et sans collisions CSS |
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
- **Viser la reproduction la plus fidèle possible de l'interface LinKs.** Documenter et justifier uniquement les différences indispensables aux fonctionnalités Halloween Map, à l'accessibilité ou aux contraintes React. Ne pas interpréter ce chantier comme une simple ressemblance esthétique.
- PR conservée en brouillon pendant le chantier ; **une release bêta complète pour essais puis une release V1.0 stable** après corrections et validation ; ne pas livrer des versions intermédiaires à chaque lot.

## 7. Définition de terminé

Sans jamais recevoir des modules propres à LinKs qui ne servent pas Halloween Map, une personne habituée au back-office LinKs **reconnaît immédiatement la même interface d'administration** dans Halloween Map : disposition des menus, shell, composants, densité, thèmes, commandes, animations et retours d'état. Seuls le logo officiel Halloween Map by DomotiK Studio, les titres et les outils spécifiques au produit changent. Un administrateur de Halloween Map retrouve **100 % de ses fonctions**, même réorganisées ou ergonomiquement modernisées, avec les mêmes capacités métier, données, droits et scénarios saisonniers. La matrice de conservation doit être entièrement validée. La suite de tests et la chaîne release sont vertes. Aucune intervention manuelle en production n'est imposée par une refonte de présentation.

## 8. Protection du fonctionnement existant — exigence prioritaire

**La qualité fonctionnelle de Halloween Map V0.9.10 constitue la référence, non une variable d'ajustement esthétique.** La convergence avec LinKs peut refondre la manière de naviguer et d'utiliser chaque outil, **pas** les règles, les résultats ni les garanties existantes.

### Avant toute modification d'écran
1. Fixer le commit de référence V0.9.10 et documenter l'état courant des API, permissions, comportements saisonniers, données et tests. Exécuter la suite existante avant la première modification.
2. Pour chaque écran et chaque commande : inventorier les scénarios nominaux et limites, le ou les rôles autorisés, le contrat de lecture/écriture, les effets sur les données, l'usage saisonnier et les intégrations publiques.
3. Consigner un tableau **avant → après** : entrée ancienne, nouvelle entrée, action, droits, états successifs et résultat métier attendu ; toute fonction inventoriée doit rester atteignable.
4. Ajouter ou renforcer les tests de caractérisation **avant** de réécrire un parcours complexe, notamment quand les comportements ne sont couverts que partiellement par les tests existants.
5. Classer le risque de chaque zone : faible (styles/présentation), moyen (navigation/gestion d'état) ou élevé (sauvegarde, calendrier, permissions, modération, actions sensibles, contrats de données).

### Pendant la refonte
- Préférer un changement de présentation/interaction à une modification du service métier. Conserver les mêmes API, schémas, validations, valeurs par défaut et effets tant qu'aucun besoin explicite n'a été validé.
- Refuser les raccourcis qui supprimeraient des données, opérations secondaires ou contrôles de sécurité ; afficher les options peu fréquentes dans un contexte approprié plutôt que de les effacer.
- Changer une fonction complexe en petites étapes : tests caractérisant l'état initial → adaptation d'interface → tests de parité → revue → étape suivante.
- Ne jamais supprimer l'ancien code métier comme « inutile » sur la seule base d'une recherche d'appels dans l'UI ; contrôler historique, API, migration, worker et données réelles concernées.
- Toute modification de logique métier imprévue doit être arrêtée, isolée et soumise à une décision spécifique. Aucun changement silencieux de politique métier dans un lot visuel.
- Ne pas modifier le calendrier des saisons, les fuseaux/décalages, les règles d'ouverture des inscriptions, les rattachements aux saisons, la visibilité de la carte, les restrictions public/admin, ni la façon de traiter les changements d'heure.
- Ne pas modifier l'authentification, les rôles, la sémantique des permissions, les vérifications côté serveur, la modération, ni les invariants de publication/acceptation juridique.
- Éviter les migrations lors d'un travail d'interface ; si une migration s'avère véritablement nécessaire, faire un lot séparé avec tests PostgreSQL à partir de la version antérieure, sauvegarde et stratégie de retour arrière.

### Scénarios métier à protéger explicitement

| Domaine | Invariants / vérifications minimales |
| --- | --- |
| Saisons | Absence de saison, saison active, saison en préparation, archives, passage de saison, dates d'ouverture/fermeture, permissions et contexte consulté |
| Carte publique | Visibilité conditionnée à une saison active, indépendamment du rôle de l'utilisateur ; aucun changement involontaire des données exposées |
| Maisons | Inscription publique seulement dans une saison active et fenêtre ouverte ; capacité des administrateurs habilités de créer/éditer hors de ces contraintes ; rattachement automatique à la saison en préparation lorsque applicable |
| Modération | États en attente/validé/refusé, actions et conséquences de chaque transition, listes/notifications, historique et contrôle de permissions |
| Utilisateurs | Inscription, authentification, comptes et rôles, permissions, redirections, récupération et gestion des profils |
| Communications | Campagnes, modèles, messages, validation, envois, historiques, dates, erreurs et absence d'envoi imprévu |
| Statistiques | Identité des mesures, agrégations, périodes, fuseaux, sources et absence de compteurs redondants ou modifiés |
| Parcours et collecte | Calculs, géométrie, visibilité des itinéraires, restauration et collecte sans changement des données |
| Documents officiels | Brouillons, révisions/conflits 409, rendu riche, versions publiées immuables, comparaison, restauration, publication, réacceptations et conservation des preuves |
| Maintenance | Migrations, worker, purge saisonnière, configuration, journaux et compatibilité des installations historiques |

### Validation continue et critères d'arrêt
- À chaque lot : lint/TypeScript, tests unitaires ciblés, tests API et end-to-end des parcours impactés ; reprendre les tests non couverts **avant** de considérer le lot terminé.
- Avant fusion : suite complète Vitest/Playwright, parcours par rôle et saison, base PostgreSQL réelle (base vierge et migration depuis l'ancienne version), build/Docker/HTTPS existants et inspection de captures d'écran aux formats prévus.
- Faire des parcours de bout en bout sur données de test réalistes, particulièrement les actions sensibles et les opérations multietapes, et comparer **les résultats métier avant/après**, pas seulement le rendu.
- Test de non-altération de la page publique et des chemins d'accès à l'API depuis les clients historiques.
- Si une régression, une perte de fonction, une variation de résultats, une faille d'accès ou une ambiguïté de migration apparaît : **ne pas publier la bêta, ne pas promouvoir en stable, corriger puis tout revalider**. Les défauts détectés par les essais bêta sont corrigés et retestés avant V1.0.
- Pas de déclaration « zéro régression » sur la seule CI : conserver une recette documentée et des risques résiduels explicites. Une bêta n'est pas considérée comme une validation fonctionnelle finale ; ne publier V1.0 que lorsque les critères de stabilisation sont atteints.

## 9. Stratégie de versions validée : bêta complète → V1.0 stable

**Décision du 19 octobre 2026** : Halloween Map sort de la série V0.9.x pour cette refonte majeure et vise **V1.0** comme premier jalon stable. Il y aura **une bêta complète déployable** pour essais, puis **une release finale stable** après corrections. Éviter toute release publique de présentation à la fin de chaque lot technique.

### Identifiants prévisionnels
- Base en production servant de référence : **V0.9.10**.
- Bêta candidate de la refonte : **V1.0-beta.1** ; si une autre bêta est nécessaire après correction, incrémenter `beta.2`, etc., **sans écraser le tag précédent**.
- Release finale stable : **V1.0**.
- Les identifiants sont une **cible de version**, pas une modification immédiate de `VERSION` ni une publication déjà effectuée. Avant la bêta, s'assurer que les tags visés n'existent pas déjà et ajuster en cas de collision, après examen.

### Contraintes réelles du workflow observé avant développement

**Le workflow actuel ne sait pas publier cette stratégie tel quel.** `.github/workflows/ci.yml` ne déclenche sa publication que pour `main` ; son validateur `VERSION` n'accepte pas `-beta.1` ; les images reçoivent toujours le tag `latest` ; les GitHub Releases créées portent toujours le suffixe Beta et `--prerelease`. De plus, `scripts/version.mjs` (fonction `nextVersion`) rejette actuellement `V1.0` comme entrée, ce qui empêcherait certaines opérations de versionnement ultérieures. Le workflow `preprod.yml` est lié à une ancienne branche spécifique : ne pas supposer qu'il publie notre bêta.

**À réaliser et à tester avant toute publication :**
1. Étudier les références à `VERSION`, aux regex, aux tags, au badge de version, au compose et aux scripts de tests pour prendre en charge un canal `beta` et un canal `stable`.
2. Ajouter une publication bêta explicitement demandée et isolée (workflow manuel sur la branche/revision validée ou workflow dédié), avec validations complètes, tag GitHub `V1.0-beta.1`, GHCR `:V1.0-beta.1`, notes de version et drapeau **prerelease**. **Ne pas pousser `:latest`, ne pas déclencher un déploiement VPS et ne pas écraser une autre version publiée.**
3. Vérifier la cohérence `VERSION` embarquée, commit source, tag Git, GHCR manifest/digest et GitHub Release de la bêta ; préparer instructions d'installation, sauvegarde, retour arrière applicatif et consignes de tests sur environnement isolé.
4. Après retours de tests, intégrer les correctifs et relancer la suite complète ; seulement alors basculer sur `V1.0`, publier une release GitHub **stable** (sans `--prerelease` ni « Beta » dans le titre), image GHCR `:V1.0` et mise à jour `:latest`, vérifiés sur le même digest.
5. Tester la logique de `scripts/version.mjs` et de la CI pour que `V1.0` soit une version valide lors des prochaines évolutions ; ne pas casser le parcours de mise à jour des versions historiques V0.9.x.
6. Séparer strictement **publication de l'image** et **mise à jour de l'instance hébergée** : aucun déploiement de production n'est autorisé par cette décision. Les tests utilisateurs s'effectuent sur une instance isolée avec sauvegarde et base distincte.

### Conditions de promotion de la bêta en stable
- Ensemble de la refonte présent : même expérience d'administration que LinKs, vrai logo officiel Halloween Map, aucun module métier LinKs inutile.
- Matrice d'inventaire Halloween Map complètement couverte ; tous les workflows et rôles accessibles.
- Régression et sécurité : aucun défaut bloquant connu, vérifications d'API et de saisonnalité, publication juridique, modération, communications, statistiques, carte et parcours.
- CI complète verte (tests unitaires/e2e, TypeScript, build, PostgreSQL/migrations, Docker, HTTPS) + recette visuelle et fonctionnelle manuelle en condition isolée.
- Retours de la bêta traités et documentés, avec changements vérifiables ; notes de version, sauvegarde et modalités de rollback documentées.
- Version V1.0 déclarée stable **uniquement** après ces validations. La bêta reste clairement annoncée comme non destinée à remplacer la production.

## 10. Vision DomotiK Studio validée — bibliothèque de blocs, administrations indépendantes

**Décision de produit du 19 octobre 2026.** Le back-office commun est un **socle logiciel et d'expérience**, pas une application centrale contrôlant toutes les autres. Chaque projet embarque/importe les blocs dont il a besoin, les adapte par configuration ou via des interfaces d'extension, et continue de fonctionner de façon autonome.

### Architecture cible

1. **Socle d'administration partagé** : tokens, thèmes, navigation, dispositions, boutons, champs, états, tableaux, modales, accessibilité et conventions. L'apparence commune est la référence LinKs ; les menus et le logo reflètent chaque produit.
2. **Bibliothèque de blocs fonctionnels** : unités cohésives et spécialisées (éditeur riche, liste filtrable, visualisation de statistiques, média, calendrier, etc.). Un bloc expose un contrat stable (props/API, données d'entrée/sortie, évènements, états, permissions attendues comme capacités injectées), ses tests, versions et documentation. Il n'embarque pas une base, des comptes ou les règles juridiques d'une application particulière.
3. **Adaptateurs par application** : conversion vers ses API/données existantes, contrôle d'autorisations côté serveur, persistence, validations, notifications et règles métier. Les adaptations spécifiques sont des couches externes au cœur du bloc, **pas** des forks divergents à maintenir.
4. **Chaque produit est déployé séparément** : LinKs conserve son site et son back-office, Halloween Map aussi. Aucune dépendance réseau runtime envers un « back-office DomotiK central » ou une autre application. Les versions des blocs sont intégrées et épinglées dans chaque application, de sorte qu'une mise à jour de LinKs ne modifie pas spontanément Halloween Map.
5. **Compatibilité des stacks** : LinKs utilise des scripts DOM/JS et Halloween Map React/Next.js. Extraire d'abord du code véritablement portable (modèles, validations génériques, fonctions pures, design tokens) ; les interfaces visuelles peuvent avoir des adaptateurs ou implémentations par framework avec contrat commun. Ne pas promettre de partager tel quel un composant React avec le rendu vanilla JS de LinKs.
6. **Maintenance et évolutions** : améliorer d'abord la source d'un bloc, tester sa compatibilité dans les projets consommateurs, puis mettre à jour chaque application à son rythme. Versionner/documenter les ruptures de contrat et permettre une reprise ou un rollback indépendants.

### Exemple — bloc d'édition de texte

- **Partageable** : barre d'outils, commandes typographiques, contenu éditable, raccourcis, statuts, aperçu, contrat de changement/sauvegarde et extension optionnelle.
- **Adaptation Halloween Map** : Tiptap existant, formats autorisés, validation de contenu, documents légaux immuables une fois publiés, révisions, conflits 409, publication, acceptation et réacceptation. Ces garanties restent du ressort des services de Halloween Map ; ne jamais les déplacer vers un noyau générique mal conçu.
- **Adaptation LinKs** : contenu et interfaces existants sans lui imposer des documents juridiques, une publication à versions ou l'installation de Tiptap s'il n'en a pas besoin.
- **Principe** : si les besoins éditoriaux sont vraiment différents, mutualiser le cœur utile et autoriser des capacités optionnelles ; éviter de forcer toutes les apps à porter la fonction la plus avancée.

### Ce que cela impose au chantier Halloween Map V1.0

- Le premier objectif reste **la refonte fiable du back-office Halloween Map** et la livraison `V1.0-beta.1` puis `V1.0`. Ne pas ajouter comme prérequis une migration complète de LinKs ou la création d'une plateforme partagée complexe.
- À l'audit, marquer chaque partie comme : **bloc déjà générique**, **candidat à extraction**, **adaptateur métier**, ou **spécifique Halloween Map**.
- Lors de la refonte, préférer des API de composants configurables, sans dépendances cachées à une saison ou à un module particulier. Préserver tous les comportements actuels avec tests de caractérisation.
- Extraire/publier progressivement les blocs réellement stables vers une bibliothèque partagée distincte si les deux applications en bénéficient et si la compatibilité des stacks est maîtrisée. Le choix du dépôt, du packaging et du versionnement de cette bibliothèque sera pris lors de son implémentation ; il n'est pas imposé par ce document.
- Ne pas faire d'un partage futur un point de défaillance : Halloween Map doit pouvoir démarrer, authentifier, éditer, publier et se mettre à jour même si LinKs est arrêté, inaccessible ou déployé sur une autre version.
- **Critère final** : même philosophie et interface de back-office, blocs réutilisables quand c'est utile, aucune fonction LinKs inutile, aucune régression Halloween Map et **aucune administration centralisée**.

