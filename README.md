# Halloween Map · Beta

Carte des maisons accueillantes pour les communes et associations. Une expérience DomotiK Studio. `VERSION` est l’unique source de vérité. La direction artistique V0.2 est conservée.

## Installation

Next.js / React / TypeScript, MapLibre, PostgreSQL 17. Compose comprend **app, worker, migrate et db**, avec volume persistant et migrations avant démarrage.

```sh
git clone https://github.com/Mick7784/halloween-map.git
cd halloween-map
cp .env.example .env
# Renseigner POSTGRES_PASSWORD et APP_ORIGIN ; COOKIE_SECURE=true en HTTPS.
docker compose up -d --build
docker compose logs migrate
```

Ouvrir le lien initial à usage unique affiché par `migrate`. Son empreinte seule est stockée ; le lien est consommé puis remplacé par une session temporaire de configuration. Le wizard crée territoire, Super Admin et première saison inactive. L’installation terminée ne peut pas être réouverte. `SETUP_TOKEN` reste un override facultatif. Avant configuration seulement, régénérer un lien perdu avec :

```sh
docker compose run --rm app node node_modules/tsx/dist/cli.mjs scripts/bootstrap.ts --rotate
```

Protéger l’accès aux logs initiaux. `APP_ORIGIN` doit correspondre à l’origine publique exacte. SQL paramétré, validation Zod, scrypt, cookies HttpOnly/SameSite/Secure, CSRF strict, rate limiting persistant et permissions vérifiées côté serveur. Les logs métier/audits ne contiennent ni emails, adresses, messages, ni liens de vérification.

## Comptes et participations

Un **user** conserve son nom/pseudo, email, vérification, empreinte du mot de passe, rôle et informations techniques minimales. Il peut exister sans maison et revenir l’année suivante. Une **participation** appartient à une saison et porte maison, adresse/GPS, horaires, activités, descriptions, visibilité et preuves d’acceptation. Une participation par compte et saison.

La création libre ouvre un compte `UNVERIFIED` et programme un email. Le lien expire après 48 heures, à usage unique et hashé en base. Un renvoi invalide les anciens liens et applique un cooldown de 15 minutes. Seul un email `VERIFIED` peut finaliser une nouvelle participation. `BOUNCED` et `INVALID` sont prévus ; le SMTP générique ne fournit pas systématiquement de retour automatique de rebond.

**Mon compte** permet de changer nom, email et mot de passe, de consulter sa participation et la confidentialité, ou de supprimer définitivement le compte. Changement d’email/mot de passe et suppression demandent le mot de passe actuel ; les sessions sont révoquées. Le nouvel email doit être vérifié. La suppression d’une participation garde le compte ; celle du compte efface aussi ses participations et données associées. Le dernier Super Admin actif est protégé.

**Admin → Utilisateurs** : recherche, filtres, identité, participation, états des communications, trois rôles fixes. Créer un utilisateur envoie une invitation : pas de mot de passe généré ni envoyé. Le clic vérifie l’email puis ouvre une session d’activation de 30 minutes pour choisir son mot de passe.

## Rôles

USER accède au compte, à la participation, à la carte et aux parcours. ADMIN gère les maisons, utilisateurs USER, saison courante, communications, statistiques, contenus et journal. SUPER_ADMIN gère aussi les paramètres critiques, les rôles et les actions dangereuses. Seul SUPER_ADMIN peut attribuer ADMIN/SUPER_ADMIN ; aucun ADMIN ne peut élever ses droits. Aucune exception individuelle.

## Saison, dates et purge

Quatre dates : **inscriptions ≤ ouverture < fermeture ≤ purge**. Calendrier français et heures 24 h dans le fuseau de l’instance ; stockage UTC. Heures locales inexistantes/ambiguës refusées. Préremplissage : 1 octobre, 31 octobre à 12 h, 1 novembre à 0 h, 2 novembre à 12 h. Activation explicite.

La carte exige une connexion. Avant ouverture, seule la maison du propriétaire peut être envoyée à ce compte. Pendant ouverture, uniquement les maisons VISIBLE, actives, dans leurs horaires et avec une activité disponible. Fermeture : carte/parcours masqués, accès de l’équipe conservé jusqu’à purge. Modifier identité/adresse/textes conserve la visibilité administrative ; pause, reprise, fin définitive et rupture de bonbons restent disponibles.

