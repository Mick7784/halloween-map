# Mon compte — finitions et confidentialité

Historique de la V0.5.6. Pour le parcours de politique désormais intégré au compte et les paramètres supplémentaires, voir [le lot de corrections ciblées](targeted-menu-privacy-home.md).

Passe ciblée réalisée depuis `75476a5`, sur `codex/account-context`. La composition principale mobile/desktop et la logique destructive sont conservées.

## Fichiers modifiés

- `components/AccountOverlay.tsx` : statut vérifié vert fondé sur `email_status`, déconnexion neutre, sous-vue confidentialité, retour animé et accès au workflow de suppression existant.
- `components/AccountOverlay.css` : finitions du badge, hiérarchie déconnexion/suppression, cartes de données compactes, purge et liens de confidentialité. Les accents de la carte de suppression sont rouges, y compris le sous-libellé et le survol.
- `components/AccountPrivacy.tsx` : vue dédiée dans la même modal, données réellement disponibles, détails de participation dépliables, liens politique/contact et fallbacks.
- `lib/privacy.ts`, `lib/service.ts`, `components/common.tsx` : contrat public limité aux informations de confidentialité destinées aux visiteurs ; aucune exposition de la configuration complète de l’instance.
- `e2e/account-context.spec.ts`, `tests/privacy.test.ts` : contrôles ciblés de navigation, données, PWA, liens et absence d’exposition de paramètres privés.

## Données disponibles et comportement

**Compte.** Nom d’affichage, email, rôle et état de vérification viennent de `GET /api/me`. Le badge vert apparaît uniquement pour `VERIFIED`. Les données d’authentification sont expliquées sans afficher mot de passe, empreinte ou autre information sensible.

**Participation.** `GET /api/house` fournit la maison de la saison active : nom, adresse, coordonnées, horaires, activités, description, informations pratiques, frayeur, visibilité, état d’accueil et disponibilité des bonbons. Les informations principales sont visibles immédiatement ; la description et les paramètres sont dépliables pour garder la vue compacte. Aucune copie supplémentaire ni nouvelle conservation n’est créée.

**Parcours.** Le parcours courant reste dans la carte montée derrière le compte. Le serveur conserve un total anonyme de parcours calculés par saison, sans historique personnel. L’interface explique ce comportement réel.

**Purge.** La date provient de `public.season.purge_at`, formatée avec `public.instance.timezone`. La source reste le calendrier de saison existant, déjà administrable. Aucune date fixe ni nouvelle règle de suppression n’est introduite.

**Politique.** La ligne ouvre la page existante `/privacy` dans un nouvel onglet, ou une URL HTTPS configurée. Le document juridique n’est plus recopié dans la modal et le contexte du compte reste ouvert.

**Contact.** Une adresse publique configurée produit un lien `mailto:` réel. Aucun destinataire n’est inventé et aucune adresse technique d’envoi n’est utilisée comme contact d’organisateur.

**Suppression.** L’accès placé en bas de Confidentialité utilise le même changement de sous-vue que l’accès principal. Confirmation, mot de passe, phrase obligatoire, compréhension et appel à l’API existante sont inchangés. Une seule modal reste montée.

**PWA.** Le provider et sa condition sont inchangés : action disponible uniquement avec une offre native ou une aide iOS, hors standalone et hors installation terminée. Les mêmes conditions s’appliquent au menu et au compte.

## Fallbacks explicites

- Aucune participation : message indiquant qu’aucune participation n’est enregistrée pour la saison active.
- Échec de lecture : erreur et action Réessayer ; les données absentes ne sont pas remplacées par des valeurs inventées.
- Date absente ou invalide : « Date non encore disponible », avec explication de la configuration attendue de la saison.
- Contact absent ou invalide : « Nous contacter » ouvre une explication « Coordonnées à venir » et un lien vers les mentions légales existantes. Aucun bouton d’envoi inactif.
- URL de politique absente, invalide ou non HTTPS : retour à `/privacy`.
- Texte administrable absent : explications courtes fondées sur les règles actuelles, sans fixer de délai de conservation des comptes inactifs.

## Points de raccordement du futur back-office

L’objet JSON existant `instances.config` peut fournir un sous-objet `privacy`, dont seuls ces champs sont publiés par `/api/public` dans `PublicState.privacy` :

| Champ | Usage |
| --- | --- |
| `intro` | Introduction courte de la vue |
| `accountRetention` | Explication de conservation du compte |
| `participationRetention` | Explication de conservation de la participation |
| `routeRetention` | Explication des statistiques anonymes de parcours |
| `contactEmail` | Adresse publique de l’organisateur |
| `policyUrl` | URL HTTPS facultative ; `/privacy` reste la valeur de repli |

`publicPrivacySettings` limite les textes à 600 caractères, filtre les clés publiées et vérifie les liens. Aucun secret, mot de passe SMTP ou paramètre privé ne peut être transmis par cette projection. Les valeurs sont rendues comme texte.

Il reste à exposer ces champs dans le futur formulaire de paramètres et à les sauvegarder dans `instances.config.privacy`, en conservant les autres clés JSON et en appliquant les validations côté serveur. Cette passe ne crée ni faux écran d’administration ni migration. Le contrat de lecture est déjà opérationnel si les valeurs sont présentes.

La purge continue à se régler via la saison existante. Les contenus juridiques continuent à se gérer dans le document `PRIVACY` et sa page actuelle. Les explications de la sous-vue constituent un résumé utilisateur distinct du document légal complet ; les règles de conservation effectives restent celles du service de saison et du modèle actuels. Aucun réglage de texte ne change le mécanisme de purge.

## Contrôles

- Compilation de production et TypeScript : OK.
- ESLint sur les fichiers modifiés et vérification du diff : OK.
- 15 contrôles navigateur limités au compte et à ses dépendances directes : ouverture/fermeture, focus, mobile/desktop, contexte carte/parcours, état vérifié/non vérifié, formulaires existants, PWA native/iOS/standalone, confidentialité, sources réelles, politique, contact, retour et suppression partagée.
- 3 contrôles unitaires sur la projection publique de configuration, les liens acceptés/rejetés et les valeurs absentes.
- Les contrôles Confidentialité ont été rejoués après le dernier ajustement de densité et les captures ont été vérifiées visuellement.

Les données des contrôles et captures sont fictives. Aucune suppression de compte réel, installation réelle ni envoi de message n’a été effectué.
