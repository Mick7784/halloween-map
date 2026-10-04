# Halloween Map · Beta

Une carte des maisons accueillantes pour les communes et associations. Une expérience DomotiK Studio. La version publiée est définie exclusivement dans `VERSION`.

## Architecture

Next.js / React / TypeScript, MapLibre GL JS, PostgreSQL 17. Stack Compose : **app + worker + migrate + db**, avec volume PostgreSQL persistant, healthchecks et migrations avant démarrage. Mono-instance ; rôles et données rattachés à l’instance par clés étrangères composites. Plans COMMUNITY/PRO préparés, sans paiement ; toutes les fonctions sont disponibles en COMMUNITY.

SQL paramétré, Zod, scrypt, sessions opaques dont seuls les hash sont stockés, cookies HttpOnly/SameSite/Secure, CSRF par contrôle strict d’`APP_ORIGIN`, rate limiting persistant et RBAC serveur. Aucun email, adresse ou message dans les logs métier ou l’audit. Le seul secret affiché volontairement est le lien initial à usage unique, dans les logs de migration : protégez leur accès.

## Installation

```sh
git clone https://github.com/Mick7784/halloween-map.git
cd halloween-map
cp .env.example .env
# Renseigner POSTGRES_PASSWORD et APP_ORIGIN ; COOKIE_SECURE=true avec HTTPS.
docker compose up -d --build
docker compose ps
docker compose logs migrate
```

Ouvrir **le lien de configuration affiché dans les logs de migrate**. Aucun token à recopier dans l’interface. `SETUP_TOKEN` est un override avancé facultatif, normalement vide. Le secret automatique contient 32 octets aléatoires ; seul son hash persiste. L’ouverture du lien le consomme atomiquement et crée une session de setup de deux heures, HttpOnly/SameSite, puis redirige immédiatement vers `/setup/wizard`, sans secret. Le wizard commence par territoire/événement, puis Super Admin, quatre dates de saison et confirmation.

La création invalide toutes les sessions de setup et verrouille définitivement le premier lancement. Deux créations concurrentes ne peuvent pas produire deux instances. Le bootstrap ne régénère pas son lien à chaque redémarrage : garder les logs initiaux jusqu’au setup. En cas de lien perdu ou de session expirée, **avant configuration seulement** :

```sh
docker compose run --rm app node node_modules/tsx/dist/cli.mjs scripts/bootstrap.ts --rotate
```

Le nouveau lien invalide les précédentes sessions de setup. Sur installation déjà configurée, cette commande ne recrée rien. Les logs doivent rester privés et leur rétention limitée. `APP_ORIGIN` doit être l’URL publique exacte avant le premier lancement. Nominatim reçoit uniquement le territoire pour rechercher le centre ; les coordonnées peuvent être saisies manuellement.

## Saisons et données

Dans **Admin → Saison**, gérer séparément :

1. Ouverture des inscriptions.
2. Ouverture publique de la carte.
3. Fermeture publique de la carte.
4. Purge définitive.

Ordre requis : inscriptions ≤ ouverture < fermeture ≤ purge. Dates stockées UTC et présentées dans le fuseau de l’instance. Les heures locales inexistantes ou ambiguës lors d’un changement d’heure sont refusées ; choisir une heure non ambiguë, ou utiliser un décalage UTC explicite via l’API.

Exemple par défaut : inscriptions le 1er octobre, carte le 31 octobre à 12 h, fermeture le 1er novembre à 0 h, purge le 2 novembre à 12 h. **Activation de saison explicite**, jamais automatique. Avant ouverture : compte à rebours et nombre de maisons validées, aucune adresse ni position. Pendant ouverture : seulement les maisons validées, actives, dans leurs horaires, avec une activité disponible. Après fermeture : aucune carte publique ni parcours ; les admins conservent l’accès aux données selon leurs permissions jusqu’à la purge.

