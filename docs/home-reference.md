# Accueil premium — composition et fonctionnement actuel V0.7.1

La composition d’accueil introduite en V0.5.4 est conservée. Ce document décrit ses sources actuelles ; les règles métier Saison et collecte libre sont décrites dans [seasons.md](seasons.md).

## A. Fonctionnel maintenant

- Date et heure : `PublicState.season.opens_at`, affichées dans `PublicState.instance.timezone`.
- Compteur jours/heures/minutes/secondes : même horloge React mise à jour chaque seconde ; quatre blocs sur une ligne.
- Nombre de maisons : `PublicState.count`, sans nouvelle requête métier ni adresse exposée.
- Saison : `PublicState.state` pilote les vues avant ouverture, ouverte, fermée/archivée.
- Inscription : `season.registrations_open` pilote le CTA ; le compte connecté mène à `/participant`, le visiteur à `/register`.
- Participation : `/api/house` récupère la maison de l’utilisateur authentifié ; les libellés et cartouches utilisent les statuts de modération persistés PENDING/VALIDATED/REFUSED.
- Menu visiteur : formulaire LoginForm existant, connexion réelle, récupération du mot de passe et création de compte. Aucun lien réservé dans ce menu.
- Menu connecté : carte, inscription/participation, parcours, compte, déconnexion. L’entrée Administration utilise la permission existante `admin.access`.
- Environnement de test : activation explicite d’une saison TEST depuis le BO, avec les mêmes maisons et horaires réels ; accès carte réservé aux admins.
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

Les données de saison, date et compteur ne demandent aucun branchement supplémentaire. Le BO actuel dispose de ses pages Saison, Dashboard, Statistiques, Communications et Activité.

| Option future                           | Source attendue                                                             | Point de branchement                                                                |
| --------------------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Décors configurables par commune        | Champ validé de configuration d’instance renvoyé par l’API publique         | URLs des deux couches dans PremiumHome.css ; le cadrage reste séparé mobile/desktop |
| Texte explicatif éditable               | Nouvelle clé publique de contenu, validée par l’administration              | `home-explanation` dans PremiumHome.tsx, avec la phrase actuelle comme défaut       |
| Libellés contextuels configurables      | Paramètres publics de contenu/instance, sans modifier les contrôles serveur | Objet `cta` centralisé dans PremiumHome.tsx                                         |
| Palette/identité graphique par instance | Tokens de configuration d’instance validés                                  | Variables CSS `--home-*` du conteneur `.home-reference`                             |

## Fichiers

- `components/PremiumHome.tsx` : page, modèle de données dérivé et menu dédié.
- `components/PremiumHome.css` : tokens locaux et compositions responsive ; styles isolés.
- `components/Application.tsx` : branche uniquement la route home sur ce composant et réutilise LoginForm.
- `public/art/home-reference-v2.webp` : décor final généré, 1024 × 1536, compressé WebP (aucun texte/interface dans l’image).
- `e2e/home-reference.spec.ts` et `playwright.home.config.ts` : vérifications ciblées et captures.
- `e2e/journeys.spec.ts` : parcours de connexion et navigation existants.
- `docs/home-reference.md` : ce guide.

## Vérification

Formats : 360×640, 390×844, 430×932, 820×1180, 1440×900. Compteur sur une ligne ; zones essentielles dans le viewport ; scroll document nul ; connexion, quatre états de menu, droits d’administration, fermeture clavier/extérieur et focus. Les captures utilisent des réponses API de test clairement séparées du code produit (date 31 octobre à 12:00, 37 maisons).

## Décor et provenance

Outil intégré `image_gen.imagegen`, via skill imagegen ; pas de CLI/API externe. Le paysage desktop réutilise `public/art/halloween-village-v2.png`. Le nouveau décor mobile et la scène basse desktop sont dans `public/art/home-reference-v2.webp`. Conversion PNG → WebP uniquement, sans modification du contenu généré.

Prompt initial :

