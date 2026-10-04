# Halloween Map · V0.1 Beta

Une carte des maisons accueillantes pour Halloween, générique pour toute commune ou association. Une expérience DomotiK Studio. L’interface mobile-first reprend le thème charbon, orange chaud et violet discret du concept art. Aucune photo ni identité personnelle dans les fiches publiques.

## Architecture et stack

Next.js App Router, React, TypeScript, MapLibre GL JS et PostgreSQL 17. SQL paramétré, migrations transactionnelles, validation Zod. Une entité `Instance` centrale rattache rôles, utilisateurs, saisons et maisons à leur organisation via des clés étrangères composites. V0.1 est mono-instance ; plans `COMMUNITY | PRO`, feature flags et quotas sont préparés, sans paiement. COMMUNITY donne accès à toutes les fonctions.

Sessions opaques en DB, cookies HttpOnly/SameSite et mots de passe scrypt (N=32768, r=8, p=1). Les permissions sont contrôlées côté serveur. Un worker traite les fermetures toutes les 30 secondes ; les requêtes publiques rattrapent aussi les traitements manqués. Aucune adresse n’est renvoyée avant l’ouverture. Aucun parcours individuel n’est stocké : seul un compteur anonyme reste.

Le moteur isolé `lib/routing.ts` utilise les distances géodésiques, 4,2 km/h à pied et 5 minutes par maison. Il tient compte des fenêtres horaires, pauses, bonbons et filtres, avec attente possible pour une ouverture future. Les segments sont à vol d’oiseau, **pas des instructions de voirie**. Ce point est affiché au public. PostGIS n’est pas nécessaire en V0.1. OR-Tools, ORS/VROOM pourront remplacer ce moteur.

## Installation Docker

Prérequis : Git, Docker Engine, Docker Compose v2 avec `--wait`, accès sortant aux fournisseurs de tuiles. Aucun VPS, DNS, domaine, certificat ou reverse proxy n’est configuré.

```sh
git clone https://github.com/Mick7784/halloween-map.git
cd halloween-map
cp .env.example .env
# Modifier POSTGRES_PASSWORD, SETUP_TOKEN et APP_ORIGIN.
docker compose up -d --build
docker compose ps
```

Port attendu : **http://localhost:3000**. La DB n’a pas de port publié. Le volume `postgres_data` est persistant. Les migrations s’exécutent avant app et worker ; leur échec empêche le démarrage. Tous les services persistants ont un healthcheck.

Utiliser des secrets longs aléatoires compatibles URL, par exemple `openssl rand -hex 32`. Ne pas garder les valeurs d’exemple et ne pas committer `.env`. Pour une DB déjà créée, modifier `.env` ne suffit pas à changer le mot de passe du rôle PostgreSQL.

## Premier lancement

1. Ouvrir l’app et renseigner la clé `SETUP_TOKEN` du `.env`.
2. Définir nom public, territoire, code postal, pays et timezone (Europe/Paris par défaut). Le centre est recherché par Nominatim avec uniquement le territoire. En cas d’indisponibilité, décocher la recherche et saisir latitude, longitude et zoom.
3. Créer le premier Super Admin avec un mot de passe de 12 caractères minimum.
4. Définir la saison : 31 octobre 12:00 → 1er novembre 00:00 par défaut, dans le fuseau de l’instance.
5. Vérifier et créer. Le wizard est ensuite verrouillé côté serveur ; la transaction et un verrou DB empêchent les setups concurrents.
6. Dans **Saison**, cocher **Activer cette saison** et enregistrer. Sans activation explicite, la carte ne s’ouvre pas.

Aucune manipulation DB manuelle n’est nécessaire. La clé reste dans `.env` pour les redémarrages et n’autorise jamais un deuxième setup.

## Variables env

