# V0.9 — home immersive (spécification de conformité)

## Référence visuelle contraignante
Maquette approuvée le 13/10/2026 : version desktop à gauche, smartphone à droite ; ambiance élégante et mystérieuse, jamais « fête organisée » ni interface cartoon. Composition cible :
- desktop : cadre sombre arrondi, header compact (logo à gauche, menu hamburger seul à droite), grand visuel nocturne couvrant la zone principale, titre sérif « Halloween Map » au centre, trait décoratif minimal, description neutre, carte de compte à rebours fumée bordée d'un fin dégradé violet/ambre, boutons centrés, bande basse d'informations non interactives sur trois colonnes, footer minimaliste ;
- mobile : même hiérarchie et même header avec un seul menu, typographie réduite sans rupture, compteur en quatre cases sur une ligne, deux actions d'authentification visibles sans défilement, informations en petites lignes statiques si la hauteur le permet, sinon masquées ; footer et liens accessibles sans défilement aux tailles mobiles habituelles ;
- signature discrète « Une création de DomotiK Studio », réel logo DK bleu/violet à petite taille, aucune mise en vedette publicitaire ;
- fond couvrant entièrement la scène (`cover`) et non `contain` ; voile dégradé garantissant la lecture sans faire disparaître la photographie ;
- couleurs : nuit #080a14, orange #ff9d45, violet #b98cec, caractères clairs #fbf3f2 ; mouvement sobre et `prefers-reduced-motion` respecté.

## Contraintes intangibles (aucune régression autorisée)
- Une et **une seule** action de menu dans le header sur desktop et mobile.
- Les trois usages sont des **informations**, ni boutons, ni liens, ni menus.
- Premier accès non connecté : boutons Se connecter et Créer un compte immédiatement visibles. La connexion existante est accessible sans quitter l’accueil, inscription et récupération intactes. Les contenus de carte exigent toujours les droits serveur.
- Calcul du compte à rebours identique : `serverTime`, `nextOpening`, `season.opens_at` selon TEST/REAL, heure et fuseau local, fermeture automatique, aucun décompte public artificiel pour la TEST historique.
- Aucune mention suggérant que l’application planifie/organise une soirée, un événement, un rassemblement, un circuit, un itinéraire ou une rencontre. Terminologie : cartographie des maisons participantes, outil **individuel** de suivi de collecte et visites librement choisies.
- Conserver inscriptions, ma participation, droits admin, prévisualisation TEST, erreurs/retry, liens légaux et soutien configurables, version du footer.
- Conserver l'accessibilité clavier, focus, contraste, zones tactiles >=44px pour tous les vrais contrôles, titres structurés et `prefers-reduced-motion`.

## Validation bloquante
1. CI: lint/TS, unitaires complets, build, 151+ Playwright et migrations idempotentes.
2. Affichages réellement évalués à 360x640, 390x844, 430x932, 1440x900 et 2048x1042 : aucune largeur dépassée ; header seul menu ; pied de page visible ; actions de connexion toujours atteignables ; pas de scroll document mobile aux résolutions cibles.
3. Fonds peints en pleine zone, carte du compteur sur une ligne et chiffres mis à jour, images réelles DK et village chargées.
4. États : anonyme, membre inscrit, maison, admin, saison préparée/ouverte/terminée, TEST historique, nextOpening réel ; aucune ouverture erronée ou modification de permissions.
5. Tests interactifs : connexion depuis la home, inscription, récupération, compte/menu, installation PWA, conservation du contexte.
6. Packaging : Docker app/worker OK ; publication seulement après CI verte ; création du tag **V0.9** et des images GHCR `V0.9` et `latest` avec version et digest identiques. Aucune action sur Dockhand : l'utilisateur fait uniquement son pull.

Le ticket de référence fait foi pour toute décision esthétique : ne pas transformer la bande de fonctions en menu, ne pas ajouter de CTA de parcours ni d'organisation.