La purge transactionnelle/idempotente supprime réellement participations, adresse/GPS, textes, états et acceptations, détails d’envoi et audits saisonniers ciblés. **Les comptes et rôles restent.** Seuls les totaux anonymes des saisons/campagnes subsistent ; aucun historique des adresses, aucune réutilisation commerciale. Le worker utilise les dates réelles toutes les 30 secondes ; les accès public/admin rattrapent les purges échues. Une saison purgée ne se rouvre pas.

Politique de comptes inactifs : aucun nettoyage automatique implicite. L’exploitant doit définir/publier un délai justifié, informer les utilisateurs avant suppression puis utiliser la suppression de compte, avec rétention limitée des sauvegardes. Les jetons expirés sont supprimés ; les états d’emails d’identité terminés sont effacés après 30 jours.

**Mode démonstration** : Super Admin uniquement, activé en un clic sur l’accueil hors ouverture publique. Moins de deux maisons réelles disponibles : cinq maisons fictives éphémères sans écriture en base. Sinon : vraies maisons au temps simulé choisi automatiquement. Aucun compteur ni purge simulée.

## SMTP et communications

SMTP est nécessaire pour vérifier les nouveaux comptes et activer les invitations. Sans SMTP, l’interface indique l’attente ; aucune participation nouvelle ne peut être finalisée. Paramètres SMTP :

| Variable                     | Usage                                                                 |
| ---------------------------- | --------------------------------------------------------------------- |
| `SMTP_HOST`, `SMTP_FROM`     | Serveur et expéditeur autorisé ; vides = envoi désactivé              |
| `SMTP_PORT`                  | 587 par défaut                                                        |
| `SMTP_USER`, `SMTP_PASSWORD` | Authentification selon le fournisseur                                 |
| `SMTP_SECURE`                | `true` : TLS implicite (souvent 465) ; `false` : STARTTLS obligatoire |

**Admin → Communications** permet plusieurs campagnes : audience tous/maisons visibles/actifs, activation, date fixe ou décalage en jours autour d’une date de saison, aperçu et test à son propre email vérifié. Les campagnes relatives non commencées sont recalculées dans le fuseau local après changement des dates ; le formulaire affiche leur nombre. Variables explicitement listées près de l’éditeur : nom, territoire, événement, année, dates et maison/horaires. Les messages utilisent un layout HTML responsive commun, avec fallback texte et sans HTML arbitraire.

`email_campaigns` et `email_outbox` : contraintes d’idempotence, claim atomique avant SMTP, compteurs, aucun email recopié si l’ID utilisateur suffit. Maximum 20 jobs par passage, espacés de 250 ms en production. Démo, comptes désactivés et emails non vérifiés/invalides/rebondis exclus au lancement et vérifiés de nouveau au claim. `SENT` n’est jamais renvoyé. Connexion refusée/DNS avant acceptation : réessais limités, espacés de cinq minutes ; résultat ambigu ou claim abandonné après dix minutes : erreur sans réessai automatique. Aucun suivi d’ouverture. Le test est séparé des compteurs réels.

SMTP ne garantit pas une livraison exactement une fois après coupure lors de l’acceptation. La politique évite les doublons volontaires et privilégie une erreur explicite en cas d’incertitude. Configurer chez le fournisseur les DNS **SPF** (serveurs autorisés), **DKIM** (signature) et **DMARC** (alignement/politique et rapports) ; vérifier l’expéditeur et la délivrabilité avec ses outils.

## Contenus et documents

**Admin → Contenus** : clés stables, défauts dans l’app, seules personnalisations en base, reset et aperçu. Accueil, compte, participation, confidentialité, libellés et signature footer. Variables autorisées par champ. Markdown limité : paragraphes, titres, gras/italique, liens sûrs et listes. Aucune injection HTML/JS.

CGU, Bonnes pratiques, Confidentialité et Mentions légales ont des versions publiées, dates et historique. Les brouillons peuvent être modifiés/prévisualisés puis publiés ; le corps d’une version publiée est immuable. Un changement important des CGU/bonnes pratiques peut imposer réacceptation : les participations concernées sont masquées jusqu’à validation des nouveaux textes. La preuve conserve versions/dates sur la participation, sans IP ; elle disparaît à la purge. La confidentialité est informative et liée dans le formulaire, sans faux consentement RGPD global.

