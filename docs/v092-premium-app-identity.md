# V0.9.2 — identité visuelle de l’application

Cette version prolonge l’accueil V0.9.1 accepté comme base restaurée par le propriétaire. Elle dépend de la PR #30 et possède sa propre branche et sa propre PR. La restauration n’est pas présentée comme une reproduction identique de la maquette originale.

## Périmètre

- Palette bleu nuit, violet et ambre ; titres Cormorant Garamond et corps Inter déjà présents dans le projet.
- Surfaces, boutons, champs, bordures, focus clavier, espacements et états harmonisés pour le menu, l’authentification, le compte, la participation, les maisons, la collecte, les panneaux de carte, les fenêtres et les pages secondaires.
- Conservation des thèmes clair/sombre/système de l’administration et des états de danger et de participation.
- Marque citrouille commune ; favicon vectoriel et PNG 16/32, PWA 192/512, icônes maskable 192/512, Apple 180 opaque, manifest et page hors connexion.
- Aucun capteur hors accueil actif : les menus et fenêtres de connexion, compte ou participation suspendent le décor. Le desktop reste fixe. Aucun mouvement des contrôles ou de la carte.

Le décor partagé mobile/desktop et le véritable logo DK restent ceux de la V0.9.1. Les marqueurs géographiques et les contrôles du moteur cartographique sont exclus des règles génériques de boutons.

## Préservation fonctionnelle

Aucune modification des règles d’authentification, des saisons TEST/REAL, de l’horloge serveur, des accès, permissions, collecte ou administration. Le manifest conserve son identifiant, son scope, son URL de démarrage et son mode standalone. Le service worker conserve son comportement réseau et hors connexion ; seuls les favicons publics rejoignent la liste des ressources statiques. Aucune donnée privée, tuile ou réponse API n’est ajoutée au cache.

Halloween Map reste une cartographie et un outil individuel. L’étude d’orientation géographique appartient à une version et une PR ultérieures.

## Vérification

Les tests existants sont conservés. Les nouveaux tests vérifient les tailles réelles et la zone sûre des icônes, les surfaces desktop/mobile, le focus, l’absence de débordement horizontal et la suspension du capteur sous les fenêtres.

Les captures de référence sont conservées dans `artwork/v092/review/`. Elles utilisent des données de test et une horloge figée. Le rapport Playwright complet reste disponible dans les artefacts CI.

Aucune fusion, release, modification de VERSION ni remplacement de l’image `latest` n’est autorisé par cette PR. La validation visuelle du propriétaire et une CI verte précèdent toute publication.
