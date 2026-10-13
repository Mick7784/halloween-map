# Halloween Map — V0.9.1 : décor commun mobile/desktop et parallaxe mobile

> **Statut : chantier en cours / PR en brouillon. Ne pas fusionner ni publier sans revue des captures et CI complète.**
>
> Base : `main` / release V0.9 validée. Mission strictement visuelle, **uniquement sur la page d’accueil**.

## Reprise locale du 13 octobre 2026

### Décision utilisateur et adaptation commune

L’utilisateur a accepté la restauration comme nouvelle base et demandé **la même version mobile sur desktop, avec adaptation du visuel au format large si nécessaire**. Cette décision remplace le blocage précédent sur le master original. Elle ne vaut pas autorisation de fusion, release ou publication.

- Master propre commun : `artwork/v091/scene-mobile-desktop-master.png` (1536×1024), restauré et étendu à partir de la version mobile de la maquette via imagegen. Desktop et mobile utilisent **le même fichier** `public/art/home-v091-shared.webp` (253 612 octets) ; seuls les cadrages responsive changent. Le header partage désormais le décor avec la scène et le compteur reprend la typographie sans serif du mobile.
- Trois plans natifs alpha : `home-v091-far.webp`, `home-v091-mid.webp`, `home-v091-near.webp`, tous issus des pixels du même master. Le résultat recoloré de l’extraction imagegen n’est utilisé que comme **masque alpha** ; ses pixels RGB sont exclus. Le masque intermédiaire est un tracé enregistré sur le même canvas. À chaque pixel, un seul plan possède l’opacité : reconstruction complète du master source, zéro pixel recoloré, sans recadrage des plans.
- Fabrication reproductible : `node scripts/v091-extract-planes.mjs`, puis `node scripts/v091-build-layers.mjs`. Budget total du master compressé et des trois plans : **2 109 228 octets**. Les plans WebP sont encodés sans perte.
- Plans activés uniquement après réception d’une mesure valide sur mobile portrait et décodage réussi des trois images. L’écoute est passive : aucune méthode de permission n’est appelée. Une API `requestPermission` peut exister alors que des mesures sont déjà accessibles ; sa seule présence ne désactive plus l’effet. Si le navigateur retient les mesures en attendant une permission, le décor reste fixe. Desktop, paysage, reduced-motion et capteur absent ne chargent pas les plans. Une image indisponible conserve le rendu statique. Un sous-fond flouté avec marge remplit les petites zones découvertes par la translation sans doubler les contours nets.
- Test d’assets : vérification de **tous les pixels** des exports WebP, dimensions communes, un propriétaire alpha par pixel, RGB identique au master et budget respecté. Ce test complète les vérifications par échantillonnage du pipeline.
- Comparaison de la nouvelle adaptation : `artwork/v091/review/comparison.html`. Les anciennes captures du château sont conservées ; les nouvelles captures portent le préfixe `shared-`.
- Vérifications de cette adaptation : lint/TypeScript et build réussis ; **231 tests unitaires** réussis ; **66 tests Playwright accueil/menu** réussis, y compris décodage des plans, capteurs absents/permission requise, image indisponible, titre immobile, masquage/reprise, reduced-motion, desktop et paysage sans chargement des plans. Captures visuellement vérifiées aux cinq tailles demandées et en inclinaison simulée. Suite E2E complète et Docker vérifiés dans la CI du dernier commit de la PR.
- Synchronisation responsive : les tests attendent l’abonnement effectif au capteur après un redimensionnement avant d’envoyer une lecture synthétique. La CI a révélé une course sur le retour desktop → portrait ; les assertions sont conservées et renforcées pour vérifier le désabonnement. Les 8 scénarios de capteurs ont été rejoués 5 fois chacun, **40/40 réussis**, y compris mesures déjà disponibles avec API de permission exposée mais jamais appelée.