> Use case: stylized-concept. Asset type: cinematic portrait background for a premium French Halloween mobile application, 1024x1536 portrait, NO TEXT, NO UI, NO phone frame, NO logos. Primary request: beautiful richly detailed atmospheric family-friendly Halloween village illustration. Composition: upper 35 percent a compact French gothic village of steep rooftops with warm orange glowing windows, a large golden harvest moon clearly visible near upper center-right, smoky violet clouds, intricate black bare branches frame both sides. Middle 40 percent naturally dark near-black muted violet fog with quiet clear negative space, seamless transition reserved for live app interface text later, no objects competing there. Bottom 25 percent iconic black cat seated in profile atop the LEFT stone gate pillar, distinct pointed ears and curved tail, ornate wrought iron closed gate spanning the bottom, warm lit lantern on the RIGHT gate pillar, small discreet pumpkin and orange autumn leaves, warm orange backlit fog through ironwork. Gate and cat unmistakably readable within bottom quarter. Premium cinematic painterly realism, sophisticated detailed illustration, muted blue-black charcoal and plum shadows, creamy golden moon and amber lights, inviting and elegant, no horror/gore, no neon, no cartoon clipart. Frame composition as coherent high-end concept art, foreground silhouettes and depth. Edge-to-edge illustration.

Prompt d’édition retenu :

> Edit this background composition only. Preserve identical sophisticated painterly cinematic village, amber moon, branches, warm lighting and colors. Keep upper village within top 30%. Critical correction: compress and relocate the ENTIRE foreground black cat, left stone pillar, right lantern, wrought iron gate and pumpkin into the bottom 22% of the image. The cat must be clearly visible in profile on the LEFT pillar at y=78% or lower; lantern right at y=80%; gate spans y=84%-97%. Make pillars/gate shorter; do not retain tall gate currently spanning half the image. Leave the entire central zone from y=35% to y=75% as quiet dark near-black plum mist negative space. No text, no UI. Portrait composition. Keep cat and lamp slightly inset horizontally at x=25% and x=75% so both survive narrow central mobile cropping.

Les résultats de validation doivent être lus dans la CI du commit concerné ; les anciennes captures de composition ne valident pas les changements métier ultérieurs.

## Installation depuis le menu latéral

L’action secondaire « Ajouter l’application » est accessible aux visiteurs et à tous les rôles connectés. Elle figure sous la connexion pour les visiteurs, avant Mon compte pour les membres. Aucun CTA n’est ajouté à l’accueil.

`InstallAppProvider`, monté dans le layout, enregistre `/sw.js` et écoute `beforeinstallprompt` même lorsque le menu est fermé. `InstallApp` consomme cette offre native une seule fois. Une annulation masque l’action jusqu’à une nouvelle offre du navigateur ; une acceptation, `appinstalled` ou le mode standalone la masque également. Aucun écran ne simule une installation.

Sur iOS, une aide intégrée au menu indique Partager puis « Sur l’écran d’accueil ». Pour les autres navigateurs iOS, elle propose d’ouvrir la page dans Safari. Sans offre native ni méthode iOS, aucune action inactive n’est affichée. L’aide reste dans le panneau existant, avec fermeture explicite ; le document conserve son viewport fixe.

Le support actuel comprend `app/manifest.ts`, son lien dans `app/layout.tsx`, les icônes PNG et Apple, `/sw.js` et `/offline.html`. Aucun de ces éléments ne manque au branchement. Le déclenchement natif dépend du navigateur et d’un contexte sécurisé HTTPS (localhost pour le développement). Il faut vérifier la proposition réelle sur le domaine de production et l’ajout manuel sur un appareil iOS ; les événements simulés en test vérifient le branchement UI, pas l’éligibilité réelle du navigateur. Une éventuelle future évolution du manifest, des icônes ou du service worker doit conserver ce provider et l’événement natif, sans ajouter de faux bouton d’installation.

L’installation depuis le menu est publiée dans V0.5.5 ; la composition de référence reste celle de V0.5.4.