Le formulaire de participation présente les bonnes pratiques et exige l’autorisation d’inscrire cette adresse et l’acceptation des CGU, contrôlées aussi sur le serveur. L’exploitant doit personnaliser les documents et mentions, son identité/contact et ses obligations ; ces fonctions ne constituent pas une garantie juridique de conformité.

## Paramètres et PWA

**Paramètres** : événement, territoire/CP/pays, géocodage du territoire (Nominatim), résultat lisible et mini-carte, fuseau inféré pour pays connus seulement, centre/zoom. Repli manuel dans Réglages avancés. Aucune adresse participante n’est envoyée au géocodeur. Les dates récurrentes utilisent un calendrier sans année visible. Signature footer déplacée dans Contenus.

Manifest standalone, icônes communes dérivées du manoir officiel V0.2, Apple/192/512/maskable. CTA sur accueil, menu et compte après inscription. Prompt natif Android/Chrome si disponible ; iOS : Partager → Ajouter à l’écran d’accueil. Masqué en mode installé. HTTPS requis hors localhost.

Le service worker ne conserve que ressources statiques et un écran générique hors connexion. **Jamais API, HTML de compte/participation, adresses, tuiles ni routes privées en cache.** La carte nécessite une connexion. Les polices/worker MapLibre sont locaux.

## Upgrade V0.2 → V0.4

Migration **003_durable_accounts.sql**, transactionnelle et rejouable, plus initialisation des versions légales dans le même transaction du runner. Renomme houses en participations, adapte l’unicité par saison, préserve IDs, FK, mots de passe, profils/droits, saisons/dates, maisons et états. Les comptes legacy ne sont pas faussement marqués vérifiés : leurs participations déjà finalisées sont conservées pour l’édition en cours, mais toute nouvelle participation/campagne nécessite vérification. Les changements d’email retirent cette exception.

Un ancien rappel non envoyé devient une campagne ; claims et résultats sont conservés sans doublon. Un rappel envoyé reste uniquement agrégé et ne repart jamais. Les anciennes colonnes de rappel sont retirées de l’usage actif ; le worker V0.2 ne doit plus tourner.

À exécuter uniquement par l’exploitant, avec **db et postgres_data conservés** :

```sh
docker compose exec -T db pg_dump -U halloween -d halloween --clean --if-exists > halloween-backup.sql
docker compose stop app worker
# Mettre à jour le dépôt/Compose et HALLOWEEN_IMAGE=ghcr.io/mick7784/halloween-map:V0.4
docker compose pull app worker migrate
docker compose run --rm --no-deps migrate
docker compose up -d --no-build --force-recreate app worker
docker compose ps
curl --fail http://localhost:3000/api/health
```

Même image pour app/worker/migrate, mêmes secrets DB. **Ne jamais utiliser down -v.** Si migration échoue, ne pas démarrer la nouvelle app. Retour V0.2 nécessite restauration compatible : l’ancien worker supprimerait encore les comptes. Limiter/chiffrer la rétention des sauvegardes et rattraper les purges après restauration. Aucun accès/déploiement VPS, Dockhand ou Pangolin n’est effectué par ce dépôt ou sa CI.

## Environnement et vérification

Autres variables existantes : `POSTGRES_PASSWORD` requis, `DATABASE_URL` hors Compose, `APP_PORT` (3000), `APP_ORIGIN`, `COOKIE_SECURE`, `SETUP_TOKEN` facultatif, `DEMO_PASSWORD` facultatif, `MAP_STYLE_URL`, `HALLOWEEN_IMAGE`. Ne jamais committer `.env`. Changer .env ne change pas le mot de passe d’un PostgreSQL déjà créé. La DB n’a pas de port public dans Compose ; le proxy est configuré par l’exploitant.

```sh
npm ci
npm run migrate
npm run migrate # idempotence
npm run lint
npm test
npm run build
npx playwright install --with-deps chromium
# DATABASE_URL doit cibler une DB JETABLE : les tests effacent les données !
npm run test:e2e
```

