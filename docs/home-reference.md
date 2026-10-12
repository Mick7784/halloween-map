# Accueil premium — V0.8.4

Le décor original public/art/home-reference-v2.webp est affiché sur mobile et desktop. Les styles globaux ne masquent plus la couche .home-art ; le contenu utilise la composition PremiumHome et les titres peuvent revenir à la ligne. Sur un petit écran, le contenu central défile si nécessaire pour conserver la connexion accessible, sans faire défiler tout le document.

Le décompte utilise uniquement une ouverture réelle configurée : season.opens_at pour une REAL, nextOpening lorsqu’une TEST historique reste sélectionnée ou qu’aucune saison applicative n’est disponible. Sans date réelle future valide, aucun décompte artificiel n’est affiché. Les maisons d’une TEST sont explicitement identifiées comme aperçu administrateur.

nextOpening ne modifie ni active_season_id ni les permissions. La carte publique exige toujours une saison réelle activée et sa fenêtre d’ouverture. La prévisualisation TEST reste réservée aux administrateurs. Les inscriptions de comptes restent indépendantes de la saison ; les inscriptions de maisons suivent leurs règles serveur.

L’horloge est recalée sur serverTime, actualisée chaque seconde et revalidée chaque minute, au retour de visibilité, sur pageshow et à l’ouverture, y compris pour un draft ou une prochaine REAL indiquée séparément.

Les tests de e2e/home-reference.spec.ts vérifient l’asset effectivement visible et sa contribution aux pixels affichés, les titres dans le viewport, les scénarios préparation/fermeture/draft/TEST/REAL et les commandes accessibles. Les captures restent des fixtures isolées, jamais des données de production.

Le panneau Maisons et filtres affiche toujours sa liste. Les filtres conservent icônes, libellés et aria-pressed ; les fiches utilisent des icônes avec libellés non visuels accessibles. Fermeture X, Échap et restauration du focus restent gérées par les composants partagés.

Aucune nouvelle image, migration ou modification des données persistantes n’est requise pour V0.8.4.