**Fidélité : adaptation de la base restaurée acceptée, pas identité pixel à pixel avec la maquette.** Les zones cachées par l’interface et l’extension desktop ont été reconstruites. La validation visuelle finale et la publication restent du ressort de l’utilisateur. Vérifier la CI du dernier commit de la PR 30.

### État antérieur conservé pour contexte (remplacé par la décision ci-dessus)

- Branche/PR existantes reprises sans réinitialisation. Aucun changement métier, aucune fusion, release ou publication de `latest`.
- [Comparaison desktop/mobile](../artwork/v091/review/comparison.html), maquette originale et captures conservées dans `artwork/v091/review/`. Captures supplémentaires 360×640, 430×932 et 2048×1042 produites par les tests existants (artefact CI `browser-report`).
- [Restauration proposée et provenance](../artwork/v091/review/README.md) : image propre obtenue via imagegen, **non identique et non approuvée**. Elle n’est pas utilisée dans l’application. Le master strictement fidèle et les plans alpha restent bloqués ; aucune activation du décor multi-plans.
- Footer compact : copie binaire du logo DK fourni (`public/art/dk-original.png`), sans filtre ni redessin.
- Capteurs : repli statique explicite si API absente ou si `requestPermission` est exposée ; jamais d’appel à cette méthode. Ce choix conservateur peut aussi laisser statique un navigateur déjà autorisé qui expose cette API. Tests supplémentaires : permission requise, API absente, page masquée, reprise à zéro et stabilité du titre. Les scénarios positifs simulent explicitement un navigateur sans demande de permission.
- Vérifications locales : lint et TypeScript réussis ; 230 tests unitaires réussis ; build de production réussi. Playwright complet : 161/164 au premier parcours, puis 3/3 échecs rejoués avec succès après correction de la simulation des capteurs et utilisation de `APP_ORIGIN=http://localhost:3000` comme attendue par le test SMTP. Aucune assertion supprimée. Les restrictions Windows sur les fichiers temporaires/jonctions et les serveurs locaux ont nécessité une exécution hors bac à sable.
- Docker n’est pas installé sur cette machine : sa validation est effectuée par le job Docker de la PR. La CI précédente (`7e3b132`) était entièrement verte, Docker compris ; vérifier la nouvelle CI du dernier commit avant toute validation.

**Recette visuelle : non acquise.** Le château/vallee du fallback, le header séparé, l’opacité du compteur et la compacité des descriptions mobiles diffèrent encore de la maquette. Les tests de structure et les captures ne prouvent pas une fidélité graphique. La livraison reste bloquée par le master original sans interface ou une décision explicite de l’utilisateur acceptant une nouvelle base.

## Référence esthétique

La maquette approuvée du 13 octobre 2026 (desktop à gauche, mobile à droite, nom du fichier source dans la conversation : `interface_halloween_cinématique_desktop_et_mobile.png`) définit la composition et la DA. L’accord ultérieur sur la restauration et l’adaptation desktop de la version mobile définit désormais la base des assets.

Cette maquette montre :
- village intimiste de nuit et non un grand château dominant une vallée ;
- pleine lune et silhouette de clocher / château au loin sur la droite ;
- maisons à fenêtres chaudes, lanternes et chemin pavé humide ;
- citrouille lumineuse au **premier plan en bas à gauche** du desktop, arbres et branches cadrant la scène ;
- bleu nuit profond / violet fumé / orange ambre, aspect illustré cinématique **élégant**, jamais cartoon ;
- au centre : titre serif « Halloween Map », petit ornement citrouille, texte d’usage, compteur fumé quatre colonnes, boutons de connexion et inscription ;
- header contenant uniquement le logo et un bouton menu, bande de trois fonctionnalités **strictement informative** et footer discret créditant DomotiK Studio avec le vrai DK.