| Variable            | Usage                                                                                 |
| ------------------- | ------------------------------------------------------------------------------------- |
| `POSTGRES_PASSWORD` | Mot de passe DB requis par Compose                                                    |
| `DATABASE_URL`      | Connexion DB hors Compose ; Compose la construit avec le service `db`                 |
| `APP_PORT`          | Port publié, défaut 3000                                                              |
| `APP_ORIGIN`        | Origine exacte vue par le navigateur, protection CSRF                                 |
| `COOKIE_SECURE`     | `true` avec HTTPS, `false` pour HTTP local                                            |
| `SETUP_TOKEN`       | Clé requise pour le premier lancement                                                 |
| `DEMO_PASSWORD`     | Mot de passe choisi pour le seed synthétique seulement                                |
| `MAP_STYLE_URL`     | Défaut CARTO Dark Matter ; changer la CSP si le fournisseur utilise d’autres domaines |
| `HALLOWEEN_IMAGE`   | Image optionnelle, défaut `halloween-map:local`                                       |

Timezone configurée dans l’instance, dates stockées en UTC et affichées dans son fuseau. Les fournisseurs de tuiles reçoivent les requêtes navigateur nécessaires à la carte ; respecter leurs conditions d’utilisation.

## Développement / migrations

Node.js 24 et PostgreSQL 17 recommandés. Next charge `.env` ; les scripts Node utilisent l’environnement du shell ou `--env-file`.

```sh
npm ci
node --env-file=.env node_modules/tsx/dist/cli.mjs scripts/migrate.ts
npm run dev
# Dans Compose :
docker compose run --rm migrate
```

Ajouter des migrations SQL numérotées dans `migrations/`, ne pas modifier une migration déjà appliquée. `schema_migrations` et un verrou transactionnel assurent l’idempotence et la sérialisation.

## Seed démo

Facultatif, désactivé par défaut. Définir `DEMO_PASSWORD` (12 caractères minimum), puis :

```sh
docker compose run --rm app node node_modules/tsx/dist/cli.mjs scripts/seed.ts on
docker compose run --rm app node node_modules/tsx/dist/cli.mjs scripts/seed.ts off
```

Sur base vide : instance clairement marquée démo, admin `admin@example.invalid`, saison inactive. Sur instance existante : ajoute seulement 12 maisons synthétiques près du centre actuel. Participants `maison1@example.invalid` à `maison12@example.invalid`, mot de passe `DEMO_PASSWORD`. Horaires, activités, frayeur, adaptable, pending, refus, pause et bonbons épuisés variés. Seed idempotent. `off` supprime uniquement les participants démo et conserve instance/admins. Aucune donnée personnelle réelle.

## Saisons, participants et purge

États : PREPARATION, COUNTDOWN, MAP_OPEN, CLOSED, ARCHIVED. Aucune nouvelle saison ne s’active automatiquement. Avant l’ouverture, seul le nombre de maisons validées est public, sans adresse ni position participante.

Visibilité : saison ouverte, maison APPROVED, activité ACTIVE, heure dans `[début, fin[`, au moins une activité disponible. Tous les marqueurs sont identiques. PAUSED conserve l’inscription et permet la reprise ; ENDED est définitif. Les bonbons épuisés retirent uniquement cette activité ; une maison bonbons uniquement devient invisible. L’interface propose de terminer l’accueil. La frayeur adaptable ignore la valeur fixe du slider.

Les modifications du nom, de l’adresse, des coordonnées et des textes repassent en modération. L’utilisateur gère horaires, activités, frayeur, RP et informations pratiques. La désinscription demande une confirmation et supprime immédiatement compte, sessions, maison et données associées.

À la fermeture, les contrôles serveur bloquent immédiatement carte, parcours et inscriptions. L’interface masque aussi les maisons expirées chaque seconde et actualise les disponibilités toutes les 30 secondes. Le worker rattrape une fermeture manquée à son redémarrage.