Le worker traite les dates réelles toutes les 30 secondes, sans chevaucher ses passages, et rattrape les purges manquées après redémarrage. Les requêtes publiques/admin rattrapent également la purge. Chaque purge verrouille la saison et conserve des totaux anonymes avant de supprimer comptes participants, sessions, maisons, adresses, coordonnées, descriptions, données d’envoi et audits ciblés. Messages de rappel effacés ; compteurs agrégés conservés. Les admins, rôles, paramètres et saisons minimales restent. La purge est idempotente. **Super Admin → Purger maintenant** après confirmation. Impossible de réouvrir une saison purgée ; la suivante archive la précédente et nécessite une activation.

La désinscription supprime immédiatement compte, maison, sessions et données associées. Modifier nom, adresse, coordonnées ou textes repasse en modération. Pause/reprise conserve l’inscription ; fin d’activité définitive ; rupture de bonbons retire uniquement cette activité. Une maison proposant seulement des bonbons devient invisible s’ils sont épuisés. La frayeur adaptable ignore le niveau fixe.

## Rappels email

Configurer l’environnement, puis **Admin → Saison → Rappel aux participants** : activer, choisir l’heure, saisir sujet/message, prévisualiser, enregistrer ou désactiver. Le nombre actuel de destinataires est affiché avant envoi, puis le total au lancement et les messages envoyés. États : non programmé / programmé / en cours / envoyé / erreur.

| Variable                     | Usage                                                                                  |
| ---------------------------- | -------------------------------------------------------------------------------------- |
| `SMTP_HOST`                  | Serveur SMTP, vide = désactivé                                                         |
| `SMTP_PORT`                  | 587 par défaut                                                                         |
| `SMTP_USER`, `SMTP_PASSWORD` | Authentification facultative selon le serveur                                          |
| `SMTP_FROM`                  | Expéditeur autorisé par le fournisseur                                                 |
| `SMTP_SECURE`                | `true` : TLS implicite, généralement 465 ; `false` : STARTTLS requis, généralement 587 |

Sans SMTP, l’app fonctionne et le back-office indique l’indisponibilité. Le worker laisse les rappels programmés en attente, sans boucle d’erreur. Une configuration ajoutée ultérieurement permet le rattrapage avant purge.

Le worker prépare une file persistante limitée aux participants de la saison, hors seed synthétique, et réserve chaque destinataire avant transmission. Plusieurs workers ne transmettent pas deux fois le même message. Sujet/message restent modifiables ou annulables tant que l’envoi n’a pas commencé ; une transmission commencée est verrouillée pour éviter les doublons. Les adresses ne sont pas copiées dans la file. Aucun suivi d’ouverture.

**Limite SMTP :** aucun protocole SMTP générique ne garantit une livraison exactement une fois après une coupure au moment de l’acceptation. Une réservation sans résultat après dix minutes devient une erreur ; les échecs ou résultats incertains ne sont jamais réessayés automatiquement. Le statut agrégé signale ces cas. Cette politique privilégie l’absence de doublons, sans prétendre garantir la réception de chaque message.

## Démonstration réservée au staff

Dans **Admin → Saison → Mode démonstration**, choisir une heure simulée, activer pour sa session, puis **Ouvrir la prévisualisation**. Permission distincte `season.preview`, attribuée par défaut aux Super Admins et admins locaux ; les rôles personnalisés peuvent la recevoir explicitement. Le bandeau indique clairement l’heure simulée.

Le serveur centralise le temps effectif : la preview autorisée utilise le temps de la session ; toute requête normale utilise le temps réel. Ni paramètre public de date ni simple cookie forgé ne permet de contourner l’autorisation. La carte, les fiches, filtres, disponibilités et parcours utilisent ce temps simulé. Les parcours de preview n’incrémentent aucun compteur réel. Aucune purge ni mutation admin n’utilise le temps simulé ; le public voit toujours les dates réelles. La preview ne ressuscite pas les données purgées. Désactiver le mode ou se déconnecter ferme l’accès de cette session.