Métier : PGlite local, PostgreSQL 17 en CI (`TEST_DATABASE_URL`). Migrations fresh/V0.2/replay, identité, permissions, participations, purge, campagnes, concurrence, incertitude SMTP, CMS/documents et PWA. Playwright : connexion/carte avant ouverture, masquage admin, mode démo/parcours et récupération de mot de passe ; captures uniquement en cas d’échec. Base locale jetable : `scripts/test-db.ts`, port 54329. Le job Docker démarre la vraie stack et vérifie santé/version.

Production : `npm audit --omit=dev`. L’avis GHSA-vfj7-8cjw-p6xm concerne le transitif de développement `braces`, exclu du runtime ; ne pas forcer une rétrogradation du lint.

La CI publie après verify et Docker verts seulement : tag **V0.5.3**, release **Halloween Map V0.5.3 Beta**, `ghcr.io/mick7784/halloween-map:V0.5.3` et `:latest`, labels OCI version/commit. Aucun numéro parallèle dans package.json, aucun déploiement externe.

Limites : mono-instance active, parcours exclusivement piétons selon le réseau disponible chez le fournisseur, cinq minutes de visite par maison. Pas de navigation vocale ni de suivi GPS continu. Recalculer si les disponibilités changent. Provenance du décor : [docs/visual-assets.md](docs/visual-assets.md).

### V0.4 Beta

Les rôles sont désormais USER, ADMIN et SUPER_ADMIN. La migration `004_beta_simplification.sql` convertit les anciens rôles et états de maison sans supprimer les données. Les maisons sont inscrites automatiquement et peuvent être masquées ou supprimées en conservant le compte. La carte exige une connexion ; avant ouverture, elle ne renvoie que la maison du propriétaire.

Le Super Admin peut activer le mode démo depuis l’accueil, hors ouverture publique. Il utilise cinq maisons éphémères si moins de deux maisons réelles sont disponibles et ne change ni les dates, ni les compteurs, ni la purge. La récupération de compte est accessible dans « Mot de passe oublié ? » ; les liens expirent après une heure et révoquent les sessions après utilisation. Les emails HTML conservent leur version texte. `SMTP_REPLY_TO` est facultatif ; aucune intégration Brevo n’est requise.

### V0.5 — parcours piétons

