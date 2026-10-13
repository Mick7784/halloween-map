# Halloween Map — V0.9.1 : décor fidèle, profondeur et parallaxe mobile

> **Statut : chantier en cours / PR en brouillon. Ne pas fusionner ni publier sans revue des captures et CI complète.**
>
> Base : `main` / release V0.9 validée. Mission strictement visuelle, **uniquement sur la page d’accueil**.

## Référence esthétique OBLIGATOIRE

La maquette approuvée du 13 octobre 2026 (desktop à gauche, mobile à droite, nom du fichier source dans la conversation : `interface_halloween_cinématique_desktop_et_mobile.png`) **fait foi**.

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

- [ ] master décor propre **identique** à la maquette obtenu / intégré
- [ ] couches alpha générées à partir du même master, dimensions vérifiées
- [ ] parallaxe mobile progressive (sans pop-up), fallback stable
- [ ] capture desktop / mobile rapprochée des références
- [ ] tests, CI et revue visuelle
- [ ] approbation utilisateur puis publication séparée
