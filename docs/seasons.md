# Saisons : modèle unique après V0.6.4

## Exploitation

`instances.active_season_id` est l’unique source de vérité, nullable, REAL ou TEST. Les champs `active` des réponses BO sont dérivés de ce pointeur ; il n’existe pas de seconde activation. Activation/désactivation : Super Admin, transaction, verrou instance puis saison. Supprimer une saison active est refusé. Créer une saison, y compris pendant le setup, ne l’active pas. L’activation reste manuelle : aucun nouveau scheduler.

REAL conserve inscriptions, ouverture, fermeture et purge. Aucun utilisateur, admin compris, n’accède à la carte avant l’ouverture. La sélection BO ne modifie pas l’exploitation. TEST active donne accès à ADMIN/SUPER_ADMIN sans session démo, paramètre URL ou calendrier public. Les utilisateurs ordinaires n’obtiennent ni contexte TEST, ni maisons, ni création de participation TEST.

Les comptes sont permanents et globaux. Le Super Admin peut créer un USER actif/vérifié sans invitation, avec mot de passe ; sans email, le serveur génère `test-<identifiant aléatoire>@example.invalid`. Ces adresses internes ne sont jamais livrées par SMTP. Leur identifiant reste visible dans Utilisateurs pour une connexion manuelle si nécessaire. Toute nouvelle participation utilise la saison active verrouillée côté serveur. Le contexte éventuellement transmis par le BO doit correspondre : sinon 409. Un même compte peut participer à plusieurs saisons.

## Migration 008

- Conserve saisons, participations, comptes, mots de passe et sessions.
- Conserve exactement le pointeur actif existant (REAL dans le schéma V0.6.4). L’ancienne référence TEST n’est pas promue automatiquement : les TEST précédemment désignées deviennent désactivées.
- Retire `test_season_id`, `created_for_season_id`, `activated`, `early_access`, les anciens flags de comptes/maisons et triggers d’origine saison. La FK composite de saison active reste en place.
- Conserve `seasons.is_test`, l’unicité participation utilisateur/saison et les FK d’instance.
- Normalise les dates techniques TEST sur 2000–2201. Les anciennes maisons TEST deviennent disponibles immédiatement du point de vue horaire ; contenus, propriétaires, modération, visibilité et activité restent inchangés. La normalisation des maisons ne se répète pas sur replay.
- Aucun drop de données métier ni d’identité. Tester et sauvegarder la base avant une future mise en production. Ce chantier reste local.

## Fin, statistiques et confidentialité

À la clôture REAL, `tick` enlève le pointeur actif et produit un snapshot : maisons inscrites/validées/refusées/en attente, participants distincts, activités proposées, parcours préparés (`routes_count`), plus les agrégats de collecte effectivement reçus. Les maisons restent consultables mais non modifiables jusqu’à la purge prévue. L’historique lit le snapshot, sans reconstruction à partir de maisons purgées.

Les nouveaux départs/fins de collecte transmettent exclusivement : identifiant aléatoire d’idempotence, saison, nombre de maisons prévues/visitées, distance et durée totales. Le serveur cumule lancements, fins, visites, distance, durée et somme des taux de complétion ; les moyennes divisent les totaux par le nombre de collectes terminées. Aucun propriétaire, email, coordonnée, liste de visites ou tracé GPS n’est transmis à cet endpoint. Les reçus aléatoires sans identité empêchent les doubles comptages et sont supprimés à la purge. Un achèvement déjà commencé peut arriver après clôture jusqu’à la purge ; seules ses sommes numériques complètent le snapshot. Celui-ci est définitif après purge.

Les anciens parcours/collectes présents uniquement en local ne sont pas reconstitués ni inventés. Les statistiques de collecte sont déclarées par les appareils ; ce ne sont pas des mesures certifiées côté serveur. Une fin restée hors ligne jusqu’après la purge ne peut plus être ajoutée. La reprise locale demeure inchangée ; les rapports sont idempotents et réessayés au retour réseau.

La purge REAL supprime participations détaillées, campagnes, outbox saisonnière, rappels, reçus de collecte et audits associés. Elle conserve comptes globaux, définition de saison et snapshot numérique. L’historique est en lecture seule ; sa suppression définitive exige le nom exact et supprime saison/snapshot/dépendances. Supprimer TEST supprime son environnement saisonnier sans supprimer aucun compte/token/session global.

