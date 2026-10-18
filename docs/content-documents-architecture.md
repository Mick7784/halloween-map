# Contenus & documents — architecture et suivi

## Audit initial (18 octobre 2026)

Base : main V0.9.9. Branche unique : `work/content-documents-studio`.
Les branches distantes historiques ne sont pas des bases de ce chantier.
`ci.yml` vérifie PostgreSQL 17, migrations rejouées, lint/TS, Vitest,
Playwright, Docker et HTTPS. Une fusion main avec VERSION inédit publie
GHCR (version + latest), vérifie version/révision/digest, puis crée le tag et
la release. Les PR ordinaires ne publient pas de release. Ne pas changer
VERSION avant la validation finale. Aucun accès VPS.

### Frontières existantes

- `lib/content.ts` : catalogue, substitutions, permissions `admin.access` et
  `content.manage`, brouillons et publications. Sessions et CSRF : route API
  commune et `lib/auth.ts`. Journal métier limité à 90 jours.
- `VisualEditor` : Tiptap 3 aplati vers un sous-ensemble Markdown ; réutilisé
  ailleurs, notamment les messages. Le conserver pour ces usages.
- `Editorial` : rendu React Markdown historique ; conserver exactement ce
  chemin pour les documents anciens. `editorial-format` sert aussi aux emails.
- Migration 003 : versions publiées immuables, index de version active.
- `service.ts` filtre les maisons sur les versions CGU/consignes. Le formulaire
  n'envoie que GUIDELINES_ONLY mais enregistre actuellement une version CGU
  sans acceptation. Risque de disparition des maisons après publication.
- `ParticipationForm` et `RoutePreparation` : prise de connaissance des consignes,
  distincte des CGU. Les informations de confidentialité ne sont pas un consentement.

### Inventaire des textes

Le catalogue `contentDefaults` contient les contextes Accueil, Compte,
Participation, Confidentialité, Interface. Seuls onze textes longs sont exposés
dans l'administration actuelle. Les titres/accroches et messages d'accueil du
catalogue peuvent être exposés sans migration. Les libellés de validation,
permissions, erreurs, statuts métier, contrôles et boutons restent dans le code.
Les textes RGPD existants et les quatre `legalDefaults` sont conservés ; ces
modèles ne constituent pas une validation juridique. Aucune rédaction de CGU.

### LinKs

Lecture de `admin/index.html`, `admin/navigation.js`, `admin/style.css`,
`admin/theme-init.js` et `site/theme-tokens.json`. Retenir navigation secondaire,
en-tête avec contexte, panneaux sobres, aide proche des champs, statut de
sauvegarde et thèmes clair/sombre/système. LinKs est une application distincte
(HTML/JS), sans dépendance de code à introduire. Les primitives Studio restent
locales au module et leur CSS est limité à son conteneur.

## Contrats arrêtés avant UI

Conserver body Markdown et ses octets pour toutes les anciennes versions.
Ajouter format (`markdown` ou `tiptap`), content_json, revision entière,
created_by/published_by et état de préparation. JSON Tiptap validé par une
grammaire fermée : pas de HTML libre, scripts, attributs ou styles arbitraires.
Un unique moteur pur rend le JSON en HTML échappé pour public/aperçu.
Les tableaux, liens, couleurs et alignements utilisent des listes autorisées.
Limites de taille, profondeur et nombre de nœuds contre les documents pathologiques.

API existante `admin/content` étendue : draft avec revision attendue et base
publiée ; publication avec revision et version active attendues, confirmation
et contrôle de préparation ; contrôle d'impact avant confirmation. Conflit 409
sans écrasement. Sauvegarde != publication. Restauration = nouveau brouillon,
jamais modification d'une version publiée. Une comparaison affiche ancien et
nouveau dans le même moteur documentaire.

Historique juridique durable séparé des journaux temporaires : événements de
publication et acceptations réellement effectuées, sans adresse/IP/maison.
Référence au compte nullable après suppression ; durée documentée et mécanisme
de purge à prévoir avant livraison. Les anciennes versions/acceptations ne
doivent pas être réinterprétées comme de nouveaux consentements.

Publication importante : annoncer les participants concernés, demander une
réacceptation explicite depuis leur participation, conserver la visibilité
pendant la régularisation. Ne plus coupler publication et disparition carte.
Verrou de l'instance partagé par publication/acceptation afin de refuser une
acceptation devenue obsolète pendant la requête.

## Migration additive

