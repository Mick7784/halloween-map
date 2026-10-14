<div align="center">

![Logo officiel de Halloween Map](public/pwa/icon-512.png)

# Halloween Map 🎃

**La carte participative qui transforme Halloween en balade de quartier.**

Une application web conçue pour découvrir les maisons qui participent à Halloween, préparer sa sortie et suivre sa collecte de bonbons, tout en laissant aux habitants le contrôle de leur participation.

**Un projet imaginé et développé par [DomotiK Studio](https://domotik-studio.fr/).**

[Découvrir Halloween Map](https://halloween-map.domotik-studio.fr/) · [Fonctionnement](#comment-ça-marche) · [Fonctionnalités](#ce-que-propose-halloween-map) · [Participer au projet](#contribuer)

</div>

---

## Une Halloween Map, pour tout le quartier

Le soir d’Halloween, on connaît rarement toutes les maisons qui jouent le jeu. Halloween Map permet aux habitants de signaler leur participation et aux familles de découvrir les lieux accueillants sur une carte dédiée à leur événement.

L’objectif n’est pas de transformer la fête en course ni de collecter des données de déplacement, mais de **faciliter la rencontre, la découverte des décorations et la tournée des bonbons**.

![Ambiance nocturne de Halloween Map](public/art/home-reference-v2.webp)

## Comment ça marche

**Pour les habitants :** créez votre compte, proposez une maison, indiquez son emplacement, ses horaires, ses activités et son niveau de frayeur. Une équipe organisatrice examine les propositions avant publication. En cas de rupture de bonbons ou de changement de programme, la maison peut être mise en pause ou fermée.

**Pour les visiteurs :** connectez-vous quand la saison ouvre, découvrez les maisons disponibles et préparez votre balade. Pendant la collecte, la carte suit votre position si vous l’autorisez et vous permet de marquer les visites effectuées. L’ordre reste libre : chacun choisit son aventure.

**Pour les organisateurs :** une administration sur ordinateur permet de suivre les participations, modérer les maisons, gérer les saisons, configurer les informations de l’événement et consulter des statistiques agrégées.

## Ce que propose Halloween Map

| Fonctionnalité | Dans l’application |
|---|---|
| 🏠 **Maisons participantes** | Carte des maisons validées avec horaires, activités et disponibilité |
| 🍬 **Collecte libre** | Sélection de maisons, visites déclarées, distance parcourue et récapitulatif |
| 🎭 **Frayeur adaptée** | Indication des maisons capables d’adapter leur mise en scène à l’âge ou à la sensibilité des visiteurs |
| 🧭 **Localisation facultative** | Position GPS et indication d’orientation sur certains appareils, sans guidage vocal |
| 🕯️ **Saisons** | Événements réels, saisons de test, dates d’ouverture et fermeture configurables |
| 📬 **Communications** | Emails de compte, notifications et campagnes administrées avec un éditeur HTML sécurisé |
| 📱 **Application installable** | Expérience PWA sur Android, iPhone et ordinateur |
| 🛡️ **Modération** | Validation, refus et gestion de la visibilité et des disponibilités |
| 📊 **Statistiques** | Indicateurs agrégés pour les organisateurs, sans historique complet du tracé GPS |

L’application est proposée comme **web app installable (PWA)** : il n’est pas nécessaire de la télécharger depuis une boutique d’applications.

## Respect de la vie privée

La carte et les parcours sont accessibles aux personnes connectées pendant la période autorisée. Les habitants peuvent gérer leur participation et leur compte. Les données des maisons sont liées à une saison et soumises à une purge planifiée ; les comptes et quelques indicateurs agrégés sont gérés séparément.

La reprise d’une collecte peut utiliser un stockage local temporaire sur l’appareil. La position GPS sert au fonctionnement du parcours, mais l’application ne constitue pas un service de suivi en direct d’utilisateurs.

Les informations relatives au traitement et à la conservation des données sont détaillées dans les [pages publiques de confidentialité](https://halloween-map.domotik-studio.fr/privacy). **L’exploitant doit compléter et publier ses coordonnées et durées de conservation avant l’ouverture publique.**

## Une expérience évolutive

Halloween Map privilégie une identité nocturne, élégante et lisible. L’interface publique fonctionne sur mobile et sur ordinateur ; l’administration complète est réservée aux écrans d’ordinateur, tandis que la version mobile de l’administration affiche uniquement des statistiques en lecture seule.

La version actuelle est indiquée dans le fichier [VERSION](VERSION). Le projet est diffusé en **Beta** ; les envois d’emails, la géolocalisation et les conditions réelles de couverture réseau doivent être vérifiés avant chaque ouverture d’événement.

## Contribuer

Vous souhaitez signaler un bug, proposer une amélioration ou contribuer à la traduction et au code ? Les [issues GitHub](https://github.com/Mick7784/halloween-map/issues) et les [pull requests](https://github.com/Mick7784/halloween-map/pulls) sont ouvertes aux contributions pertinentes.

Pour les personnes qui hébergent ou maintiennent une instance, les informations détaillées sont séparées de cette présentation :

- [Installation, déploiement et exploitation](docs/OPERATIONS.md)
- [Saisons et fonctionnement métier](docs/seasons.md)
- [Préparation de l’ouverture publique](docs/GO-LIVE.md)
- [Historique des versions](CHANGELOG.md)

---

<div align="center">

**Halloween Map — Une nuit à partager.** 🎃

*Créé avec passion par DomotiK Studio.*

</div>
