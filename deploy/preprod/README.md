# Préproduction UX mobile — V0.7.2

Stack indépendante du Compose de production. Branche `work/v072-ux-from-main`, base UX `a25ada43`. Aucun changement du modèle Saison, des permissions, de la collecte ou d’ORS. Aucun déploiement n’est effectué par ces fichiers.

## 1. Publier l’image dans GitHub

Après avoir vérifié le commit local, **vous** poussez uniquement la branche :

```sh
git push -u origin work/v072-ux-from-main
```

GitHub → Actions → **UX preproduction image** : le push déclenche ce workflow, même si le fichier n’est pas sur `main`. Attendre sa réussite. Il contrôle le Compose, exécute les quatre tests de préproduction, construit le Dockerfile existant et démarre une stack jetable avant publication.

Copier `PREPROD_IMAGE=ghcr.io/mick7784/halloween-map:ux-preprod-<SHA_COMPLET>` depuis le résumé du run. **Utiliser le SHA du nouveau commit poussé, pas `a25ada43`** : l’image doit inclure ces scripts de préproduction. Un digest GHCR est aussi affiché pour vérification du contenu. Le tag désigne ce commit ; un rerun peut republier le même tag. Pas de `latest`, de tag Git, de release ou de déploiement automatique. Le workflow de production reste inchangé. Ne pas lancer « CI and release » pour cette opération.

Autoriser Actions à publier dans le package GHCR si nécessaire. Si le package est privé, ajouter dans Dockhand une connexion au registre `ghcr.io` avec un token limité à `read:packages`. Le `GITHUB_TOKEN` de publication est fourni par Actions ; ne jamais le copier dans le Compose.

## 2. Paramètres indispensables

Créer une nouvelle stack Dockhand nommée **`halloween-map-ux-preprod`**, depuis cette branche, fichier **`deploy/preprod/compose.yaml`** uniquement. Ne pas l’ajouter en override à la stack de production.

Configurer le fichier d’environnement de cette stack sur `deploy/preprod/.env` (pas celui de production). Recopier `deploy/preprod/.env.example` dans ses variables et remplir :

| Variable                                   | Valeur à fournir                                                              |
| ------------------------------------------ | ----------------------------------------------------------------------------- |
| `PREPROD_IMAGE`                            | Tag exact du résumé GitHub                                                    |
| `PREPROD_APP_ORIGIN`                       | `https://` + votre nouveau sous-domaine, sans slash final ni chemin           |
| `PREPROD_PROXY_NETWORK`                    | Nom réel du réseau Docker déjà accessible à votre Newt/Traefik                |
| `PREPROD_DB_PASSWORD`                      | Nouveau secret aléatoire d’au moins 24 caractères                             |
| `PREPROD_ADMIN_PASSWORD`                   | Nouveau mot de passe Super Admin, au moins 12 caractères                      |
| `PREPROD_USER_PASSWORD`                    | Nouveau mot de passe commun aux seuls comptes fictifs, au moins 12 caractères |
| `PREPROD_TERRITORY`, `PREPROD_POSTAL_CODE` | Zone de test choisie                                                          |
| `PREPROD_LATITUDE`, `PREPROD_LONGITUDE`    | Centre réel proche du téléphone, en degrés décimaux                           |
| `PREPROD_ORS_API_KEY`                      | Clé ORS dédiée au test si le serveur ORS hébergé est utilisé                  |

Générer chaque secret séparément, par exemple avec `openssl rand -hex 24`. Ne pas réutiliser un mot de passe de production. Ne pas publier les variables/secrets, logs de bootstrap ou fichiers `.env`. Les valeurs fictives du workflow ne sont jamais des identifiants de déploiement.

Dans Dockhand, marquer les trois mots de passe et la clé ORS comme **secrets** dans l’onglet Environment ; Dockhand les injecte au processus Compose sans les écrire dans le fichier `.env`. Les secrets Compose proviennent des variables `PREPROD_*` et sont montés dans `/run/secrets`; Docker Compose v2 avec `secrets.environment` est nécessaire. Dockhand doit transmettre ces variables au processus Compose. En CLI, créer `deploy/preprod/.env` depuis l’exemple ; si Compose signale un secret d’environnement absent, exporter les trois variables de mot de passe dans le shell en plus du fichier `.env`.

**Réseau à vérifier avant déploiement :** le connecteur chargé d’atteindre l’application doit déjà partager le réseau indiqué et résoudre `halloween-map-ux-preprod`. Ce nom unique évite les collisions avec les services `app` des autres stacks. Si votre Newt fonctionne en mode host / sur un autre hôte, ce chemin sans port publié n’est pas directement applicable : il faut préciser cette topologie. Ne pas attacher PostgreSQL au réseau du proxy et ne pas modifier les conteneurs de production pour improviser un accès.

## 3. Configurer Pangolin avant d’ouvrir l’accès

1. Créer le DNS du **nouveau** sous-domaine vers l’entrée Pangolin existante, sans modifier le DNS de production.
2. Dans Pangolin, créer une ressource **HTTP/HTTPS** sur le site/connecteur concerné. Domaine = celui de `PREPROD_APP_ORIGIN`. Cible HTTP = **`halloween-map-ux-preprod:3000`**.
3. Activer HTTPS avec certificat valide et redirection HTTP → HTTPS. Conserver l’hôte public et les en-têtes proxy ; ne pas réécrire `Origin`.
4. Activer l’authentification Pangolin et limiter la ressource à votre compte ou aux seuls testeurs. **Aucun bypass pour `/api`, `/setup`, les assets ou toute autre route.** Ne pas créer de route Traefik directe contournant cette protection. `traefik.enable=false` évite la découverte automatique par le provider Docker.
5. Prévoir un éventuel healthcheck du backend sur `/api/health` depuis le réseau interne, pas une exception publique d’authentification.