Migration 015 uniquement additive : colonnes avec valeurs par défaut compatibles,
tables de preuve, extension du garde d'immuabilité aux nouveaux champs. Aucun
UPDATE du contenu historique, aucune suppression de compte/maison/saison.
Tester depuis 014 et base vierge, rejouer la migration. Sauvegarde standard du
volume PostgreSQL avant mise à jour par l'exploitant ; rollback applicatif sans
suppression des nouvelles colonnes. Ne pas retirer 015 après usage du JSON.

## Séquence et critères de passage

0. Audit et contrats : arrêtés ci-dessus.
1. Moteur, migration, API et tests métier/security ; stabiliser avant éditeur.
2. Éditeur documentaire distinct, outils réels, sommaire, compteurs et aperçu.
3. Navigation trois sections, textes simples, documents dédiés, liens conservés.
4. Publication et acceptations intégrées, preuves et régularisation testées.
5. Suite complète, PostgreSQL et navigateur, vérification des régressions.
6. Revue, changelog/version, PR verte, fusion et une seule release vérifiée.

État : phases 0 à 5 terminées ; phase 6 en cours pour V0.9.10. Fusion et publication conditionnées à la CI finale verte.

## Résultats intermédiaires et décisions finales

- Base réelle confirmée : main `5b66bb03`, tag V0.9.9 ; dernière livraison verte.
- Fondations : 294 tests verts avant le développement UI. Éditeur : tests des
  commandes Tiptap réelles, aller-retour avec la grammaire serveur et nettoyage
  du collage. Interface : tests des trois sections et des paramètres préservés.
- Intégration : 300 tests verts, lint/TypeScript et build ; parcours navigateur
  réel des conflits, coupure réseau, publication, mobile et restauration validé.
- Régularisation : test réel de publication 2026.3 pendant la lecture 2026.2,
  refus de la version périmée, actualisation sans perdre les champs maison,
  nouvelle acceptation explicite et preuve uniquement de la version 2026.3.
- Défauts révélés par les contrôles : fichiers temporaires Vitest bloqués par
  l'environnement Windows (tests exécutés hors restriction), verrou npm incomplet
  sur Linux (corrigé avec npm récent), couleur RGB sérialisée par le navigateur
  (normalisation vers la palette), états sans document et premier clic d'une case
  annulé par un rendu déclenché en capture (corrigés et retestés).
- Frontières finales sans cycle : `legal-documents` (contrats/lecture historique),
  `content-validation` (textes), `document-format` (grammaire/rendu purs),
  `document-service` (transactions), `content` (façade et catalogue), composants UI.
- Les anciennes lignes DRAFT ne sont pas supprimées ; un sélecteur permet de
  reprendre plusieurs brouillons hérités. Les nouvelles créations évitent leur
  multiplication. Le travail est verrouillé pendant la requête de sauvegarde.
- Conservation : événements de publication et acceptation cinq ans, purge par
  le worker existant ; suppression de compte rend les références de compte nulles.
  Aucun identifiant de maison, adresse, IP ou copie de profil dans ces preuves.
  Cette politique technique doit être décrite par l'exploitant dans ses textes ;
  elle ne vaut pas validation juridique des documents.
- Aucun changement des textes légaux initiaux ni des workflows de livraison.
  Le projet marque historiquement ses releases Beta/prerelease ; ce marquage
  reste celui du workflow existant. La stabilité est vérifiée par les contrôles.

## Validation finale avant livraison

- 303 tests unitaires/métier verts ; lint, TypeScript, build et audit production verts.
- 208 parcours navigateur couverts : 207 verts dans la passe globale PostgreSQL 17, puis rejeu vert des trois scénarios documentaires après correction du sélecteur de capture. La CI finale rejoue toute la suite sur la révision de livraison.
- PostgreSQL 17 local isolé : base vierge, double migration et upgrade depuis 014 vérifiés ; les pertes de connexion de la base légère PGlite socket ont été écartées en testant sur le moteur réel.
- Captures clair/sombre et aperçu mobile inspectées ; correction de l'héritage des variables de thème, limitée au module.
- Dernière revue : rendu de confidentialité actif prioritaire après publication riche ; métadonnées d'auteurs privées ; références CGU sans date jamais considérées acceptées ; erreurs d'actualisation traitées ; formulaires verrouillés pendant sauvegarde.
- CI de travail complète verte sur dbeaf657 (PostgreSQL, 208 parcours, Docker, HTTPS) ; validation finale exigée sur le nouveau commit versionné avant fusion.
- Version choisie par le système existant : V0.9.10. Une seule release après fusion ; workflow inchangé, marquage Beta/prerelease conservé.