La purge transactionnelle verrouille la saison, agrège d’abord les totaux anonymes (maisons, validation, activités, parcours), puis supprime participants, sessions, maisons, adresses, coordonnées, horaires, textes et audits ciblant ces données. Aucun itinéraire individuel n’est conservé. Elle ferme les inscriptions, marque la purge et journalise une action minimale. Idempotente et testée.

Admins, rôles, paramètres, saisons minimales et bilans anonymes restent. Le Super Admin dispose de **Saison → Fermer et purger maintenant**, après confirmation. Impossible de réouvrir une saison purgée. La saison suivante archive la précédente, sans l’activer automatiquement.

Les sauvegardes antérieures peuvent encore contenir des données participantes : l’exploitant doit limiter leur accès/rétention et appliquer la purge après restauration si la saison est fermée.

## RBAC / audit

| Rôle        | Droits initiaux                                                                          |
| ----------- | ---------------------------------------------------------------------------------------- |
| SUPER_ADMIN | Tous, rôles personnalisés et purge manuelle                                              |
| LOCAL_ADMIN | Gestion locale, utilisateurs, saisons, paramètres, stats ; pas de modification des rôles |
| MODERATOR   | Lecture, validation/modification maisons, lecture saison et audit                        |
| READ_ONLY   | Lecture maisons, utilisateurs, saisons, paramètres et statistiques                       |

Permissions indépendantes : `participants.read/validate/edit/delete`, `users.read/manage`, `season.read/manage`, `settings.read/manage`, `stats.read`, `audit.read`, `roles.manage`. Rôles personnalisés possibles. Un admin local ne peut pas attribuer de droits supérieurs aux siens. Le Super Admin et ses comptes sont protégés contre la rétrogradation.

Audit : acteur staff, action, cible minimale et timestamp. Jamais mot de passe, email, adresse ou texte participant. Actions participantes anonymes. Affichage des 200 dernières entrées.

## Sécurité

SQL paramétré, validation serveur, hash scrypt, sessions aléatoires dont seuls les hash restent en DB (7 jours), cookies HttpOnly/SameSite, contrôle strict Origin sur tous les POST, en-têtes de sécurité et rate limiting persistant par compte + plafond global. Les en-têtes forwarded ne sont pas utilisés comme identité fiable. Les hash de mot de passe ne sont pas envoyés au client.

Aucune réinitialisation par email en beta : prévoir plusieurs comptes d’équipe et conserver le secret Super Admin. Pour une forte charge, prévoir un limiteur distribué en amont.

L’audit npm de production est sans alerte à la validation initiale. Les outils de lint transitent par `braces`, avis GHSA-vfj7-8cjw-p6xm sans correctif compatible upstream au moment de création. Ces dépendances de développement sont exclues de l’image runtime. Ne pas appliquer `npm audit fix --force`, qui rétrograde Next ESLint ; suivre le correctif upstream.

## Tests / CI

```sh
npm ci
npm run lint
npm test
npm run build
npx playwright install --with-deps chromium
# DB JETABLE uniquement : les tests en effacent le contenu.
# Définir DATABASE_URL, APP_ORIGIN=http://localhost:3000, SETUP_TOKEN.
npm run test:e2e
```

Tests métier avec PGlite localement et PostgreSQL 17 en CI via `TEST_DATABASE_URL`. Couverture : first run/verrouillage, auth/RBAC, modération, horaires, visibilité, bonbons, pause/reprise, suppression, purge, routage, seed et versioning. Tests navigateur : wizard, public, participant, admin, parcours, CSRF, suppression, fermeture, captures mobile/desktop et absence de débordement. Ils utilisent un style de test déterministe pour vérifier canvas, worker local, marqueurs et tracé sans dépendre du DNS du fournisseur. Les ressources MapLibre sont copiées localement pendant le build.

La CI installe, applique les migrations, vérifie lint/TypeScript, tests, build et navigateur. Un deuxième job construit/démarre Docker Compose et contrôle santé et version. Release uniquement après les deux jobs verts.

