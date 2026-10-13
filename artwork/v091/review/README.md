# V0.9.1 — revue graphique, 13 octobre 2026

**Ces fichiers ne sont pas des assets approuvés de production.**

- `approved-mockup.png` : copie intacte de la maquette fournie par l’utilisateur.
- `restoration-candidate.png` : proposition de restauration sans interface, produite avec l’outil intégré imagegen. Aucun usage dans le CSS, aucune activation des plans.

La proposition retrouve le village, la lune à droite, les lanternes, les branches et la citrouille à gauche. Elle n’est **pas identique** : architecture et fenêtres redessinées, position/proportions du clocher et de la lune modifiées, chemin et premier plan reconstruits. Les zones cachées par les éléments d’interface ne peuvent pas être récupérées à l’identique depuis la capture seule.

L’exigence stricte reste applicable. Il faut le décor original sans interface, ou une décision explicite de l’utilisateur approuvant une nouvelle base. Aucun découpage alpha n’est livré à partir de cette proposition tant que cette décision manque. La PR reste en brouillon ; V0.9, les releases et `latest` ne sont pas remplacés.

## Prompt utilisé (outil intégré, aucun appel API séparé)

> Edit target: supplied approved Halloween Map composite mockup. Produce ONLY the clean landscape illustration occupying the LEFT desktop panel from approximately x32,y71 to x982,y821 in source. Remove all interface text, title, pumpkin divider, header logo, menu circle, countdown panel and buttons by restoring the obscured scenery. Exclude footer, feature strip, phone and outer mockup surround. Precise-object-edit restoration, NOT a new interpretation: preserve EXACT same framing, left timber house and warm windows, top branches, moon upper right with same church silhouette, right houses, large glowing pumpkin bottom LEFT, iron railings, lantern at right edge, wet cobbled path, exact navy/violet/amber lighting and proportions. Do not invent a different village, valley or castle. Output clean 1280x1024-ish landscape master scene, no UI, no writing, no frames. Preserve visible original scene as closely as possible; only reconstruct areas occluded by UI.

Le prompt exprime la cible ; il ne constitue pas une preuve que le résultat la respecte.

## Logo

`public/art/dk-original.png` est une copie binaire du fichier `E:/DomotiK/emoji.png` fourni par l’utilisateur. SHA-256 : `50ee22b0d8a1c4886523d2bb975752b37f0d8ef6437a5468eff86f5bc62d8503`. Aucun redessin ni filtre colorimétrique. Usage limité au footer compact de l’accueil.