Seed synthétique facultatif, distinct de la preview : définir `DEMO_PASSWORD` (12 caractères minimum), puis `docker compose run --rm app node node_modules/tsx/dist/cli.mjs scripts/seed.ts on`. Crée 12 maisons variées autour du centre, sans données réelles. `off` supprime uniquement ces participants. Sur base vide, crée une instance clairement marquée démo avec `admin@example.invalid`, saison inactive. Sur instance existante, conserve instance/admins. Seed idempotent.

## Variables et proxy

| Variable            | Usage                                                                   |
| ------------------- | ----------------------------------------------------------------------- |
| `POSTGRES_PASSWORD` | Secret DB requis ; conserver celui de l’installation existante          |
| `DATABASE_URL`      | Hors Compose ; Compose utilise le service db                            |
| `APP_PORT`          | Port publié, 3000 par défaut ; DB sans port public                      |
| `APP_ORIGIN`        | Origine exacte vue par le navigateur, CSRF et lien initial              |
| `COOKIE_SECURE`     | `true` en HTTPS, `false` uniquement en HTTP local                       |
| `SETUP_TOKEN`       | Override de bootstrap facultatif                                        |
| `DEMO_PASSWORD`     | Seed synthétique facultatif                                             |
| `MAP_STYLE_URL`     | CARTO Dark Matter par défaut ; adapter la CSP pour un autre fournisseur |
| `HALLOWEEN_IMAGE`   | Image Compose, locale par défaut ou GHCR                                |

Ne jamais committer `.env`. Utiliser des secrets aléatoires longs compatibles URL, par exemple `openssl rand -hex 32`. Changer `.env` ne change pas le mot de passe d’un rôle PostgreSQL déjà créé. Via Dockhand, conserver les quatre services et les conditions de dépendance de Compose ; migrate doit réussir avant app/worker. Si vous configurez vous-même Pangolin ou un proxy HTTPS, diriger le trafic vers APP_PORT, régler APP_ORIGIN et COOKIE_SECURE. Ce dépôt ne configure aucun proxy, domaine, DNS, certificat ou VPS.

## Upgrade V0.1 → V0.2

La migration **002_season_bootstrap.sql** est additive et s’applique dans la même transaction/verrou que les migrations existantes. Aucun volume ni table existante n’est recréé. Instances, comptes, mots de passe, maisons, rôles, paramètres et compteurs sont conservés. Les saisons existantes reçoivent une ouverture d’inscriptions 30 jours avant la carte et une purge 36 heures après la fermeture. Vérifier/ajuster ces dates après upgrade. Les données déjà purgées par V0.1 ne peuvent pas être restaurées par une migration.

Avant mise à jour, sauvegarder et arrêter **app et worker V0.1** : l’ancien worker appliquerait encore la purge à la fermeture. Exemple générique, à exécuter vous-même :

```sh
docker compose exec -T db pg_dump -U halloween -d halloween --clean --if-exists > halloween-backup.sql
docker compose stop app worker
git pull --ff-only origin main
# HALLOWEEN_IMAGE=ghcr.io/mick7784/halloween-map:V0.2 (ou latest choisi par l’exploitant)
docker compose pull app worker migrate
docker compose run --rm --no-deps migrate
docker compose up -d --no-build --force-recreate app worker
docker compose ps
curl --fail http://localhost:3000/api/health
```

Garder `db` et `postgres_data`, les secrets DB, et utiliser la même image pour app/worker/migrate. **Ne jamais lancer down -v.** L’échec de migration interdit le nouveau démarrage. Un retour à V0.1 ferait reprendre l’ancienne politique de purge : un retour arrière nécessite une restauration compatible. Limiter/chiffrer la rétention des sauvegardes contenant des données participantes ; après restauration, rattraper les purges échues.

## RBAC et audit