Le navigateur s’authentifie d’abord dans Pangolin, puis dans Halloween Map. `COOKIE_SECURE=true` et `APP_ORIGIN` exact permettent cookies et contrôle CSRF. Un domaine distinct isole les cookies et la PWA de production. L’autorisation GPS mobile exige un HTTPS valide ; ne pas ignorer une erreur de certificat.

## 4. Pull et démarrage — à faire dans Dockhand

Pull des images de cette nouvelle stack, puis déployer. L’ordre est automatique : **db saine → migrations existantes → données fictives → app + worker**. Aucun port n’est publié, même PostgreSQL. Le seul volume est **`halloween-map-ux-preprod-postgres`**, distinct de `postgres_data` de production.

Équivalent CLI depuis la racine du dépôt, avec les variables remplies :

```sh
docker compose --env-file deploy/preprod/.env -f deploy/preprod/compose.yaml config -q
# Contrôle renforcé facultatif si Node est disponible sur cet hôte :
node scripts/check-preprod.mjs deploy/preprod/.env

docker compose --env-file deploy/preprod/.env -f deploy/preprod/compose.yaml pull
docker compose --env-file deploy/preprod/.env -f deploy/preprod/compose.yaml up -d --wait --wait-timeout 180 app worker
```

Pour contrôler le démarrage dans Dockhand : `migrate` et `seed` doivent être terminés avec code 0 ; `db`, `app`, `worker` doivent être sains. Les logs de seed ne contiennent pas les mots de passe. Ne pas utiliser le lien de setup de migrate : le seed le remplace et termine la configuration existante.

## 5. Connexion et données de test

| Compte                    | Email de connexion fictif       | Mot de passe             |
| ------------------------- | ------------------------------- | ------------------------ |
| Super Admin               | `superadmin-ux@example.invalid` | `PREPROD_ADMIN_PASSWORD` |
| Admin                     | `admin-ux@example.invalid`      | `PREPROD_USER_PASSWORD`  |
| Visiteur USER sans maison | `visiteur-ux@example.invalid`   | `PREPROD_USER_PASSWORD`  |

Le seed utilise le setup, la création sans invitation, la création BO et les actions Saison/statuts existants. Il crée 9 propriétaires fictifs supplémentaires et **9 maisons par saison** : cinq niveaux de frayeur, une adaptable, une en pause, une fermée et une sans bonbons mais avec décoration/mise en scène. Sept maisons sont visibles. Aucun email réel, invitation ou campagne n’est créé.

- **REAL active indépendante** : calendrier dynamique, ouvert depuis une heure et pendant sept jours. Permet le parcours USER normal, filtres cumulatifs, collecte et permissions publiques.
- **TEST inactive avec ses propres maisons** : activer depuis le BO, après désactivation de REAL, pour tester la vraie carte en ADMIN/SUPER_ADMIN. Le USER doit perdre cet accès. Revenir ensuite à REAL par les mêmes actions.
- Une seule saison active, comptes globaux, aucun mélange avec la production. Dans ce HEAD, il n’existe **pas** de bypass anticipé pour une REAL fermée, même en Super Admin : le calendrier commun reste appliqué. L’accès d’essai existant utilise TEST active, réservée aux administrateurs. Aucun mode démo, `early_access` ou logique parallèle n’est réintroduit.
- Sur PC, ouvrir le BO de **ce sous-domaine** ; sur téléphone, ouvrir la carte du même sous-domaine. Tester pause/fin/reprise et disponibilité bonbons ; laisser le polling existant ou revenir au premier plan pour voir les changements.
- Les coordonnées sont des **repères synthétiques autour du centre fourni**, pas des adresses de participants. Avant validation réelle d’ORS/GPS, repositionner les maisons depuis ce BO sur des lieux piétons réellement accessibles. Ne pas supposer qu’un décalage géographique tombe sur une rue.
- Le worker conserve dates/purge/entretien existants, mais n’a pas de sortie réseau. Le wrapper vide tous les paramètres SMTP de l’app et du worker : aucun envoi externe. Seules les requêtes nécessaires aux cartes, adresses et ORS restent possibles depuis l’app/navigateur.

Le seed est conservateur : une instance déjà marquée est laissée intacte, une base non vide non marquée est refusée. Une mise à jour d’image ne remet pas les dates/statuts à zéro. Après sept jours, ou pour repartir d’un état vierge, supprimer **cette seule** stack et son volume puis redéployer. En cas d’initialisation partielle, faire de même ; aucun nettoyage destructif automatique.

## 6. Supprimer la préproduction

Désactiver/supprimer la ressource Pangolin de test, puis supprimer la stack **`halloween-map-ux-preprod`** et son volume dans Dockhand. Équivalent CLI :

```sh
docker compose --env-file deploy/preprod/.env -f deploy/preprod/compose.yaml down --volumes --remove-orphans
```

Retirer ensuite le DNS de test et ses secrets. Le réseau proxy est externe : cette commande ne le supprime pas. Ne pas lancer de `docker system prune`, de nettoyage global, ni de commande sur le Compose de production.

Références : [Pangolin, ressources et protection](https://docs.pangolin.net/manage/resources/understanding-resources), [Docker Compose, secrets](https://docs.docker.com/reference/compose-file/secrets/), [Docker Compose, réseaux](https://docs.docker.com/reference/compose-file/networks/), [Dockhand, variables et secrets](https://dockhand.pro/manual/).
