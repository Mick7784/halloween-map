# Patch accueil, menus et prise de connaissance

## Modifications

- L’accueil desktop utilise une seule illustration panoramique issue du fond mobile : village, lune, chat, portail et lanterne. Le titre, compteur, nombre de maisons, texte et CTA restent centrés. Les superpositions de fragments ont été retirées.
- Menus plus compacts, groupes et grille icône/texte/action conservés. Le mobile conserve l’ouverture en slide et son défilement interne.
- Les liens légaux sont dans les footers et restent accessibles depuis leurs vues dédiées. Le footer général mobile est rendu compact et visible pour donner accès au soutien et aux textes ; les métadonnées secondaires y sont masquées.
- « Signaler un bug » ouvre un email à `domotikpro77@gmail.com`, avec version et canevas de description du problème. Le code n’envoie aucun email automatiquement.
- « Soutenir le projet » reste une action secondaire du footer. Sans URL de soutien, une fenêtre explique son indisponibilité et permet de proposer son soutien par email. Aucun paiement n’est simulé.
- Une seule case : « J’ai pris connaissance des bonnes pratiques ». Les mots « bonnes pratiques » ouvrent une fenêtre compacte ; la consultation ne coche pas automatiquement la case. Le CTA et le serveur exigent sa validation.

## Sources et futurs réglages

`instances.config.projectLinks` accepte `bugEmail`, `bugUrl` et `supportUrl`. Les URLs doivent être HTTPS sans identifiants intégrés. Seuls ces champs publics sont exposés par `/api/public`. L’email public existant `config.privacy.contactEmail` est réutilisé en repli, puis l’adresse fournie pour ce lot. Les mêmes réglages alimentent l’accueil et la navigation générale.

Les bonnes pratiques utilisent le document GUIDELINES publié dans `legal_documents` et exposé par `/api/public.documents`. Le fallback central existant est `lib/legal-defaults.ts`. L’interface d’administration de documents existante permet déjà de faire évoluer ce contenu : aucun second stockage et aucun back-office supplémentaire n’ont été créés.

Le nouveau contrat d’enregistrement est `{ mode: "GUIDELINES_ONLY", guidelines: true, guidelines_version }`. Le serveur contrôle la version publiée et conserve `guidelines_accepted_at`. Il ne marque pas les conditions comme acceptées : `terms_accepted_at` reste nul. `terms_version` conserve seulement la version actuelle pour compatibilité avec les contrôles de visibilité existants. L’ancien contrat à deux acceptations reste compatible pour le formulaire administrateur et les anciens clients. Aucune migration de consentement historique n’est effectuée.

## Illustration desktop

Adaptation avec l’outil intégré imagegen, depuis `public/art/home-reference-v2.webp`. Asset consommé : `public/art/home-reference-desktop-v1.webp` (WebP). Le fond mobile existant est conservé.

Prompt utilisé :

> Edit target: the supplied portrait Halloween background. Adapt only its framing into a seamless landscape panorama, aspect ratio 16:10, for the desktop version of the SAME existing website. Preserve the exact elegant painted photographic style, dark purple fog, warm orange lights, single orange moon, original French Gothic village and arched bridge in the upper band. Preserve the original black cat seated on the left stone gatepost and warm lantern on the right post, ornate iron gate and pumpkins along the lower band. Extend the scenery horizontally on both sides, not a collage, no inset, no repeated strips, no duplicated moon or cat. Important: maintain a large uninterrupted calm dark fog area in the CENTRAL middle 50 percent of the image, for centered website title/countdown/button which are NOT part of this image. The village and moon remain across the TOP quarter and gate/cat/lantern across the BOTTOM quarter, all visible in the landscape composition. Do not zoom in or crop away these defining subjects. No text, no logo, no UI, no watermark. Do not change the mobile reference; output only the expanded landscape asset.

## Contrôles ciblés

Build, TypeScript et lint ; accueil et menus mobile/desktop ; absence de liens légaux dans les menus ; PWA native et iOS/standalone ; mailto et soutien configuré/non configuré ; fenêtre de bonnes pratiques ; case obligatoire ; validation serveur de la version et absence d’acceptation fictive des conditions. Aucune publication pour ce lot.
