# Inscrire ma maison / Ma participation

## Périmètre

Un formulaire `ParticipationForm` sert à la création et à l’édition dans `ParticipationOverlay`. L’application garde l’écran précédent monté, bloque son défilement et restaure son focus à la fermeture. Le panneau utilise 100dvh, un défilement interne et une présentation étendue en deux colonnes sur desktop. Les confirmations sont accessibles au clavier ; Échap annule la confirmation ou ferme le panneau.

Les API existantes `/api/participation`, `/api/house` et `/api/participant`, les acceptations légales, la fenêtre de saison, les activités DECORATION/CANDY/ACTING, le mode adaptable et les états ACTIVE/PAUSED/ENDED sont réutilisés. L’administration conserve son formulaire existant.

## Adresse et point de référence

La migration additive `005_participation_address.sql` ajoute `participations.address_parts` (JSONB). Le moteur de migrations existant l’appliquera au prochain déploiement. Le texte d’adresse existant reste présent. Aucun point n’est déplacé par la migration.

Les anciennes adresses préremplissent les éléments reconnaissables (numéro, rue, code postal et ville lorsqu’ils existent). Aucun code commune n’est inventé. Si l’adresse structurée manque, l’utilisateur complète les éléments nécessaires et confirme explicitement le point. Une adresse structurée déjà enregistrée conserve sa confirmation jusqu’à une modification.

`HouseLocation` charge les communes françaises du code postal via un proxy authentifié `/api/location`. La recherche utilise le géocodage IGN et normalise les communes/arrondissements avec l’API géographique officielle. GPS, clic sur la carte, déplacement du marqueur et coordonnées manuelles sont utilisables. L’autocomplétion ne remplace jamais un point déjà ajusté ; une demande GPS explicite peut le remplacer. Les réponses arrivant après une modification sont ignorées.

Le serveur contrôle à nouveau la commune, le code postal et l’appartenance du point à la commune. Il conserve les coordonnées choisies, sans les remplacer par celles du géocodeur. Hors France, un point est refusé. Une adresse française doit être trouvée à moins de 1 km du point. Un service indisponible retourne une erreur courte et conserve la saisie ; la confirmation et l’enregistrement attendent son rétablissement. Les anciens clients sans `address_parts` et le formulaire administrateur restent compatibles avec leur contrat existant : ils ne bénéficient pas de cette nouvelle validation structurée.

Fournisseurs fixes, requêtes limitées et délai maximal de 6 secondes ; aucun hôte fourni par le client :

- [Communes — API géographique](https://geo.api.gouv.fr/decoupage-administratif/communes)
- [Géocodage — Géoplateforme IGN](https://ignf.github.io/cartes.gouv.fr-documentation/fr/guides-utilisateur/utiliser-les-services-de-la-geoplateforme/geocodage/)

## Actions et parcours

`participantAction` ajoute `deplete` avec un choix obligatoire : `continue` nécessite ACTING et met uniquement `candy_available=false` ; `close` applique également ENDED. Les deux mises à jour sont atomiques. Sans ACTING, seule la fermeture est proposée. La disponibilité effective continue d’utiliser le modèle existant. L’action existante `candy` permet de rétablir les bonbons lorsque l’accueil est encore ouvert.

`end` conserve la participation, alors que `delete` exige la confirmation SUPPRIMER et réutilise la suppression existante. Les confirmations affichées n’envoient aucune mutation tant qu’un choix n’a pas été validé.

La collecte libre conserve les maisons sélectionnées et signale les étapes devenues indisponibles via le polling existant. Les nouvelles estimations excluent les maisons non visitables. Les rapports de fin contiennent uniquement des agrégats, dans une file locale distincte du parcours : retour carte et rechargement ne les effacent pas. Ils sont relancés jusqu’à acquittement serveur, avec le même identifiant idempotent, sans trace GPS complète.

## Futur back-office

Les réglages publics sont centralisés dans `lib/participation-settings.ts`, puis lus depuis `instances.config.participation` :

```json
{
  "activities": ["DECORATION", "CANDY", "ACTING"],
  "fearLabels": ["Très doux", "Familial", "Modéré", "Frissonnant", "Intense"],
  "descriptionLimit": 180,
  "practicalLimit": 300,
  "allowedCommuneCodes": []
}
```

Les valeurs absentes ou invalides reviennent aux valeurs par défaut. Les limites ne peuvent dépasser 180/300 ; une liste de communes vide signifie toutes les communes françaises. Les limites et les communes autorisées sont aussi contrôlées côté serveur. `activities` configure les choix proposés, conserve les valeurs historiques du modèle et ne migre pas les participations existantes. Les horaires restent fondés sur la saison et le fuseau de l’instance ; les règles légales restent fondées sur les documents versionnés existants.

Un futur écran d’administration pourra éditer ce bloc avec ses permissions existantes. Des plages horaires plus fines, des paramètres GPS (précision, distance d’adresse, fournisseur) ou de nouvelles règles nécessiteront un contrat commun validé côté serveur avant exposition dans ce bloc ; aucun réglage inactif n’est présenté comme fonctionnel.

Le modèle actuel utilise VISIBLE/HIDDEN et valide automatiquement les créations depuis la migration 004. Le cartouche affiche Validée pour VISIBLE, et Participation enregistrée pour HIDDEN, sans afficher l’état administratif « masquée ». Le rendu accepte un futur `review_status` PENDING/VALIDATED/REFUSED. Il faudra ajouter sa persistance et son workflow administrateur pour avoir de véritables décisions En attente/Refusée. La refonte ne simule pas ces décisions.

## Vérification locale ciblée

- Build de production, TypeScript et lint des fichiers concernés.
- Contrôles métier : adresse France/arrondissement, préremplissage ancien format, réglages publics, point personnalisé conservé, fermeture atomique, conservation limitée du parcours.
- Contrôles navigateur : création/édition à 390 et 1440 px, retour au contexte, enregistrement, erreur avec conservation de la saisie, GPS et confirmation du point, frayeur adaptable, confirmations et suppression.
- Test existant de création adapté à la confirmation explicite du point.

Aucune publication n’est déclenchée par ce lot local.
