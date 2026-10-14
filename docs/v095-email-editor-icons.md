# V0.9.5 — Editor d'emails et identité d'application

Décision du 14/10/2026. Ce chantier part de V0.9.4 et ne modifie **aucune mise en page, illustration d'accueil, animation, carte, typographie ou style des pages publiques**. La PR #36 (suppression des doublons dans les fiches BO) est indépendante.

## Matrice des livrables

### Assets
- **Application/PWA** : image d'origine du propriétaire (citrouille orange en repère GPS, village et route nocturnes), sans substitution graphique ; générer 192/512, Android maskable safe-area, Apple 180.
- **Favicon** : image mini simplifiée approuvée (citrouille-repère centrée), puis 16px/32px/ico ; conserver une variante source haute résolution.
- `scripts/pwa-assets.mjs` génère actuellement tous les assets à partir du seul `public/favicon.svg`. **Découpler la source app de la source favicon** : ne pas régénérer une icône PWA complexe à partir du mini favicon.
- Mettre à jour les références `app/manifest.ts`/`app/layout.tsx` seulement si chemins changent. Cache/version des icônes et tests d'assets.
- Ne jamais engager une approximation manuelle sous le nom de l'image utilisateur ; fichiers sources à intégrer en binaire avant l'acceptation.

### Emails — prérequis critiques
- L'éditeur actuel `VisualEditor` sérialise un sous-ensemble Tiptap en mini Markdown, rejetant l'HTML (via `sanitizeContent`). Cela doit rester le **chemin de lecture et envoi legacy** tant que les six modèles et campagnes ne sont pas migrés.
- `lib/mail-layout.ts` impose un habillage et le bouton sûr du serveur ; le moteur V2 devra personnaliser toute la structure et **valider que les actions de compte obligatoires sont présentes**, sans accepter une URL de vérification choisie par l'administrateur.
- Format recommandé V2 : `html_body` (source HTML nettoyé) distinct de `body` legacy ; texte brut généré, conservation du HTML exact et import protégé. Ne **jamais** transformer un HTML importé non représentable en Tiptap en perdant des tableaux/éléments : l'éditeur doit proposer « conserver HTML » ou une copie.
- Sécurité indispensable **côté serveur** : analyse/sanitization par parseur HTML robuste en liste blanche, pas une regex ; rejet des scripts, événements `on*`, SVG, CSS dangereux, data/javascript/vbscript, ressources distantes non-HTTPS ; interpolation contextualisée après échappement, CSS email inline / responsive compatibles.
- Liens d'action transactionnels : ancre réservée générée par le serveur (`{{secure_action_url}}` uniquement utilisable dans un `href` validé ou bloc bouton serveur); présence vérifiée pour VERIFY/INVITE/RESET. Ne jamais exposer de token réel au client ou dans l'aperçu.
- Images : ajout, remplacement, redimensionnement, alignement, suppression, alt et liens ; bibliothèque upload contrôlée par RBAC, MIME, taille, dimensions, quotas, stockage pérenne et URLs HTTPS publiques. Ne pas utiliser de blob:/data: envoyé par mail.
- Toolbar **par boutons** façon traitement de texte (sans menus Fichier/Édition), titres, police/taille, gras, italique, souligné, listes, alignements, couleurs, tableaux, liens, images, undo/redo, source HTML, aperçu desktop/mobile et envoi test.
- Evaluer TipTap et extensions image/table versus éditeurs HTML spécialisés (TinyMCE/CKEditor), compatibilités licence/self-hosted/bundle, accessibilité et aller-retour avant choix.
- Les six emails et les campagnes partagent le composant, mais l'historique des communications et l'outbox ne doivent pas changer silencieusement.

### Séquence de développement
1. Contract de stockage additive et tests de rétrocompatibilité.
2. Choix de l'éditeur et du sanitizer, prototype UX testable avec prévisualisation sans effet sur les emails envoyés.
3. Images persistantes sécurisées, source HTML validée / plain text, migration et API V2.
4. Intégration de tous les modèles + campagnes, conformité et email tests.
5. Assets exacts, PWA/favicons, tests manifest et cache ; CI complète / sortie de draft / release.

## Garde-fous
Aucun `dangerouslySetInnerHTML` d'une valeur non nettoyée, pas de scripts dans les emails, pas de modification du front public autre qu'icônes. Aucun merge / release avant QA. Version principale reste V0.9.4 pendant le chantier.
