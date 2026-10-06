# Corrections ciblées après V0.5.6

Le lot conserve les écrans et droits validés. La version publiée reste V0.5.6 ; ce commit local prépare les corrections suivantes sans publier une nouvelle release.

## Parcours et présentation

- Le menu de l’accueil conserve ses groupes et permissions. Sur desktop, le panneau adopte une hauteur liée à son contenu et des lignes compactes. Les lignes Mon compte, Ajouter l’application et Se déconnecter partagent la même grille sur mobile et desktop. Le menu hors accueil reçoit également cette grille.
- Le provider PWA existant est conservé : offre native ou aide iOS, ligne masquée après installation ou en standalone.
- Mon compte → Confidentialité et données → Politique de confidentialité change seulement le contenu de la modal. La flèche revient aux données, puis au compte. La fermeture restaure le contexte d’origine existant.
- La politique utilise le renderer Markdown limité existant, sans injection HTML, avec une largeur de lecture et des paragraphes aérés. Les textes juridiques par défaut sont partagés dans `lib/legal-defaults.ts`, sans importer les dépendances serveur côté client.
- L’accueil desktop centre le bloc principal et le compteur. Le visuel mobile existant est réutilisé : ville/château/lune en haut, respiration centrale, chat et portail en bas. Le cadrage utilise des couches CSS proportionnées, sans nouveau visuel.

## Paramètres du futur back-office

La projection publique de `instances.config.privacy` accepte les paramètres ci-dessous. Aucun écran d’administration supplémentaire n’est créé.

| Paramètre | Usage / repli |
| --- | --- |
| `policyBody` | Texte Markdown complet facultatif, limité à 30 000 caractères. Priorité : ce paramètre → document `PublicState.documents.PRIVACY.body` → texte juridique partagé actuel. |
| `policyUrl` | URL HTTPS facultative de référence conservée dans le contrat public. Elle ne déclenche aucune navigation depuis le compte et n’est pas téléchargée automatiquement. |
| `contactEmail` | Email public validé ; déclenche un `mailto:`. Sans valeur valide : Coordonnées à venir, explication et mentions légales existantes. |
| `contactSubject` | Objet facultatif, limité à 160 caractères, retours à la ligne retirés et valeur encodée dans le lien. Repli : Halloween Map — Contact. |
| `intro` | Introduction de Confidentialité et données. |
| `accountRetention`, `participationRetention`, `routeRetention` | Explications de conservation existantes, limitées à 600 caractères. Aucun changement du mécanisme de purge. |

Le document juridique PRIVACY est déjà transmis par `/api/public` et géré par le mécanisme existant des documents : brouillon, publication et version. Les mises à jour de ce document apparaissent dans le compte dès le prochain chargement des données publiques. Pour un paramétrage dédié futur, enregistrer les clés ci-dessus dans `instances.config.privacy`, conserver les autres clés JSON et appliquer les mêmes validations côté serveur. Aucun secret technique n’est projeté.

La date de purge demeure `season.purge_at` et continue à utiliser le calendrier de saison existant. Le texte de politique reste le contenu actuel en l’absence de paramétrage ; aucune nouvelle affirmation juridique n’est ajoutée.

## Vérification

Compilation de production et TypeScript, contrôle des fichiers modifiés, parcours confidentialité mobile/desktop (document existant et texte configuré, retour, fermeture, contact), accueil responsive, groupes du menu et états PWA. Captures dans le dossier de livraison du lot.