**Écart V0.9 identifié par l’utilisateur :** `public/art/halloween-village-v2.png` ne reproduit pas ce décor ; il représente un château de hauteur / une vallée. Ne PAS le déclarer équivalent à la maquette. Le décor doit être remplacé par des assets fidèles à la **scène validée**, sans reprendre les écritures, boutons, horloges ou cadres de la capture composite.

**Point de reprise des assets** : conserver un master propre du décor (sans UI intégrée), puis dériver plusieurs PNG/WebP/AVIF transparents du **même master et même cadrage**, sans régénérer chaque plan indépendamment. Ne pas recadrer arbitrairement ni modifier la position relative lune / maisons / citrouille / lumières. La capture composite ne constitue pas un master propre ; ne pas la découper naïvement avec son texte incrusté. Si le master propre n’est pas disponible, documenter explicitement ce blocage et laisser la PR en brouillon.

### Plan recommandé (4 plans maximum + voile)

1. **Ciel et brume lointaine** : fond opaque statique garantissant un rendu complet même sans JS.
2. **Village lointain / clocher / lune** : couche transparente ou intégrée au ciel selon le masque exact, amplitude mobile très réduite.
3. **Maisons proches / lampadaires / chemin** : couche alpha dérivée du master avec profondeur moyenne.
4. **Citrouille, branches et végétation des bords** : alpha avant-plan, déplacement le plus marqué.
5. **Voile de lisibilité** : un dégradé CSS statique neutre, pas d’asset sombre qui écrase l’illustration.

Toutes les couches partagent la **même géométrie et le même point de référence** (dimensions, `background-size: cover`, cadrage harmonisé desktop/mobile). Prévoir une légère marge d’overscan pour éviter les bords visibles aux inclinaisons extrêmes. Compression adaptée aux téléphones ; ne pas expédier 4 images 2–3 Mo chacune.

## Pipeline technique des images

Le script `node scripts/v091-build-layers.mjs` attend **quatre fichiers PNG** à placer dans `artwork/v091/` :

- `scene-mobile-desktop-master.png` : **décor uniquement**, sans éléments d'interface ; master restauré commun aux deux formats ;
- `plane-far.png` : découpe alpha du décor lointain exportée depuis ce **même fichier source** ;
- `plane-mid.png` : découpe alpha des bâtiments intermédiaires du même fichier ;
- `plane-near.png` : éléments de premier plan (citrouille/branches/lanternes) du même fichier.

Le script vérifie les dimensions, le caractère réellement transparent des trois plans, ainsi qu'un échantillon de leurs pixels colorés face au master. Il refuse un plan régénéré indépendamment, un plan opaque plein cadre ou une image trop petite. Il génère `public/art/home-v091-shared.webp` et les trois `home-v091-{far,mid,near}.webp` sans perte. Le test d’assets vérifie ensuite exhaustivement leur reconstruction.

`components/HomeAtmosphere.tsx` active les véritables plans transparents seulement après décodage réussi. Les copies d’image et les masques CSS temporaires sont supprimés. Le master commun reste le fallback ; aucune release n’est autorisée par cette intégration.

Le master restauré est présent dans le dépôt. L’utilisateur l’a accepté comme base avec adaptation de la version mobile au desktop. Le brouillon de PR reste soumis à la revue finale des captures.

## Parallaxe : règles non négociables