La sauvegarde locale d’un parcours est effacée lors du prochain rafraîchissement connecté si son contexte n’est plus accessible ou a changé. Une application hors ligne ne peut pas être effacée à distance ; le serveur ne stocke jamais ces détails.

## BO et téléphone

Page Saison : ligne active, REAL planifiées, saisons désactivées, puis historique. Type séparé de l’état. Création en panneau ; réglages dépliables ; TEST = nom uniquement. Actions critiques Super Admin. Historique = snapshot et suppression définitive. Mobile présente des cartes lisibles avec actions, sans miniaturiser le tableau desktop.

Dashboard principal = saison active uniquement, même si une autre saison est consultée dans Maisons. Sans saison : état vide et « Gérer les saisons ». Utilisateurs reste global. Activité récente saisonnière avec libellés lisibles.

La carte est la vraie application, sans badge TEST ni menu spécial. Sur téléphone, une session ADMIN/SUPER_ADMIN résout la même saison active que le BO. Maisons actualisées toutes les 60 secondes et au retour dans l’application ; contrôle du parcours existant conservé. Le moteur ORS/GPS et les règles de collecte libre ne sont pas modifiés.

## Vérification locale

Résultats locaux : lint et build réussis ; 108 tests Vitest ciblés réussis ; 13 scénarios E2E Saison/Admin/Public réussis, dont le parcours HTTP complet sur base jetable. Les thèmes sombre/clair et les cartes mobile ont été vérifiés visuellement.

`npm run lint`, `npm run build`, tests Vitest ciblés (`business`, `seasons`, `routing-v05` et persistance/collecte), Playwright Saison/Admin/Public. Les tests `seasons` vérifient base vierge, upgrade V0.6.4, replay, FK, permissions, transitions concurrentes, snapshot et suppressions. La base Vitest par défaut est PGlite (PostgreSQL WASM, transactions sérialisées) ; `TEST_DATABASE_URL` permet la même suite sur PostgreSQL avec connexions distinctes. L’environnement de travail ne permet pas de lancer PostgreSQL natif sous un compte non-root : ne pas prétendre que son verrouillage multi-processus a été validé ici.

Pour l’E2E avec vraies APIs : démarrer `scripts/test-db.ts` (base jetable), puis définir `DATABASE_URL`, `SEASON_E2E_DATABASE_URL` vers cette base, `APP_ORIGIN`, `SETUP_TOKEN` et lancer `e2e/seasons-live.spec.ts`. Ne jamais fournir une base de production. Le navigateur peut être fourni par `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`.

## Statistiques et création manuelle BO

La navigation « Statistiques » consulte `GET /api/admin/statistics?seasonId=…` avec les permissions `admin.access` et `stats.read`. Le dashboard conserve son contexte de saison active. Pour une saison sans snapshot, le service agrège les maisons et propriétaires distincts de la saison consultée et expose les compteurs anonymes existants. Dès qu’un snapshot existe, ou que la saison est archivée/purgée, seuls ses agrégats conservés sont utilisés ; aucune adresse, propriétaire ni trace individuelle n’est nécessaire. Une lecture verrouillée de la saison empêche une purge concurrente de remplacer les chiffres par des comptes vides.

Les graphiques comparent activités (plusieurs par maison), états de modération et compteurs parcours/collectes. Ces derniers ne décrivent pas une conversion individuelle. Les totaux de distance, durée, visites et complétion sont déclarés par les appareils lors des rapports de fin. Les métriques absentes et ratios sans dénominateur sont indiqués comme indisponibles ; aucune série temporelle n’est reconstruite.

« + Nouvelle maison » utilise le formulaire de participation existant, la recherche de propriétaires globaux vérifiés et le flux Utilisateurs existant. La création est proposée uniquement dans la saison consultée active. `createHouse` conserve le contrôle serveur du contexte ; `createParticipation` verrouille l’instance et rattache la maison à `active_season_id`, en rejetant un contexte BO différent. Le statut est explicite : `PENDING` en public, `VALIDATED` pour une création BO autorisée. Visibilité, horaires et disponibilité restent indépendants. Les règles de calendrier REAL et de disponibilité TEST existantes sont conservées. Aucune migration n’est nécessaire.
