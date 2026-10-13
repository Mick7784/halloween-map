# V0.9.1 — revue graphique, 13 octobre 2026

**Base restaurée acceptée par l’utilisateur ; publication encore soumise à validation.**

- `approved-mockup.png` : copie intacte de la maquette fournie par l’utilisateur.
- `restoration-candidate.png` : première proposition de restauration sans interface, produite avec l’outil intégré imagegen ; conservée comme référence de la décision utilisateur.
- `../scene-mobile-desktop-master.png` : adaptation commune, restaurée depuis le mobile de la maquette et élargie pour desktop à la demande de l’utilisateur. Utilisée dans l’application via `public/art/home-v091-shared.webp`.
- `shared-desktop.png`, `shared-mobile.png` et `shared-tilt-mobile.png` : captures réelles de la nouvelle adaptation. `current-*.png` conserve l’état précédent avec le château.

La proposition retrouve le village, la lune à droite, les lanternes, les branches et la citrouille à gauche. Elle n’est **pas identique** : architecture et fenêtres redessinées, position/proportions du clocher et de la lune modifiées, chemin et premier plan reconstruits. Les zones cachées par les éléments d’interface ne peuvent pas être récupérées à l’identique depuis la capture seule.

L’utilisateur a répondu **« Accepter cette restauration comme base »**, puis demandé **la même version mobile sur desktop**, avec adaptation du visuel au format large. Le blocage sur le master original est donc levé. La restauration reste une adaptation, sans déclaration d’identité avec la maquette. La PR reste en brouillon ; aucune fusion, release ou modification de `latest`.

## Master commun et plans transparents

Master 1536×1024, SHA-256 `a6d6ce3a900c28e8e2f4ff83b98f06fb9cfaf34dad9747a6b5a88b115921f2bb`.

La découpe imagegen du premier plan (`../near-mask-source.png`) a modifié 51,96 % des pixels opaques échantillonnés au-delà de la tolérance. **Son RGB n’est jamais utilisé.** Seul son alpha fournit un masque ; les couleurs proviennent intégralement du master. Le plan intermédiaire est délimité par `../mid-mask.svg`. Les masques partagent le canvas original, sont exclusifs, et le plan lointain couvre le reste. Les trois exports transparents reconstruisent ainsi tous les pixels du master source au repos. Le sous-fond flouté remplit seulement les petites découvertes lors de l’inclinaison.

Reproduction : `node scripts/v091-extract-planes.mjs` puis `node scripts/v091-build-layers.mjs`. Vérification exhaustive dans `tests/home-atmosphere-assets.test.ts`. Taille des assets diffusés : 2 109 228 octets (master statique 253 612 octets ; plans chargés seulement sur mobile portrait avec une mesure valide).

## Prompt du master commun (outil intégré imagegen)

> Use case: precise-object-edit / outpainting. Source is approved composite mockup. The user specifically requests SAME MOBILE VERSION ON DESKTOP. Treat ONLY the background inside the RIGHT phone as the canonical scene (not the landscape on the left). Extract and restore that nocturnal village background without any interface and extend it horizontally to a landscape desktop master. Reconstruct obscured scenery only as necessary. Keep the mobile scene's violet/pink moon above-right behind the slender church spires, dark silhouetted left rooftops, overhanging copper/brown branches, narrow intimate village street, warm amber lantern at left, warm windows along both sides, midnight navy and smoky purple shadows. Extend the same village on both sides for desktop, naturally include wet cobbled path foreground, railings and a modest glowing pumpkin at left edge. No hilltop castle, no valley panorama, no new scene, no daylight. Central portrait crop must retain the moon, church and both warmly lit sides of street. Upper half sky and distant silhouettes, moon near 60% width and 18% height, church beneath. Keep central area dark/quiet for overlay UI. Produce a SINGLE continuous clean 1536x1024 landscape image. Absolutely no text, logo, icons, title, countdown, buttons, phone frame, panels or UI. This is the same mobile village widened, not a new creative interpretation.

## Prompt de la première proposition conservée

> Edit target: supplied approved Halloween Map composite mockup. Produce ONLY the clean landscape illustration occupying the LEFT desktop panel from approximately x32,y71 to x982,y821 in source. Remove all interface text, title, pumpkin divider, header logo, menu circle, countdown panel and buttons by restoring the obscured scenery. Exclude footer, feature strip, phone and outer mockup surround. Precise-object-edit restoration, NOT a new interpretation: preserve EXACT same framing, left timber house and warm windows, top branches, moon upper right with same church silhouette, right houses, large glowing pumpkin bottom LEFT, iron railings, lantern at right edge, wet cobbled path, exact navy/violet/amber lighting and proportions. Do not invent a different village, valley or castle. Output clean 1280x1024-ish landscape master scene, no UI, no writing, no frames. Preserve visible original scene as closely as possible; only reconstruct areas occluded by UI.

Le prompt exprime la cible ; il ne constitue pas une preuve que le résultat la respecte.

## Logo

`public/art/dk-original.png` est une copie binaire du fichier `E:/DomotiK/emoji.png` fourni par l’utilisateur. SHA-256 : `50ee22b0d8a1c4886523d2bb975752b37f0d8ef6437a5468eff86f5bc62d8503`. Aucun redessin ni filtre colorimétrique. Usage limité au footer compact de l’accueil.
