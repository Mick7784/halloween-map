# Accueil premium — référence visuelle sur baseline V0.5.3

La nouvelle page est limitée à la route `/`. Carte, routage, participation, administration, compte et pages de connexion dédiées conservent leurs composants et règles existants. La publication de cet accueil porte la version V0.5.4, sur baseline fonctionnelle V0.5.3. Aucun changement de données ou d’infrastructure ; l’image est publiée, le pull serveur reste réalisé par l’exploitant.

## A. Fonctionnel maintenant

- Date et heure : `PublicState.season.opens_at`, affichées dans `PublicState.instance.timezone`.
- Compteur jours/heures/minutes/secondes : même horloge React mise à jour chaque seconde ; quatre blocs sur une ligne.
- Nombre de maisons : `PublicState.count`, sans nouvelle requête métier ni adresse exposée.
- Saison : `PublicState.state` pilote les vues avant ouverture, ouverte, fermée/archivée.
- Inscription : `season.registrations_open` pilote le CTA ; le compte connecté mène à `/participant`, le visiteur à `/register`.
- Participation : `/api/house` récupère la maison de l’utilisateur authentifié ; les libellés deviennent « Ma participation » et « Mon parcours » et son statut réel est indiqué (visible/masquée, sans inventer un état « validé »).
- Menu visiteur : formulaire LoginForm existant, connexion réelle, récupération du mot de passe et création de compte. Aucun lien réservé dans ce menu.
- Menu connecté : carte, inscription/participation, parcours, compte, déconnexion. L’entrée Administration utilise la permission existante `admin.access`.
- Mode démo Super Admin : déplacé de la page principale vers le menu, avec la même API et les mêmes contrôles serveur.
- Informations légales : menu connecté ; lien de signature vers À propos pour tous, où les liens légaux existants restent accessibles.
- Drawer : panneau à droite de 85 % de largeur mobile, arrière-plan assombri, fermeture croix/clic extérieur/Échap, focus piégé puis restauré. Seul le panneau peut défiler.
- Composition : 100dvh/hauteur du visual viewport, safe areas, pas de scroll document, CTA minimum 44 px. Desktop recomposé : contenu à gauche, village à droite, chat/portail en premier plan.

## B. UI terminée avec fallback

- Date absente/invalide : prochain 31 octobre à 12:00 dans le fuseau de l’instance, Europe/Paris si ce dernier manque. Ce fallback n’active pas la saison et ne débloque aucune route.
- Nombre absent : 0 maison / déjà inscrite. Les captures QA avec 37 maisons sont des données de test, pas une valeur dans la page réelle.
- Saison absente/inscriptions fermées : CTA compte/création de compte, pas de fausse promesse d’inscription ouverte.
- Statut de participation pas encore récupéré : sous-texte « Consulter ma participation » ; la page participant reste la source autoritaire et gère déjà création/édition.
- Actualisation échouée : les dernières données restent visibles avec un message et Réessayer.
- Texte explicatif fixe demandé : « Découvrez les maisons participantes et préparez votre parcours d’Halloween. »

## C. UI prête à brancher plus tard

Les données de saison, date et compteur ne demandent aucun branchement supplémentaire. Aucun nouveau back-office n’a été créé.

| Option future | Source attendue | Point de branchement |
|---|---|---|
| Décors configurables par commune | Champ validé de configuration d’instance renvoyé par l’API publique | URLs des deux couches dans PremiumHome.css ; le cadrage reste séparé mobile/desktop |
| Texte explicatif éditable | Nouvelle clé publique de contenu, validée par l’administration | `home-explanation` dans PremiumHome.tsx, avec la phrase actuelle comme défaut |
| Libellés contextuels configurables | Paramètres publics de contenu/instance, sans modifier les contrôles serveur | Objet `cta` centralisé dans PremiumHome.tsx |
| Palette/identité graphique par instance | Tokens de configuration d’instance validés | Variables CSS `--home-*` du conteneur `.home-reference` |

## Fichiers

- `components/PremiumHome.tsx` : page, modèle de données dérivé et menu dédié.
- `components/PremiumHome.css` : tokens locaux et compositions responsive ; styles isolés.
- `components/Application.tsx` : branche uniquement la route home sur ce composant et réutilise LoginForm.
- `public/art/home-reference-v2.webp` : décor final généré, 1024 × 1536, compressé WebP (aucun texte/interface dans l’image).
- `e2e/home-reference.spec.ts` et `playwright.home.config.ts` : vérifications ciblées et captures.
- `e2e/journeys.spec.ts` : ouvre le menu avant de choisir Mode démo, conformément au nouvel emplacement.
- `docs/home-reference.md` : ce guide.

## Vérification

Formats : 360×640, 390×844, 430×932, 820×1180, 1440×900. Compteur sur une ligne ; zones essentielles dans le viewport ; scroll document nul ; connexion, quatre états de menu, droits d’administration, fermeture clavier/extérieur et focus. Les captures utilisent des réponses API de test clairement séparées du code produit (date 31 octobre à 12:00, 37 maisons).

## Décor et provenance

Outil intégré `image_gen.imagegen`, via skill imagegen ; pas de CLI/API externe. Le paysage desktop réutilise `public/art/halloween-village-v2.png`. Le nouveau décor mobile et la scène basse desktop sont dans `public/art/home-reference-v2.webp`. Conversion PNG → WebP uniquement, sans modification du contenu généré.

Prompt initial :

> Use case: stylized-concept. Asset type: cinematic portrait background for a premium French Halloween mobile application, 1024x1536 portrait, NO TEXT, NO UI, NO phone frame, NO logos. Primary request: beautiful richly detailed atmospheric family-friendly Halloween village illustration. Composition: upper 35 percent a compact French gothic village of steep rooftops with warm orange glowing windows, a large golden harvest moon clearly visible near upper center-right, smoky violet clouds, intricate black bare branches frame both sides. Middle 40 percent naturally dark near-black muted violet fog with quiet clear negative space, seamless transition reserved for live app interface text later, no objects competing there. Bottom 25 percent iconic black cat seated in profile atop the LEFT stone gate pillar, distinct pointed ears and curved tail, ornate wrought iron closed gate spanning the bottom, warm lit lantern on the RIGHT gate pillar, small discreet pumpkin and orange autumn leaves, warm orange backlit fog through ironwork. Gate and cat unmistakably readable within bottom quarter. Premium cinematic painterly realism, sophisticated detailed illustration, muted blue-black charcoal and plum shadows, creamy golden moon and amber lights, inviting and elegant, no horror/gore, no neon, no cartoon clipart. Frame composition as coherent high-end concept art, foreground silhouettes and depth. Edge-to-edge illustration.

Prompt d’édition retenu :

> Edit this background composition only. Preserve identical sophisticated painterly cinematic village, amber moon, branches, warm lighting and colors. Keep upper village within top 30%. Critical correction: compress and relocate the ENTIRE foreground black cat, left stone pillar, right lantern, wrought iron gate and pumpkin into the bottom 22% of the image. The cat must be clearly visible in profile on the LEFT pillar at y=78% or lower; lantern right at y=80%; gate spans y=84%-97%. Make pillars/gate shorter; do not retain tall gate currently spanning half the image. Leave the entire central zone from y=35% to y=75% as quiet dark near-black plum mist negative space. No text, no UI. Portrait composition. Keep cat and lamp slightly inset horizontally at x=25% and x=75% so both survive narrow central mobile cropping.

Résultats finaux : lint et typecheck réussis, build de production réussi, 10 tests ciblés accueil/menu réussis et 22 tests navigateur du projet réussis (dont activation démo et routage existant).
