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

* `lib/content.ts` : catalogue, substitutions, permissions `admin.access` et
  `content.manage`, brouillons et publications. Sessions et CSRF : route API
  commune et `lib/auth.ts`. Journal métier limité à 90 jours.
* `VisualEditor` : Tiptap 3 aplati vers un sous-ensemble Markdown ; réutilisé
  ailleurs, notamment les messages. Le conserver pour ces usages.
* `Editorial` : rendu React Markdown historique ; conserver exactement ce
  chemin pour les documents anciens. `editorial-format` sert aussi aux emails.
* Migration 003 : versions publiées immuables, index de version active.
* `service.ts` filtre les maisons sur les versions CGU/consignes. Le formulaire
  n'envoie que GUIDELINES_ONLY mais enregistre actuellement une version CGU
  sans acceptation. Risque de disparition des maisons après publication.
* `ParticipationForm` et `RoutePreparation` : prise de connaissance des consignes,
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

État : phase 0 terminée ; phase 1 en cours. Aucune release publiée pour ce chantier.