Super Admin : tous les droits et purge. Admin local : gestion locale sans modification des rôles. Modérateur : maisons, saison en lecture et audit. Lecture seule : consultation selon permissions. Permissions indépendantes `participants.read/validate/edit/delete`, `users.read/manage`, `season.read/manage/preview`, `settings.read/manage`, `stats.read`, `audit.read`, `roles.manage`. Aucun admin local ne peut attribuer plus de droits que les siens ; comptes Super Admin protégés. Les messages de rappel sont masqués aux lecteurs sans `season.manage`.

Audit minimal : acteur staff, action, cible technique et heure réelle. Jamais email, adresse, mot de passe ou contenu de message. Compteurs de parcours anonymes, aucun itinéraire individuel stocké.

## Développement et vérification

Node.js 24, PostgreSQL 17. Next charge `.env` ; les scripts utilisent l’environnement ou `--env-file`.

```sh
npm ci
node --env-file=.env node_modules/tsx/dist/cli.mjs scripts/migrate.ts
npm run lint
npm test
npm run build
npx playwright install --with-deps chromium
# DB JETABLE uniquement : la suite efface les données !
# DATABASE_URL, APP_ORIGIN=http://localhost:3000
npm run test:e2e
```

PGlite localement, PostgreSQL 17 en CI via TEST_DATABASE_URL. Couverture : migration legacy/fresh et idempotence, bootstrap hash/session/expiration/concurrence, auth/RBAC/CSRF, quatre dates/timezone, ouverture/fermeture/purge différée/manuelle, rappels/doublons/SMTP absent/erreurs, demo autorisée/interdite sans statistiques ni purge simulée, modération/activité/seed/routage/version. Playwright capture wizard, participant, dashboard, saison, countdown et carte sur mobile, tablette, 1920×1080 et 2560×1440 ; vérifie débordements, focus des modales et Escape. Les tests cartographiques utilisent un style déterministe pour faire fonctionner le vrai canvas MapLibre, worker local, marqueurs et tracé sans dépendre du DNS du fournisseur. Les captures sont disponibles dans l’artefact `browser-report` de CI.

Sans PostgreSQL local : `node node_modules/tsx/dist/cli.mjs scripts/test-db.ts`, base jetable à `postgresql://postgres:postgres@127.0.0.1:54329/postgres`, développement uniquement. Le job Docker CI construit et démarre app/worker/migrate/db et vérifie santé/version.

L’audit de production est vérifié avec `npm audit --omit=dev`. L’avis GHSA-vfj7-8cjw-p6xm concerne le transitif de développement `braces`, exclu du runtime. Ne pas forcer une rétrogradation du lint avec `npm audit fix --force` ; suivre le correctif upstream.

## Version et publication

`VERSION` est l’unique source de vérité : application/footer/admin, image/label OCI, tag Git et release. Aucune version parallèle package.json. `npm run version:next` donne V0.201 après le jalon V0.2 ; `npm run version:next -- V0.2` choisit explicitement ce jalon. Compléter CHANGELOG, vérifier puis pousser main. La CI publie uniquement après verify + Docker verts et uniquement si le tag manque ; aucune boucle de commit automatique.

Registry : `ghcr.io/mick7784/halloween-map:V0.2` et `:latest`, tag **V0.2**, release **Halloween Map V0.2 Beta**. Dépôt/package privé : accès GHCR autorisé et `docker login ghcr.io` si nécessaire. La version publiée s’installe exclusivement par l’exploitant ; aucun déploiement externe n’est déclenché par cette CI.

## Limites de la beta

Parcours estimés à 4,2 km/h et cinq minutes par maison, segments géodésiques à vol d’oiseau, sans instructions de voirie ni optimisation globale. Fournisseurs externes de tuiles et géocodage du territoire. Une maison par compte ; coordonnées manuelles ou géolocalisation facultative. Pas de reset par email, paiement ou multi-instance actif. Recalculer un parcours si les disponibilités évoluent.

Direction artistique et provenance du décor : [docs/visual-assets.md](docs/visual-assets.md).
