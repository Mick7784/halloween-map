# Décor V0.2 et référence visuelle

Le concept art fourni par l’utilisateur est la référence produit : village nocturne, lune ambrée, silhouettes de maisons, charbon/violet, accents orange/corail, serif éditoriale, marqueurs maison et dashboard dense. La composition desktop utilise une zone éditoriale à gauche et le village à droite ; mobile cadre la lune et le village au-dessus du compte à rebours. Cormorant Garamond et Inter sont embarquées localement, sans service de polices externe. Le symbole manoir et les marqueurs sont des SVG natifs ; les icônes fonctionnelles utilisent Lucide.

Asset : `public/art/halloween-village-v2.png`, 1536×1024, illustration générée avec l’outil intégré **image_gen.imagegen**. Aucun texte/logo/interface intégré au bitmap. Les gradients de lisibilité et cadrages sont réalisés en CSS. Aucun asset distant téléchargé.

Prompt utilisé :

> Create a premium panoramic website background illustration, wide 3:2 composition, no text no logos no UI. Elegant adult Halloween French village at night, cinematic painterly realism, deep charcoal blue black and muted violet atmosphere, glowing amber windows in old steep-roof stone houses and gothic manor silhouettes, full golden harvest moon in upper right, bare black branches framing edges, subtle low mist, cobblestones and warm lanterns. Quiet dark negative space across left third and lower middle for white editorial typography to overlay. Village skyline spans middle and lower right, rich detailed inviting warmth, atmospheric moonlight. Sophisticated not childish, no gore, no neon or cyberpunk. Inspired by luxury editorial Halloween festival map concept art. Image must read beautifully both as wide desktop background and a central mobile crop.

Contrôle : image inspectée, puis captures Playwright aux quatre formats 390×844, 820×1180, 1920×1080 et 2560×1440. Captures du dashboard, saison, participant, countdown et carte dans l’artefact `browser-report` de CI. Le style de carte QA synthétique conserve le vrai canvas/worker/markers MapLibre ; la production utilise CARTO Dark Matter par défaut.

## Hero de fiche maison — V0.7.1 Lot 3

Asset final : `public/art/house-detail-v1.png`, 1536 × 1024. Outil intégré `image_gen.imagegen`, mode **generate** (nouvelle image), fond opaque. Image photographique décorative générée, sans texte ni interface ; aucune photo de participant utilisée. La planche fournie sert uniquement à la hiérarchie UX/UI. Elle ne détermine pas l’architecture ou le style de la maison.

Consigne finale de génération :

> Une seule vraie maison résidentielle crédible, façade proche ou léger trois-quarts, pouvant appartenir à un particulier. Rendu photographique/cinématique réaliste et premium. Nuit bleu très sombre/anthracite, couleurs peu saturées, contraste maîtrisé. Décorations Halloween élégantes et plausibles, quelques éclairages orange chauds et touches automnales, décoration visible mais discrète. Image suffisamment sombre pour laisser l’interface dominer. Pas de manoir gothique, château, architecture fantasy, pleine lune énorme, ciel violet saturé, accumulation de citrouilles, village, panorama, esthétique conte ou parc d’attractions.

Contrôle : image finale inspectée dans le workspace. Façade résidentielle, éclairages chauds, deux citrouilles discrètes près de l’entrée ; aucun village ou effet fantastique. `VisitorHouse.css` gère le cadrage et le dégradé de lisibilité. Les dix scénarios E2E ajoutés couvrent les cinq états activité/stock/adaptation à 390 et 1440 px ; leurs captures restent à exécuter en CI, Chromium étant indisponible dans le sandbox local. Les captures historiques ci-dessus concernent l’ancien décor d’accueil, pas ce hero.
