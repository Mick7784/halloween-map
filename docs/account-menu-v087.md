# Audit et contrat du menu global V0.8.7

Base : V0.8.6, commit 245a070e4f27882c0bd821f330fe0a8a9bb450b0.

## Surfaces inventoriées

`PremiumHome` possédait son propre état et utilisait `UserMenu`. `Application` affichait un second emplacement de ce menu pour la carte, le back-office, les pages légales, À propos, connexion, inscription et récupération de mot de passe. Les liens `/account`, le nom du compte dans le header et le profil du bandeau de collecte ouvraient `AccountOverlay`. `/participant` ouvrait `ParticipationOverlay`. L’annuaire `AdminUsers` proposait aussi des liens Mon compte pour l’utilisateur courant ; les fiches des autres utilisateurs restent des outils de gestion administrative et ne deviennent pas des menus personnels.

Ces points d’entrée aboutissent maintenant à une seule instance de `UserMenu` dans `Application`. Le compte et la participation utilisent une seule fenêtre `AccountOverlay` ; `ParticipationOverlay` fournit son contenu en mode intégré, sans deuxième header ni deuxième dialogue. Les pages restent montées derrière la fenêtre, y compris la carte et la collecte active.

## Inventaire des fonctions et conditions conservées

| Fonction | Conditions / comportement |
| --- | --- |
| Connexion, mot de passe oublié, création | Visiteur anonyme ; mêmes API et destinations sûres |
| La carte | Compte connecté et `state.mapAccessible` |
| Ma participation / inscription | Compte connecté ; formulaire et gestion existants, vérification email et saison contrôlées comme avant |
| Gestion de maison | Informations/adresse/position confirmée, activités, horaires, frayeur, description, accès ; sauvegarde, stock de bonbons, accueil/fin/reprise et suppression confirmée conservés |
| Préparer ma collecte | Compte connecté et `state.collectionAccessible`, destination `/map#parcours` |
| Administration | Permission effective `admin.access` ; jamais le seul nom du rôle |
| Mes informations | Nom et email ; changement d’email protégé par mot de passe actuel, statut vérifié, renvoi de vérification |
| Mot de passe | Mot de passe actuel, nouveau et confirmation ; minimum existant conservé |
| Mes années de participation | API history ; années validées uniquement, tri décroissant et déduplication, rétention cinq ans et effacement avec le compte inchangés |
| Installation PWA | Offre native disponible ou guide iOS ; masquée si installée/non prise en charge ; guide dans la même fenêtre |
| Confidentialité et données | Compte, participation courante, parcours, prochaine purge, contact, politique configurable, suppression |
| Contact organisateur | Activation/configuration publique existante, repli contact de confidentialité conservé |
| Signaler un bug | Activation publique existante, version canonique dans le sujet |
| Déconnexion | API logout, retour accueil |
| Supprimer mon compte | Même confirmation textuelle, mot de passe actuel et consentement obligatoire ; suppression serveur inchangée |

Les filtres, gates serveur, règles de permission, modération, conditions de visite GPS/manuelle, protection des administrateurs et des comptes tiers ne sont pas modifiés. Les liens de navigation vers les écrans carte/administration et les liens externes conservent leurs destinations ; les rubriques internes remplacent uniquement le contenu du menu, avec une flèche retour en haut.

## Audit des pictogrammes

Activités : Candy pour Bonbons, Sparkles pour Décoration, Drama (masques) pour Mise en scène. Frayeur fixe : Ghost. Confidentialité/vérification : ShieldCheck. Soutien : Heart. Navigation : Map, Route, House ; compte : UserRound, LockKeyhole, CalendarDays ; actions : Settings, Bug, Mail, LogOut, Trash2. Les deux masques personnalisés de Frissons adaptés créaient une confusion avec Drama. HeartHandshake, absent des pictogrammes existants avant cette version, représente désormais l’adaptation à l’âge et à la sensibilité. Drama reste exclusivement affecté à Mise en scène.

## Progression

Le dénominateur contient les identifiants uniques des maisons de la sélection actuelle, y compris les maisons temporairement indisponibles. Le numérateur contient l’intersection de cette sélection avec les identifiants de visites validées uniques. Une maison retirée ou un identifiant étranger ne gonfle pas le pourcentage. Sélection vide : 0 %. Une visite sur deux : 50 %. Toutes validées : 100 %. L’ajout/retrait et la validation existants déclenchent immédiatement le rendu.

La potion utilise uniquement des animations CSS de transformation et d’opacité (une vague, trois bulles) dans une petite zone bornée. Aucune boucle JavaScript d’animation ; une impulsion de 650 ms seulement à la transition vers 100 %. Toutes les animations et la transition de largeur disparaissent avec prefers-reduced-motion.

## Vérification

Suite unitaire complète, lint/typecheck, build, suite navigateur ciblée `playwright.v087.config.ts`, suite E2E complète avec PostgreSQL dans la CI et smoke test Docker. La publication doit ensuite tirer les deux tags GHCR et contrôler VERSION, labels de version/révision et digest avant création de la release GitHub.