Sans PostgreSQL local : `node node_modules/tsx/dist/cli.mjs scripts/test-db.ts` lance une DB jetable sur `127.0.0.1:54329`. URL : `postgresql://postgres:postgres@127.0.0.1:54329/postgres`. Développement uniquement, ne remplace pas les vérifications PostgreSQL/Docker de CI.

## Versioning / releases

**`VERSION` est l’unique source persistante.** Pas de version concurrente dans package.json. Footer public, administration, À propos et image lisent ce même fichier ; tags Git/Docker, label OCI, GitHub Release et changelog reprennent sa valeur.

```sh
npm run version:next          # V0.1 → V0.101 → V0.102…
npm run version:next -- V0.2  # Jalon explicite, puis V0.201…
# Compléter CHANGELOG.md, vérifier, commit et push main.
```

Même logique pour V1.x. L’incrément est explicite et persisté en Git, jamais recalculé dans plusieurs jobs. Sur main, si le tag existe, aucune release ni image latest n’est republiée. S’il manque et CI/Docker sont verts, publication des images versionnée + latest, puis tag et release Beta. Aucun commit automatique ni boucle CI. Incrémenter la version avant chaque nouvelle production ; modifier le code sous un tag existant ne remplace jamais cette production.

Première release : **Halloween Map V0.1 Beta**, tag **V0.1**. Registry : `ghcr.io/mick7784/halloween-map:V0.1` et `:latest`. Dépôt/package privé : `docker login ghcr.io` si nécessaire. Actions doit autoriser contents/packages en écriture. Corriger et relancer en cas d’échec de publication ; préférer une image versionnée à latest.

## Mise à jour production

Depuis le répertoire du dépôt, après sauvegarde :

```sh
git pull --ff-only origin main
docker compose build
docker compose run --rm migrate
docker compose up -d --force-recreate app worker
docker compose ps
curl --fail http://localhost:3000/api/health
```

Adapter le contrôle santé si APP_PORT diffère. Ne jamais supprimer le volume. Retour arrière : restaurer une sauvegarde compatible si les migrations ne sont pas réversibles.

Alternative GHCR : définir `HALLOWEEN_IMAGE=ghcr.io/mick7784/halloween-map:V0.1` dans `.env`, garder DB active, puis :

```sh
git pull --ff-only origin main
docker compose pull app worker migrate
docker compose run --rm --no-deps migrate
docker compose up -d --no-build --force-recreate app worker
```

Migrations et app doivent toujours utiliser la même image versionnée.

## Backup / restore

Commandes pour shell Unix, depuis le dépôt ; protéger/chiffrer le fichier SQL :

```sh
docker compose exec -T db pg_dump -U halloween -d halloween --clean --if-exists > halloween-backup.sql
docker compose stop app worker
docker compose exec -T db psql -U halloween -d halloween -v ON_ERROR_STOP=1 < halloween-backup.sql
docker compose run --rm migrate
docker compose up -d app worker
```

Tester la restauration dans une instance isolée. Conserver les secrets `.env` séparément, dans un coffre. Limiter la rétention des backups contenant des adresses avant purge.

## Reverse proxy / Pangolin (générique)

Si vous ajoutez vous-même un proxy HTTPS ou Pangolin, diriger le trafic vers APP_PORT, régler APP_ORIGIN sur l’URL publique exacte et COOKIE_SECURE=true, puis recréer app/worker. Ce dépôt ne fournit ni configure proxy, domaine, DNS, certificats ou accès VPS.

## Limites connues de la beta

Parcours estimés sans voirie ni optimisation globale ; fournisseurs externes de tuiles/géocodage du territoire ; une maison par compte, coordonnées saisies ou géolocalisation facultative sur place ; pas d’email transactionnel, reset, paiement ou multi-instance actif. La disponibilité peut évoluer après le calcul : recalculer pendant la soirée.
