# V0.9.3 — étude et prototype d’orientation sur la carte

Branche distincte `work/v093-map-orientation-study`, préparée sur la V0.9.2 (#31). Le 13 octobre 2026, l’utilisateur a expressément demandé la publication en release et indiqué qu’il effectuerait lui-même les essais. Cette instruction autorise l’intégration ordonnée des PR #30/#31/#32 et la publication V0.9.3, image versionnée et latest. Elle ne constitue pas une validation sur téléphone réel.

## Résultat de l’étude

Le gyroscope décrit une rotation relative à un repère arbitraire ; il ne suffit pas à orienter une flèche par rapport à une carte. L’orientation absolue ajoute le magnétomètre, mais les événements standards n’exposent pas de précision de calibration. Le cap GPS de déplacement ne représente pas la direction dans laquelle le téléphone est tenu.

Sources primaires : [W3C — repères et permissions](https://www.w3.org/TR/orientation-event/#choice-of-reference-coordinate-system), [Apple — cap magnétique](https://developer.apple.com/documentation/webkitjs/deviceorientationevent/1804777-webkitcompassheading), [Apple — précision et absence de calibration](https://developer.apple.com/documentation/webkitjs/deviceorientationevent/1804769-webkitcompassaccuracy).

`webkitCompassHeading` indique le nord magnétique, pas une orientation géographique certifiée au nord vrai. La déclinaison magnétique et les perturbations locales restent possibles. La mention accessible est donc « Orientation magnétique approximative du téléphone ». Aucune précision géographique n’est promise.

## Choix conservateur du prototype

- Téléphone tactile, portrait, largeur maximale 767 px, contexte sécurisé et carte active uniquement. Desktop et paysage conservent le point GPS classique.
- Seul le cap WebKit avec précision finie de 0 à 20° est accepté. Une précision négative, inconnue ou supérieure à 20° est refusée. Les angles relatifs alpha/beta/gamma, les événements absolus sans estimation de précision et le cap GPS de déplacement ne sont jamais convertis en direction de carte.
- Posture modérée : |beta| ≤ 60°, |gamma| ≤ 35°. Trois mesures successives cohérentes sont nécessaires ; différence circulaire ≤ 25°, intervalle ≤ 1 s. Il s’agit de seuils de prototype, pas d’une certification du capteur.
- Mesure d’orientation périmée après 2,5 s ; point GPS précis à 50 m ou mieux et récent à 15 s requis. Une mesure invalide retire immédiatement la direction au prochain rafraîchissement.
- La flèche et le cône s’ajoutent au point existant. Le cône est une représentation conventionnelle de direction, pas un intervalle statistique de confiance.
- Aucune modification de caméra, centre, zoom, bearing, pitch, itinéraire, sélection de maisons ou logique de collecte. Si l’utilisateur tourne manuellement la carte avec les gestes existants, seul le dessin du marqueur compense le bearing.
- Rafraîchissement maximum 10 fois/s, aucune animation CSS ni boucle requestAnimationFrame. Lecture et minuterie arrêtées hors carte active, en arrière-plan, en paysage et sous une fenêtre modale. Chaque reprise demande de nouvelles mesures.

## Autorisation facultative

Les lectures déjà accessibles sont écoutées passivement. L’existence de requestPermission ne prouve pas qu’une autorisation manque ; aucun appel automatique n’est effectué.

Si cette méthode existe et qu’aucun cap utilisable n’arrive, un bouton discret propose « Afficher l’orientation », seulement après obtention d’une position GPS récente. L’explication ne s’ouvre que sur action volontaire. Fermer, Échap, cliquer en dehors ou refuser conserve le marqueur GPS. « Autoriser les capteurs » appelle requestPermission(true) directement depuis le clic. Un refus, une erreur ou une réponse accordée arrivée après fermeture ne réactive rien.

Seul le choix accordé/refusé est enregistré localement, sans compte, coordonnées ni mesure. L’explication ne se répète pas dans ce navigateur tant que cette préférence demeure. Si le stockage est bloqué, le choix reste en mémoire pour la durée de la page ; une persistance au-delà du rechargement n’est pas garantie. Une autorisation enregistrée ne déclenche pas de nouvelle demande automatique : si le navigateur bloque de nouveau les lectures, le point GPS reste classique.

## Limites et recette avant intégration

Le prototype accepte principalement les navigateurs WebKit exposant une précision de compas. Les flux Android standards, même absolus, restent sans flèche tant qu’une qualification fiable de leur mesure n’est pas disponible. Ce fallback est volontaire ; une simple rotation de gyroscope ne doit pas donner une illusion de cap fiable.

À valider sur appareils physiques en HTTPS : Safari iOS et PWA installée, refus/acceptation/rechargement, cap près du nord et lors d’une rotation, perturbations métalliques, posture, changement d’orientation d’écran et visibilité. Vérifier aussi le fallback Chrome Android avec et sans magnétomètre. Ces essais ne sont pas remplacés par les événements simulés de Playwright.

Les tests automatisés couvrent les limites numériques, le passage 359°/0°, la cohérence et l’expiration, le refus mémorisé, la réponse tardive après fermeture, les reprises et la carte fixe. Les captures utilisent un fond cartographique fictif comprenant une forme asymétrique pour vérifier la stabilité de la caméra.

Halloween Map reste une cartographie et un outil individuel : aucune destination, consigne de déplacement, rotation automatique, guidage ou rassemblement n’est ajouté. La parallaxe d’accueil reste indépendante et inchangée.