**Configuration requise pour le routage hébergé** : créer une clé openrouteservice (https://openrouteservice.org/), puis renseigner `ORS_API_KEY` dans le fichier .env du serveur. `ORS_BASE_URL` vaut https://api.heigit.org/openrouteservice par défaut. Le profil est toujours **foot-walking**, sans option voiture/vélo. La clé et l’URL ne sont jamais envoyées au navigateur. Aucun SDK, conteneur ni migration supplémentaire. Un serveur ORS existant peut être utilisé via ORS_BASE_URL (ex. https://routing.example.org/ors), avec Snap, Matrix et Directions piétons activés. Ne pas utiliser un serveur de démonstration non contractuel en production.

Séquence : validation/snapshot SQL → Snap (rayon maximal 50 m) → matrice distances/durées piétonnes → sélection gloutonne de l’arrivée la plus précoce → Directions GeoJSON multi-étapes → vérification des horaires avec les métriques définitives → courte transaction SQL de contrôle et compteur. Aucun appel réseau pendant le verrou SQL. Les points non raccordables et les liaisons nulles sont exclus, sans ligne droite de secours. Erreurs explicites pour clé absente, quota/indisponibilité, timeout ou réponse invalide.

La géométrie et les métriques finales proviennent de Directions ; la matrice détermine l’ordre. Durée totale = marche + attente d’ouverture + 5 min par visite. Chaque étape fournit sa distance et sa durée, en mètres/secondes et minutes affichées. Un déplacement sans retour au départ, au maximum 30 visites. Les métriques du fournisseur restent des prévisions : son réseau OpenStreetMap peut être incomplet ou obsolète ; vérifier les conditions et accès sur place. Le point peut être raccordé à une voie piétonne jusqu’à 50 m ; l’accès exact au portail reste à vérifier.

Au maximum 200 maisons candidates après filtres/horaires (au-delà, demande explicite d’affiner, jamais de troncature silencieuse). Matrices par blocs de 50 sources/destinations, au plus 2500 paires par requête. Pour 30 maisons : normalement 1 Snap + 1 Matrix + 1 Directions. Pour 200 : au plus 1 + 25 + 1, hors recalcul exceptionnel si les métriques Directions invalident un horaire. Timeout 12 s par requête et 60 s pour toute la session fournisseur, aucun retry automatique. Dimensionner les quotas journaliers/par minute de la clé pour l’événement ; un quota dépassé affiche une indisponibilité, jamais une fausse route.

Données transmises au fournisseur : coordonnées de départ et des maisons candidates (pas de noms, emails ou adresses textuelles). Aucune persistance/caching des routes dans l’application. L’exploitant doit informer les participants et visiteurs de ce prestataire dans sa politique de confidentialité. Les maisons ouvrant plus tard peuvent être utilisées dans la fenêtre demandée, uniquement pendant l’ouverture globale de la saison et après connexion ; la carte des maisons disponibles conserve son filtre d’ouverture immédiate. Les données de démonstration sont synthétiques et ne garantissent pas un raccordement au réseau.

Départ explicitement choisi, acquisition GPS haute précision sans cache, précision affichée, marqueur lavande, recentrage, étapes orange numérotées et cadrage automatique. Modifier départ/filtres/frayeur/horaires efface le résultat. Un changement de maison invalide l’intégralité du résultat lors de l’actualisation (30 s), sans conserver d’anciens totaux. Une nouvelle maison commence sans coordonnées et exige confirmation explicite du point côté UI/API.

Validation dédiée : `npm run lint`, `npm test`, `npm run build`, `npm run test:routing:ui`. Les tests utilisent un fournisseur contrôlé, jamais une fausse route en production. La CI existante vérifie PostgreSQL, navigateur et stack Docker avant publication de l’image V0.5. Aucun accès VPS/Dockhand/Pangolin n’est configuré dans le dépôt ; publication d’image et déploiement de l’instance sont distincts. Pour l’upgrade, conserver DB/volume, configurer ORS_API_KEY, sélectionner l’image V0.5 et recréer app/worker avec le Compose mis à jour ; aucune nouvelle migration V0.5.

### V0.5.1 — marqueurs et démonstration

ORS_BASE_URL vaut désormais `https://api.heigit.org/openrouteservice`. Les trois endpoints ajoutent `/v2/snap/foot-walking/json`, `/v2/matrix/foot-walking` et `/v2/directions/foot-walking/geojson` à cette base. Sous deux maisons réelles, le serveur découvre cinq points avec Snap (rayon maximal 300 m autour de graines déterministes dans un rayon de 750 m du centre), écarte les doublons à moins de 80 m et vérifie la connexion piétonne avec Matrix puis Directions. Seuls les points raccordés sont affichés. Un cache mémoire borné partage les résultats ; aucune écriture en base. Si le réseau ne permet pas cinq points compatibles, aucun trajet artificiel n’est produit.

Les diagnostics des réponses invalides indiquent endpoint et champs concernés, jamais la clé API ni le contenu brut. La publication corrective est `V0.5.1` et `ghcr.io/mick7784/halloween-map:V0.5.1`. Aucun changement de Compose ou déploiement de serveur dans ce correctif.

### V0.5.2 — Snap et preview

Chaque entrée Snap est validée séparément : null, coordonnées invalides ou snapped_distance absente/null/invalide deviennent un point non raccordable, sans bloquer les autres. Un tableau locations absent, de type incorrect ou de longueur incohérente reste une réponse invalide. Les journaux des entrées ignorées ne contiennent que leurs indices et les noms des champs. Matrix et Directions gardent leur validation stricte et aucun tracé de secours n’est produit.

L’activation de la session preview ne dépend plus du fournisseur : le choix du créneau conserve les horaires des vraies maisons lorsqu’il y en a au moins deux, sinon les horaires configurés de la saison. La génération ORS intervient ensuite dans la preview ; une erreur explicite s’affiche avec la carte et la possibilité de quitter la démonstration.

### V0.5.3 — segments Directions

La requête Directions ne désactive plus les instructions : ORS retourne ainsi les segments nécessaires aux distances et durées de chaque liaison. Seuls la géométrie LineString et les couples distance/durée sont conservés. Les éventuelles instructions/steps sont ignorées ; aucune navigation turn-by-turn ni métrique calculée à vol d’oiseau. La validation du nombre de segments (points moins un) reste obligatoire.