- **Desktop : 100 % statique** ; ni suivi souris, ni animation automatique du décor, ni abonnement aux capteurs.
- **Mobile portrait uniquement** ; orienter le téléphone provoque une parallaxe **quasi imperceptible** (ordre de grandeur : ciel 0, lointain 2–3 px, moyen 4–6 px, premier plan 6–9 px). Aucun effet sur le titre, le compteur, les CTAs, le header ni le footer.
- Utiliser `deviceorientation` si l’accès est **déjà accordé** et si des valeurs numériques exploitables sont reçues. Normaliser/borner gamma et beta, filtrer/assouplir le mouvement, limiter le taux de rafraîchissement à `requestAnimationFrame`.
- **Aucune invite, aucun bouton et aucune demande de permission** pour cet effet décoratif. En particulier, **ne pas appeler `DeviceOrientationEvent.requestPermission()` automatiquement** (sur iOS, un geste est nécessaire). Si l’accès exige une permission, le décor reste fixe.
- Si capteur absent, données invalides, orientation inaccessible, page masquée, mobile paysage ou `prefers-reduced-motion: reduce`, **rendu parfaitement fixe** ; aucun crash, warning récurrent ou retry polluant.
- Éviter la collecte et la transmission de données d’orientation ; aucune persistance, télémétrie ou géolocalisation supplémentaire.
- Accessibilité : décor `aria-hidden`, `pointer-events:none`, pas de décalage du texte.
- Les transitions d’une orientation mobile à desktop doivent remettre toutes les translations à zéro et **désabonner les capteurs**.
- Le fallback sans JS ou capteurs reste aussi beau que la version animée.

## Périmètre et non-régressions

- **V0.9.1 uniquement** : composant décoratif de l’accueil, styles associés, images du décor, tests et document de conception. Pas de changement au moteur de saison, auth, permissions, compte à rebours synchronisé serveur, carte, collecte, itinéraires, backend ou migrations.
- Première visite : Se connecter / Créer un compte restent accessibles immédiatement.
- Saisons TEST/réelle, ouverte/fermée/à venir : comportements inchangés.
- L’accueil mobile tient dans un écran aux tailles usuelles ; la bande informative peut être supprimée en hauteur contrainte mais pas le footer ni les CTA.
- **N’interpréter en aucun cas Halloween Map comme organisateur** d’événement, rassemblement ou itinéraire. La carte référence les maisons participantes et la collecte se gère individuellement.
- **La boussole / demande d’autorisation pour l’orientation GPS de la CARTE** est un futur chantier DISTINCT, pas cette PR.
- La future uniformisation globale de la DA et les icônes PWA / favicon relèvent d’une autre version, sauf correction bloquante.

## Critères de recette

- Comparaisons visuelles réelles côte à côte avec la maquette originale, dans son cadrage desktop et mobile. Refuser un autre paysage si le master fidèle n’est pas disponible.
- Dimensions : 360×640, 390×844, 430×932, 1440×900 et 2048×1042 ; mobile sans scroll document si possible ; sans overflow, CTA et mentions visibles.
- Tests mobile : simulation de l’événement avec valeurs numériques -> variables / translations bornées ; simulation absence/NaN -> pas d’effet ; reduced-motion -> zéro ; desktop -> zéro et aucun listener ; page masquée -> pause ; orientation paysage -> pas d’effet.
- Tests de non-régression de la home V0.9 (header unique, footer DK, 3 descriptions non interactives, login/signup, décompte / états TEST/REAL).
- CI complète : lint, TypeScript, unitaires, tests E2E, build et Docker ; inspection responsive et performance, vérification du poids total des images.
- **Aucune release, aucun merge, aucune image `latest` tant que la fidélité visuelle n’est pas démontrée et validée.** L’utilisateur reprend la branche/PR depuis chez lui ; Dockhand reste intact.

## État technique

- [x] master décor propre restauré accepté comme base / intégré, commun aux deux formats
- [x] couches alpha générées à partir du même master, dimensions et pixels vérifiés
- [x] parallaxe mobile progressive (sans pop-up), fallback stable
- [x] captures desktop / mobile comparées, base restaurée acceptée
- [x] tests, CI et revue visuelle automatisée ; CI #168 verte
- [x] publication désormais autorisée expressément par l’utilisateur le 13 octobre 2026, avec essais téléphone effectués par lui après la release V0.9.3

Cette dernière instruction remplace l’interdiction de publication en attente de recette, sans prétendre que la recette sur téléphone réel a déjà été effectuée. Les PR #30, #31 et #32 restent intégrées séparément et dans l’ordre.
