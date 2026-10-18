# Contenus & documents — utilisation et exploitation

## Rédaction

Depuis l'administration, ouvrir **Contenus & documents**. Les textes courts
sont regroupés par contexte ; leur style reste celui de l'application.
Les paramètres existants de signalement, contact et soutien restent dans
**Liens & contact**.

Dans **Documents officiels**, ouvrir un document. Renseigner titre et version,
puis rédiger avec l'éditeur. Les anciens Markdown sont convertis seulement dans
le brouillon édité : leurs versions publiées ne sont jamais réécrites. Le
sommaire suit les titres H1 à H3. L'aperçu utilise le rendu de publication.
Le copier-coller conserve les structures autorisées et retire les styles externes.

**Enregistrer le brouillon** conserve le travail sans publication. L'éditeur
indique les modifications non enregistrées et empêche les saisies pendant la
requête. Une coupure réseau laisse le texte dans l'éditeur ouvert : réessayer
avant de fermer. Aucun document privé n'est ajouté au stockage hors ligne.

Si une autre session a enregistré le brouillon, la sauvegarde renvoie un conflit.
Utiliser **Actualiser les versions**, comparer les deux contenus, puis choisir
explicitement de reprendre son travail sur la révision affichée. Un nouveau
conflit reste possible si une troisième écriture intervient ; aucun écrasement
silencieux. Plusieurs brouillons hérités restent sélectionnables.

## Publication

1. Compléter les informations de l'exploitant et choisir une version supérieure
   à la version active (format `AAAA.N`). Les modèles ne sont pas validés juridiquement.
2. Si nécessaire, demander une nouvelle acceptation des CGU ou prise de connaissance
   des bonnes pratiques. Ce réglage ne s'applique pas aux informations RGPD.
3. Sauvegarder, puis **Vérifier avant publication**.
4. Examiner l'ancienne et la nouvelle version, les informations manquantes et le
   nombre de participants concernés. Une version vide ou non préparée est bloquée.
5. Confirmer explicitement la publication. Le serveur revérifie révision, version
   active et impact sous verrou ; une modification concurrente oblige à revoir.

Les maisons restent visibles pendant la régularisation. Le participant lit et
accepte explicitement les nouvelles CGU dans son formulaire de participation,
séparément des bonnes pratiques. Une nouvelle publication pendant sa lecture
refuse l'acceptation périmée. **Actualiser les documents à lire** recharge les
textes sans effacer les champs de la maison et désarme les cases.

L'historique compare les anciennes versions avec l'active. **Restaurer** prépare
un brouillon de nouvelle version et remet sa préparation à vérifier. Il faut
ensuite sauvegarder et repasser par le même contrôle de publication.

## Données et conservation

Migration additive `015_document_studio.sql` ; les données et octets des anciens
documents restent conservés. Nouvelles colonnes JSON, révision, métadonnées et
table `legal_events`. La migration importe uniquement les horodatages réels
d'acceptation présents, jamais une version CGU sans date ni un journal temporaire.
Le rejeu ne duplique pas ces preuves.

Les événements juridiques sont distincts du journal métier de 90 jours. Ils
contiennent document/version/action/date et une référence au compte ; aucun
identifiant de maison, adresse ou IP. Leur échéance est de cinq ans et le worker
existant les purge. Supprimer le compte rend sa référence nulle. Le module affiche
les 500 événements les plus récents de l'instance ; les autres restent conservés
en base jusqu'à leur échéance. Les versions documentaires restent conservées.

La politique et la durée sont des choix techniques documentés à examiner par
l'exploitant selon son contexte ; la préparation d'un document n'est pas une
validation juridique. Les CGU finales ne sont pas rédigées par cette release.

## API et frontières

Route existante `POST /api/admin/content`, accès `admin.access` + `content.manage`
et contrôle d'origine existant. `draft` prend `document`, `active_version` et, lors
d'une mise à jour, `id` + `revision`. `review` prend `id`, `revision`,
`active_version` et retourne comparaison, problèmes et `affected`. `publish`
ajoute `confirmed: true` et le nombre `affected` contrôlé. Une révision ou version
périmée renvoie 409 ; une structure ou préparation invalide est refusée.

La grammaire JSON fermée limite taille UTF-8 (500 Ko), profondeur (32) et nombre
de nœuds (20 000). Aucun HTML libre, code, événement, style arbitraire ou lien
javascript/data ; couleurs limitées, liens HTTPS/mailto/internes sûrs. Le rendu
échappe les textes et reconstruit uniquement les balises autorisées.

Les composants Studio réutilisent les boutons/champs existants et ajoutent une
navigation, des panneaux et statuts locaux. Les variables clair/sombre/système
restent limitées au module. Aucune dépendance de code à LinKs ; une extraction
partagée pourra être envisagée lors de la refonte générale.

## Mise à jour par l'exploitant

La publication GitHub/GHCR n'effectue aucune intervention sur le VPS.
Suivre le circuit Compose et sauvegarde décrit dans `OPERATIONS.md` : conserver
une sauvegarde PostgreSQL avant mise à jour, puis contrôler les logs de migration,
la santé de l'app et du worker. Ne pas supprimer les nouvelles colonnes après
avoir créé des documents JSON. Une restauration de sauvegarde doit conserver
ensemble documents, versions, comptes et preuves.

Vérifier sur l'instance : accès aux quatre documents et à leurs anciennes
versions, brouillon privé, aperçu mobile, sauvegarde et publication d'un document
de test adapté, régularisation avec un compte de test, exécution du worker et
cohérence des liens/contact. Éviter de publier des CGU de test en production.
Les vérifications sur navigateur/appareil physique et les textes de l'exploitant
restent propres à l'installation.
