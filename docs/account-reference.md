# Mon compte — refonte contextuelle

Référence : planche UX « Mon compte » fournie le 6 octobre 2026.
Base : `main` actuel, commit `01f4244` (VERSION V0.5.5). Les corrections postérieures à la baseline fonctionnelle V0.5.3 sont conservées. Aucun changement de modèle, de migration ou de cascade de suppression.

## Fichiers principaux

- `components/AccountOverlay.tsx` et `.css` : identité, liste mobile, formulaires desktop, sous-vues, confidentialité, confirmation et animations.
- `components/Account.tsx` : conserve inscription et activation ; réexporte la nouvelle vue.
- `components/Application.tsx` : ouverture contextuelle depuis les liens internes de compte, conservation des composants actifs, blocage du défilement du fond et restitution du focus.
- `components/PremiumHome.tsx`, `components/InstallApp.tsx`, `app/globals.css` : groupe Mon compte / Ajouter l’application / Se déconnecter et présentation PWA dans le compte.
- `components/useDialogFocus.ts` : le focus clavier vise le dernier dialogue actif hors du fond rendu inerte.
- `e2e/account-context.spec.ts`, `playwright.account.config.ts` : contrôles limités aux dépendances directes de la vue.

## Fonctions existantes réutilisées et opérationnelles

- `GET me` : nom, email, rôle et vérification du compte.
- `POST account`, actions `name`, `email`, `password`, `resend`, `delete` : API existante, validations, vérification du mot de passe actuel, rotation des sessions et emails de service inchangés.
- Le formulaire identité envoie uniquement les actions correspondant aux champs modifiés. Le changement d’email fait apparaître le mot de passe actuel et exige une nouvelle vérification. Les deux actions restent distinctes : si le nom est enregistré et que le changement d’email échoue, le retour l’indique explicitement.
- Sécurité : confirmation du nouveau mot de passe côté interface, minimum de 12 caractères, affichage/masquage et retour d’erreur ou de succès. Aucun mot de passe n’est placé dans du stockage local.
- Suppression : sous-vue de confirmation unique, mot de passe actuel, phrase `SUPPRIMER MON COMPTE`, case de compréhension et annulation. La suppression appelle le mécanisme existant, y compris sa protection du dernier Super Admin et ses relations utilisateurs/participations/sessions/communications. Aucune nouvelle cascade.
- `POST logout` : logique d’authentification et retour à l’accueil existants.
- `InstallAppProvider` : offre native à usage unique, aide iOS intégrée, masquage en standalone/après installation et absence d’action inactive sur navigateur non compatible.
- `GET house`, `public.contents[privacy.account]`, `public.season.purge_at`, `public.documents.PRIVACY` : confidentialité dans une sous-vue, données réelles de la maison et politique consultable sans quitter le contexte.
- Les retours `/account?created=1` et `/account?link=…` conservent leurs messages de création et de lien invalide.

## Navigation et composition

L’ouverture normale depuis un lien interne `/account` ne change pas la route : la page active reste montée et devient inerte. La carte, les filtres, le parcours courant, les formulaires et le défilement de la page restent en place. La fermeture dure 200 ms et remet le focus sur le déclencheur, ou le menu utilisateur si le déclencheur du tiroir a disparu. Échap, croix et clic sur le fond desktop ferment la vue.

Une arrivée directe sur `/account` ou un lien ouvert dans un nouvel onglet n’a pas de contexte précédent monté : l’accueil sert de fond. Le visiteur non connecté conserve l’interface d’authentification. Les clics avec touches modificatrices gardent le comportement normal des liens.

Mobile (<768 px) : hauteur dynamique bornée à 100dvh, safe areas, aucun défilement global ; seuls le contenu interne et les sous-vues peuvent défiler sur un petit écran ou avec le clavier. Desktop/tablette : largeur maximale 980 px, hauteur maximale 85dvh, deux colonnes et défilement interne si nécessaire. Les animations respectent `prefers-reduced-motion`.

Le bloc de gestion « Ma participation » a été retiré du compte et conserve son entrée indépendante. Les données de maison restent uniquement dans le détail confidentialité.

## UI prête et données à exposer plus tard

Aucune action de cette refonte ne reste à brancher : toutes les fonctions demandées sont déjà prises en charge par l’API existante. Les points de raccordement suivants restent centralisés, sans valeur inventée :

- Purge : `public.season.purge_at` et `public.instance.timezone`. En l’absence de saison, la vue indique que la date sera affichée dès sa configuration ; la configuration de saison existante l’alimente automatiquement.
- Explications de conservation : contenu administrable `privacy.account` et document légal `PRIVACY`. L’exploitant devra finaliser dans ces contenus son identité, son contact, la durée de conservation des comptes inactifs et les modalités d’exercice des droits. Aucun délai métier nouveau n’a été fixé.
- Maison/adresse/coordonnées : endpoint `house`, limité à la saison active. La purge et les règles actuelles restent la source de vérité.
- Parcours : la version actuelle garde le parcours dans la vue carte et un total anonyme serveur ; aucun historique personnel n’existe. Si le modèle évolue, la ligne Parcours de la sous-vue Privacy devra être raccordée à une source utilisateur authentifiée. Aucun écran de gestion d’un historique fictif.

## Vérification ciblée

- Compilation de production et TypeScript : OK.
- ESLint sur les composants modifiés et les contrôles ciblés : OK ; diff sans erreur d’espacement.
- 12 contrôles navigateur : mobile 360/390 px, tablette 820 px, desktop 1440 px, ouverture/fermeture, focus, conservation de la carte et du parcours, identité/email, vérification, mot de passe, confidentialité, confirmation de suppression, déconnexion, PWA native/iOS/standalone, mouvement réduit et entrée directe.
- 2 contrôles métier existants : changement d’email protégé et suppression volontaire du compte avec ses données associées.

Les contrôles d’interface utilisent des réponses API de test. Les deux contrôles métier utilisent la base isolée de tests ; aucune suppression de compte réel ni installation réelle n’a été effectuée. Captures réalisées avec une identité fictive.
