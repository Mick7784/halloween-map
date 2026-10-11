# Captures de revue V0.8.2

Captures Playwright de l’application, le 11 octobre 2026. Mobile : 390 × 844 ; desktop : 1440 × 900. Données fictives exclusivement.

| Écran | Mobile | Desktop |
| --- | --- | --- |
| Consultation des maisons | [Carte](review-map-390.png) | [Carte](review-map-1440.png) |
| Collecte libre sans tracé | [Collecte](review-collection-390.png) | [Collecte](review-collection-1440.png) |
| Création : confirmation de l’emplacement | [Formulaire](review-location-390.png) | [Formulaire](review-location-1440.png) |
| Consentement et bouton d’envoi, bas du formulaire | [Consentement](review-consent-390.png) | [Consentement](review-consent-1440.png) |
| Back-office : éditeur et sauvegarde | [Éditeur](review-editor-390.png) | [Éditeur](review-editor-1440.png) |

La carte et la collecte utilisent l’UI, l’API et PostgreSQL de test réels, avec un fond cartographique neutre contrôlé pour rendre les captures reproductibles ; elles ne valident pas la disponibilité des tuiles externes. La maison est une fixture de test. Le test compte les requêtes reçues par le fournisseur de directions : **zéro** pendant la préparation et la collecte. L’éditeur est sauvegardé par l’API réelle dans PostgreSQL, avec vérification du rendu email. Le formulaire est une capture de l’UI réelle avec API d’adresse simulée ; les autres tests couvrent la création réelle et les refus API.

Les quatre maquettes originales ne sont pas accessibles dans la conversation transférée. Ces captures permettent une revue humaine, mais ne prouvent pas la conformité visuelle exacte. Seule la dernière maquette de collecte **sans tracé** doit servir de référence. Aucun chemin orange ne doit être ajouté.

Les scénarios de régression complémentaires vérifient les pins orange doux, le halo de proximité GPS fiable, les maisons visitées gris-violet, les activités communes, l’ajout hors filtres et le retrait, la progression, le chrono, la distance observée et sa suspension lors des interruptions GPS. Les captures ci-dessus montrent un échantillon d’une seule maison ; consulter les artefacts navigateur CI pour les autres états.

Finitions de la revue 6108959164 : captures collecte et formulaire actualisées. Les blocs Temps écoulé / Distance parcourue et leur statut GPS sont distincts, les commandes de carte sont espacées ; la case de consentement contrastée reste visible au-dessus du bouton d’envoi, désormais dans le flux. Les tests vérifient les dimensions, la taille des valeurs, l’absence de recouvrement et l’envoi activé après acceptation. Clavier virtuel et GPS sur téléphone réel restent à contrôler par le propriétaire.
