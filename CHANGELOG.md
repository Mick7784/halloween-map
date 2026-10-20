# Changelog

## V1.0-beta.1

- **Administration Studio** : convergence visuelle et structurelle du back-office Halloween Map avec les primitives DomotiK Studio, en conservant ses couleurs, son administration et ses données indépendantes.
- **Gestion quotidienne** : navigation, tableaux de bord, listes et actions contextuelles harmonisés pour les saisons, maisons, comptes, activités et campagnes.
- **Contenus et documents** : éditeur riche, aperçu, brouillons, contrôle des conflits, publication vérifiée, historique et restauration ; composants de présentation réutilisables sans dépendance directe à LinKs.
- **Sécurité et compatibilité** : conservation des permissions, des règles de saisons et d'inscriptions, de la confidentialité des brouillons et des mécanismes de réacceptation documentaire.
- **Validation bêta** : tests unitaires et navigateur renforcés ; publication GHCR isolée sur le tag V1.0-beta.1, sans mise à jour de latest. Sauvegarder la base avant essai et valider la recette sur une instance de test.

## V0.9.10

- **Contenus & documents** : nouvelle navigation en trois espaces, textes courts par contexte avec champs simples et aperçu, documents officiels dans un espace dédié, paramètres de liens/contact conservés.
- **Éditeur documentaire** : Tiptap 3 structuré, titres H1 à H3, styles, couleur et surlignage, alignements, listes et tâches, citations, liens, tableaux, annulation/rétablissement, sommaire rétractable, compteurs et aperçu ordinateur/mobile. Aucun bouton IA sans service.
- **Brouillons et versions** : sauvegarde distincte de la publication, révision attendue et conflits explicites, reprise après erreur réseau, comparaison et restauration dans une nouvelle version. Les versions publiées restent immuables ; anciens contenus Markdown et brouillons conservés.
- **Publication** : contrôle de préparation et informations manquantes, comparaison définitive, analyse des participants concernés, confirmation explicite et journalisation durable. Un brouillon n'est jamais public. Les modèles initiaux restent signalés comme à vérifier ; aucune réécriture des CGU finales.
- **Acceptations** : les bonnes pratiques n'enregistrent plus de version ni d'acceptation fictive des CGU. Une version historique sans horodatage ne vaut pas preuve. Réacceptation explicite avec actualisation des documents en session, refus des versions périmées et maintien des maisons sur la carte pendant la régularisation. CGU, consignes et informations RGPD restent distinctes.
- **Données et sécurité** : migration 015 additive et rejouable, preuves indépendantes des journaux temporaires, conservation cinq ans avec purge et références anonymisées à la suppression du compte. JSON validé, HTML échappé, grammaire et palette fermées, liens sûrs, limites de taille/profondeur et métadonnées internes retirées des surfaces publiques.
- **DomotiK Studio** : primitives locales de navigation, panneaux et sauvegarde ; thèmes clair/sombre/système isolés et compatibles avec les contrôles existants. Architecture documentée, sans dépendance directe à LinKs ni refonte des autres interfaces publiques.
- **Validation et exploitation** : 303 tests unitaires/métier, parcours documentaires Playwright avec PostgreSQL réel, migration depuis 014 et rejeu, conflits, coupure réseau, longueurs, rendu mobile, permissions, sécurité et régressions comptes/maisons/saisons/collecte. Circuit CI, Docker, HTTPS et release existant conservé. Guide : [docs/content-documents-operations.md](docs/content-documents-operations.md). Aucune intervention sur le VPS.


## V0.9.9

- **Saisons** : une seule saison réelle activée manuellement ; retrait du fonctionnement TEST, avec conservation des données historiques et migration compatible V0.9.8. Comptes et connexion disponibles sans saison. Les inscriptions publiques exigent une saison active et leur fenêtre autorisée ; carte publique uniquement aux horaires officiels.
- **Super Admin** : accès à la vraie carte et préparation des parcours avant et après Halloween tant que la saison reste active. La clôture publique ne désactive plus la saison ; sans saison active, aucune carte ni parcours ne sont accessibles. Les simulations hors horaires ne gonflent pas les statistiques de collecte. Les préparations peuvent être restaurées après clôture.
- **Administration des maisons** : création, modification, modération, visibilité et fermeture indépendantes des dates publiques selon les permissions. La création BO utilise la saison active ou le contexte d'une saison en attente sans activation ; absence de saison et contexte ambigu refusés.
- **Actions rapides** : pastilles compactes de modération orange, verte et rouge avec libellés accessibles ; Valider/Refuser, Modifier/Masquer/Réafficher, Réexaminer selon l'état. Les actions secondaires restent dans « … » ; fiches, formulaires, recherche, filtres, tri et pagination conservés. Les actions Maisons sont aussi accessibles dans le BO mobile selon les droits.
- **Archives et confidentialité** : statistiques agrégées conservées, recalcul final à la purge tenant compte des opérations BO après clôture ; lecture vivante avant purge et archives en lecture seule ensuite. Les détails saisonniers sont supprimés, les comptes et années de participation validée conservés selon la politique existante. Purge et suppression définitive restent distinctes.
- **Vérifications** : tests de rôles et frontières horaires, refus API, migration et rejeu avec données historiques, création BO, modération/visibilité, itinéraires après clôture, statistiques, comptes permanents et transitions automatiques sans rechargement. Matrice de recette : [docs/V099-acceptance.md](docs/V099-acceptance.md). Aucun changement esthétique de l'accueil ni de la carte publique.
- **Essais réels** : la recette sur l'installation de l'organisateur et sur appareils physiques reste à effectuer ; les simulations PWA/GPS et le SMTP de test ne prouvent pas le comportement du matériel ni la délivrabilité Gmail/Outlook.

## V0.9.8

- **Décor mobile / PWA** : réarmement de l'écoute des capteurs au retour dans la fenêtre et lors de la restauration de page, nouvelle posture de référence et arrêt explicite à la suspension. Un échec des images facultatives peut être retenté au retour du réseau ou à la reprise, sans requêtes répétées à chaque mesure. Aucun nouvel effet ni demande d'autorisation ; mouvement réduit et fond statique préservés. Le signalement S26 Ultra / Chrome installé reste à confirmer sur l'appareil réel.
- **Saisons historiques** : les anciennes colonnes de rappel V0.2 ne bloquent plus un changement de calendrier. Les campagnes actuelles restent contrôlées après recalcul, avec annulation transactionnelle si elles dépassent la purge.
- **Nettoyage** : fichiers PWA générés retirés du suivi Git pour éviter les versions périmées (sources officielles conservées, génération avant dev/build/tests), présentation compacte du README rétablie, liens de documentation réparés, état de la dette et des anciens travaux clarifié dans `docs/cleanup-v098.md`. Aucun composant orphelin identifié dans les imports des composants et bibliothèques ; pas de suppression de données, de migration historique ni de route de compatibilité.
- **Contrôles ajoutés** : reprise/focus en navigateur et mode installé simulé, échec d'image puis retour réseau, rappels migrés et protection des campagnes absolues/relatives. La simulation PWA ne vaut pas une recette sur smartphone.

## V0.9.7

- **Accueil mobile — parallaxe adoucie** : filtrage des petites variations des capteurs, inertie fondée sur le temps écoulé entre images (comportement cohérent selon le taux de rafraîchissement), et retour progressif au neutre quand les mesures s'arrêtent. Aucune demande de permission supplémentaire ; l'effet reste facultatif et le fond statique demeure le repli.
- **Administration — dates de saison** : depuis les valeurs proposées pour les prochaines éditions dans Paramètres, accès direct à la gestion de la saison réelle selon l'autorisation `season.read`, avec avertissement en présence de modifications non enregistrées.
- **Périmètre préservé** : illustration et cadrage de l'accueil, identité, carte, collecte, permissions et back-office mobile inchangés. Aucune migration ni modification du Compose de production.
- **Contrôles navigateur** : nouveaux scénarios de lissage/retour au neutre et de navigation Paramètres → Saison. Fluidité sur appareils réels Chrome/Brave Android à confirmer après déploiement de test.

## V0.9.6

- **Stabilisation des emails HTML** : correction des attributs `alt`/`title` échappés deux fois ; refus des liens sécurisés invisibles dans un conteneur masqué ; tests anti-régression.
- **Images externes dans l'éditeur** : chargement HTTPS permis uniquement sur la page d'administration pour harmoniser l'aperçu et le HTML autorisé, sans ouvrir cette permission aux visiteurs.
- **Bibliothèque de médias** : 60 images actives maximum avec quota protégé par transaction, compteur visible et archivage en interface. Les URL des emails déjà envoyés restent pérennes ; une image archivée identique peut être réactivée.
- **Parcours HTTPS intégré** : nouveau test navigateur dédié avec connexion administrateur réelle, import, bibliothèque, sauvegarde de modèle et chargement public de l'image ; la publication dépend de sa réussite.
- **Supervision worker** : migration additive `013_worker_monitoring.sql`, horodatage des cycles réussis/échoués, nombre de messages en retard et healthcheck Docker fondé sur le dernier cycle réellement terminé.
- **Sécurité des dépendances** : `npm audit --omit=dev --audit-level=high` en CI ; surveillance documentée de l'avis `braces` côté développement, pour lequel aucun patch n'est publié au 14 octobre 2026.
- **Documentation** : README illustré avec l'icône officielle, guide technique séparé et checklist d'ouverture (mentions légales, clients mails, GPS physique, restauration de sauvegarde).
- **Périmètre préservé** : aucune modification du design public, des droits de l'administration mobile, des collectes ou des règles de saison.
- **Avant ouverture réelle** : les coordonnées de l'exploitant, les tests de messagerie réelle, les smartphones physiques et la restauration isolée doivent être confirmés sur l'instance hébergée.


## V0.9.5

- **Éditeur d’emails HTML complet** dans le back-office pour les six modèles automatiques et les campagnes : barre d’outils de traitement de texte, mise en forme, tableaux éditables, liens, images, mode source HTML et aperçu. Ancien éditeur conservé en option et modèles historiques non modifiés tant qu’un passage au HTML n’est pas demandé.
- **Images dans les emails** : import sécurisé PNG/JPEG/WebP, optimisation WebP, bibliothèque réutilisable et URLs stables accessibles aux destinataires ; stockage en base et quota par instance.
- **Sécurité des emails** : HTML et CSS contrôlés avant enregistrement et rendu dans l’administration ; liens d’activation et de réinitialisation générés côté serveur, mentions de durée de validité conservées ; alternative en texte brut.
- **Nouvelle identité de l’application** : illustration validée pour les icônes PWA 192/512, Apple et Android maskable ; favicon simplifié validé décliné en PNG 16/32 et ICO. **Aucun changement de design des pages publiques.**
- **Corrections du back-office V0.9.4** : fiches Maison et Utilisateur dépliables sans répétition du nom, de l’adresse, de l’email ni des informations déjà présentes dans leurs tableaux.
- **Compatibilité** : migrations additives, anciens modèles d’emails et moteur d’envoi maintenus ; vérifications unitaires, navigateur, build et Docker via CI. À valider après déploiement de test : envoi SMTP et affichage réel dans les clients email.

## V0.9.4

- Refonte du back-office desktop : barre latérale regroupée par catégories Accueil, Gestion, Suivi & communication et Configuration, réductible aux icônes avec préférence conservée et navigation directe selon les autorisations.
- Fiches Utilisateur et Maison harmonisées : ouverture directement sous la ligne du tableau, avec onglets internes et édition contextuelle, sans fenêtres de consultation concurrentes. Accès à la fiche propriétaire, consultation de l'historique disponible, permissions et actions de modération/gestion conservées.
- Tableaux Utilisateurs et Maisons : tri des colonnes, 25/50/100 lignes par page, recherche et filtres conservés lors de l'ouverture des fiches ; navigation vers les enregistrements depuis les vues de suivi.
- Administration mobile limitée à des statistiques en lecture seule dans quatre onglets : vue d'ensemble, maisons, collectes, fréquentation ; aucune commande de gestion en version mobile. Les fonctionnalités publiques mobiles restent inchangées.
- Paramètres de localisation : prévisualisation d'impact, validation d'empreinte côté serveur et confirmation sécurisée par mot de passe préexistantes conservées sans nouvelle mécanique concurrente. Journal d'activité : lien direct vers les comptes dans la limite des permissions existantes.
- Moteur d'envoi email, six modèles transactionnels, éditeur TipTap historique, campagnes et sécurité des liens conservés sans migration dans cette version. **L'éditeur HTML avancé avec gestion d'images est prévu pour la version suivante, V0.9.5.**
- Validation préalable : lint, compilation TypeScript, tests unitaires et E2E Playwright, build Next.js et contrôles Docker réalisés en CI.


## V0.9.3

- Livraison des travaux V0.9.1 et V0.9.2 : même décor restauré accepté sur mobile et desktop, véritable logo DK, parallaxe très subtile limitée à l’accueil mobile portrait, desktop fixe et fallback statique sans demande d’autorisation.
- Identité bleu nuit/violet/ambre harmonisée pour menus, authentification, compte, participation, maisons, collecte, panneaux de carte et pages secondaires ; favicon, icônes PWA/Android/iOS, manifest et page hors connexion renouvelés.
- Prototype facultatif de flèche et cône autour du point GPS, sans rotation automatique de carte ni guidage. Cap magnétique approximatif uniquement lorsque sa précision est disponible et utilisable ; gyroscope relatif, cap inconnu, lectures périmées et appareils non pris en charge conservent le marqueur GPS classique.
- Autorisation de capteurs uniquement depuis une action volontaire, après explication avec refus possible et mémorisé. Les mesures d’orientation ne sont ni enregistrées ni transmises ; suspension en arrière-plan, paysage et sous les fenêtres.
- Limite connue : le prototype prend principalement en charge les mesures WebKit calibrées en portrait ; les flux Android standards sans indication de précision restent sans flèche. Validation sur iPhone/Android réels à effectuer par le propriétaire après cette publication expressément autorisée.
- Authentification, saisons TEST/REAL, horloge serveur, accès, permissions, collecte, administration et données conservés ; aucune nouvelle migration ni fonction d’organisation d’événement ou d’itinéraire.
- Validation avant publication : compilation, lint/TypeScript, 249 tests unitaires, 195 scénarios Playwright et Docker ; captures comparatives disponibles dans artwork/v091, artwork/v092 et artwork/v093.

## V0.9.2

- Palette, typographies, surfaces, boutons, champs, bordures et focus harmonisés dans l’application. Thèmes clair/sombre/système d’administration et états métier conservés.
- Identité d’installation Halloween Map cohérente : favicon SVG et PNG, PWA 192/512, variantes maskable, Apple opaque et manifest. Aucun effet de parallaxe hors accueil actif.

## V0.9.1

- Village restauré accepté comme nouvelle base commune mobile/desktop, sans interface incrustée. Trois plans transparents dérivés des pixels du même master ; adaptation responsive du cadrage.
- Desktop fixe ; parallaxe mobile portrait discrète avec capteurs déjà accessibles, réduction des animations respectée et décor statique sinon. Aucun bouton ni demande de permission sur l’accueil.
- Composition, compteur serveur, connexion/inscription, menu unique, trois descriptions non cliquables et footer avec véritable logo DK conservés. La restauration n’est pas une reproduction pixel à pixel de la maquette originale.

## V0.9

- Refonte visuelle complète de l’accueil, inspirée de la maquette desktop/mobile validée : composition immersive cinématique, village nocturne en plein cadre, typographie éditoriale et palette bleu nuit, ambre et violet ; comptage central en verre fumé et fond désormais en `cover`, sans bandes vides.
- Header identique desktop/mobile : marque Halloween Map et **un seul bouton Menu utilisateur**, sans barre de navigation additionnelle.
- Mobile prioritaire : présentation sur un seul écran aux tailles courantes, réduction puis suppression de la bande d'informations lorsque la hauteur est insuffisante ; footer et actions essentielles jamais retirés.
- Trois indications des possibilités de l’application : simples **informations statiques**, sans lien, bouton, chevron ou action. Carte des maisons, activités et collecte personnelle.
- Accueil déconnecté : accès immédiat **Se connecter** (formulaire existant ouvert à la demande) et **Créer un compte**. Connexion, inscription, récupération, session et permissions inchangées.
- Attente, préparation, saison réelle ouverte, TEST historique, clôture : tous les états existants et la source temporelle serveur sont conservés ; le décompte demeure dynamique et aucune ouverture fictive TEST n’est affichée.
- Footer allégé, mentions et soutien existants conservés ; attribution « Une création de DomotiK Studio » avec le véritable logo DK compressé et volontairement discret ; numéro de version dynamique.
- Copie de l’accueil, de la page À propos et des métadonnées précisant le rôle non-organisateur : cartographie et outil de gestion **individuelle**, sans rassemblement, itinéraire imposé ni déplacement organisé.
- Strictement aucune migration, aucun changement aux services de saison, API métier, cartes, collecte, permissions, autorisations ou statistiques.

## V0.8.9

- Navigation du compte : rubriques principales distinctes de leurs sous-menus indentés, bordure violette de rattachement et accordéons animés. Accessibilité clavier, inertie des rubriques fermées et réduction des mouvements conservées.
- Carte en consultation : fiches maison condensées, badges d'activités proposées, informations et disponibilité rapprochées ; disparition de « Voir sur la carte » ; panneau de détail remontant depuis le bas sur mobile, sans déplacer la carte.
- « Maisons à découvrir » : panneau intégré en haut de la carte au lieu d'une fenêtre centrale. Lignes de 52 px (maison, nom, distance, frayeur sur cinq ou frissons adaptés, activités). Retour de la fiche vers la liste, filtres et aide discrète.
- Distances piétonnes : nouvelle lecture matricielle source→maisons visibles uniquement, sans géométrie, itinéraire ni ordre de visite. API authentifiée, positions non persistées, limitation des calculs, cache temporaire de consultation et états chargement/indisponible.
- Préparation de collecte : champs d'heures uniquement, date réelle dérivée de la saison du 31 octobre et prévisualisations TEST préservées ; choix individuel retiré au profit du compteur de maisons compatibles, plafonné à 30. Étape calculée ramenée au nombre validé et commandes de départ/sauvegarde ; édition après lancement inchangée.
- Pas de migration ni de modification du schéma, des permissions, des statistiques, de la mesure GPS ou des règles de collecte libre.

## V0.8.8

- Menu global regroupé en rubriques compactes « Carte et collecte », « Mes participations », « Profil et sécurité » et « Aide et application », avec une seule rubrique dépliée à la fois. Administration reste conditionnée à la permission effective `admin.access`, et déconnexion directement accessible à la racine.
- Toutes les actions, liens configurés, années validées, vérification email, sécurité, données, suppression protégée et installation PWA sont conservés. Le menu anonyme conserve la connexion et l’inscription, avec une rubrique d’aide commune.
- Les formulaires visités restent montés lors des retours internes ; leur fermeture ou une navigation externe avertit en présence de modifications non enregistrées. Carte, préférences et collecte conservent leur contexte.
- Accueil avec header et footer distincts, sombres et opaques, autour de la scène illustrée originale mobile/desktop. Logo et footer partagés avec les autres pages ; liens légaux, soutien configuré, signature et version conservés. Horloge serveur, permissions TEST/REAL, CTA, inscriptions et remerciements inchangés.
- Tests unitaires et navigateur des rubriques, permissions, conservation des formulaires, fermeture, accessibilité, écrans courts et phases de saison. Aucune migration, modification d’API ou refonte du back-office.

## V0.8.7

- Menu global « Mon compte » identique depuis l’accueil, la carte, les pages publiques et le back-office. Bannière Halloween sombre orange/violet, en-tête réduit, une entrée par ligne sans description, zones tactiles de 44 px et décoration réduite pour limiter le défilement.
- Informations, mot de passe, participation, années validées, confidentialité, politique et aide d’installation remplacent le contenu dans la même fenêtre ; retour uniquement en haut et fermeture toujours disponible. Années triées et dédupliquées, états vide/chargement/erreur avec nouvelle tentative.
- Toutes les fonctions existantes sont conservées, y compris installation PWA, vérification et changement d’email, changement de mot de passe, gestion de maison, suppression confirmée, connexion/déconnexion, contact, signalement de bug et accès conditionnels carte/collecte/administration. Permissions serveur et règles de saison inchangées.
- Progression de collecte orange visible avec pourcentage, vagues et trois bulles discrètes ; calcul sur les maisons sélectionnées et les visites validées uniques, mise à jour immédiate, impulsion brève à 100 %, réduction des animations respectée.
- Frissons adaptés : disparition complète du curseur et de l’échelle dans les formulaires et fiches ; encadré explicatif conservé, icône d’entraide distincte des masques de « Mise en scène », valeur fixe restaurée lorsque le mode standard est réactivé.
- Tests de permissions, cohérence multi-pages, navigation dans la même fenêtre, 0/50/100 %, réduction des animations et absence de jauge adaptative ; vérification après publication du contenu, de la version, de la révision et du digest des images GHCR versionnée et latest. Aucune migration.

## V0.8.6

- Mon compte : carte « Mes années de participation » harmonisée avec les autres rubriques, dépliable sur place au clic ou au clavier ; seules les années de participation validée conservées sont affichées, sans doublons.
- Frissons adaptés : libellé commun dans les listes, fiches, formulaires et consultations du compte/back-office ; deux masques dans le style des icônes existantes et explication de l’adaptation des frayeurs à l’âge et à la sensibilité des visiteurs.
- Confidentialité, rétention de cinq ans, effacement avec le compte, filtrage et comportement des niveaux de frayeur inchangés ; aucune migration.
- Régressions couvertes sur mobile et desktop : carte dépliable, clavier, absence de navigation, état vide, niveau fixe, parcours du compte et confidentialité.

## V0.8.5

- Desktop : restauration du décor panoramique existant en pleine largeur ; mobile et accès à la connexion conservés.
- Collecte : un seul bandeau inférieur dépliable vers le haut, avec maisons, états, ajout/retrait, profil et Arrêter de même hauteur. Chrono, distance réellement observée, compteur et jauge conservés.
- Proximité : classement réactualisé à chaque position GPS exploitable, choix des visites libre ; distances des listes alignées sur la position de consultation ou explicitement sur le départ.
- Frayeur : icône et niveau sur cinq, adaptabilité identifiée par une icône dédiée, libellés accessibles et configurés ; suppression des codes Adapt./F4 dans les listes.
- Préparation : bouton de démarrage dominant, sauvegarde et suppression secondaires ; caractéristiques compactes avec noms accessibles.
- Aucun changement des règles métier, du tracé piéton, de la mesure GPS, des données ou des migrations.

## V0.8.4

- Restauration de l’accueil cinématique avec exactement l’illustration originale home-reference-v2.webp sur mobile et desktop ; textes adaptatifs et connexion accessible sur les petits écrans.
- Décompte de la prochaine saison réelle également disponible lorsqu’une TEST historique reste active, sans changer la saison de prévisualisation ni ouvrir la carte au public ; maisons TEST explicitement identifiées.
- Revalidation de l’ouverture pour les saisons préparées et au retour dans l’application, avec horloge serveur conservée.
- Maisons et filtres : liste toujours affichée, suppression du bouton carte redondant, filtres supérieurs avec icônes et libellés conservés, fiches plus compactes avec icônes et libellés accessibles non visuels.
- Contrôles de non-régression de l’illustration, des titres mobiles, des états TEST/REAL et des accès au panneau ; aucune migration ni modification des données persistantes.

## V0.8.3

- Carte accessible aux administrateurs dès qu'une saison réelle est créée ; activation explicite réservée à l'ouverture publique, transition automatique au début de l'événement et accueil de remerciement après clôture.
- Suppression de la création de nouvelles saisons TEST dans l'interface et les API (setup compris), conversion REAL vers TEST refusée ; compatibilité des saisons TEST historiques et conservation des données saisonnières et des comptes.
- Collecte mobile plus dense : maisons sur une seule ligne classées par distance géographique depuis le départ puis GPS fiable, sans itinéraire imposé.
- Panneau supérieur extensible, résumé inférieur sur deux lignes avec accès au compte et indicateurs réels, halo orange diffus sans cercle autour du pin le plus proche.
- Ajouts hors critères avec motif exact ; sélection conservée pour plus tard avec fermeture de la fenêtre.
- Contrôles d'accès côté serveur, lecture seule après fermeture, aucune donnée géographique détaillée après purge.
- Compte à rebours et remerciements également visibles sans connexion ; horloge de l'accueil recalée sur le serveur. Libellé accessible complet du bouton compact d'arrêt.
- Back-office : création d'une maison autorisée dans une saison préparée avant activation ; création toujours bloquée sans saison ou après fermeture/purge.
- Couverture navigateur conservée et adaptée aux nouveaux flux ; image GHCR isolée `pr-18-<SHA>` vérifiée après les tests et Docker, sans publication `latest` ni déploiement.

## V0.8.2

- Carte sans aucune couche d’itinéraire ; sélection synchronisée pendant la préparation et la collecte, pins orange et halo de proximité, maisons visitées violet-gris. Accès explicite aux maisons et commandes de collecte sans menu redondant.
- Collecte libre : tri de proximité distinct, ajouts hors critères initiaux avec activités, frayeur et adaptabilité, sans doublons ; progression, chrono et distance GPS observée dans le panneau bas. Aucun historique de positions ajouté.
- Finitions mobiles : blocs Temps écoulé / Distance parcourue lisibles, statut GPS explicite, commandes espacées ; consentement contrasté et bouton d’envoi dans le flux pour ne jamais masquer la case. Libellés de sélection et singulier corrigés.
- Icônes d’activités partagées, identité Halloween Map et logo canonique préservés, alignement des commandes du back-office.
- Nouvelle maison : commune/code postal configurés en lecture seule et contrôlés côté serveur ; 31 octobre par défaut, heures obligatoires sans présélection, fin après minuit, confirmation GPS visible. Conservation des localisations historiques inchangées ; dates TEST sentinelles masquées.
- Éditeur commun Tiptap avec undo/redo, formats compatibles avec les sauvegardes et aperçus existants, listes plates et liens sûrs. Aucun support d’images annoncé, aucune migration de contenu.
- Revalidation des corrections V0.8.1 : reconfirmations sensibles, permissions, adresses forgées, saisons, modération, confidentialité et pipeline SMTP.
- Validation visuelle contre les quatre maquettes non effectuée : références absentes du contexte accessible. GPS sur vrai mobile, tuiles externes et réception Gmail/Outlook réelle restent à tester après pull Dockhand par le propriétaire. Publication autorisée pour ces tests réels.

## V0.8.1

- Confirmations sensibles communes avec mot de passe masqué, annulation sans mutation et phrase de sécurité pour les suppressions et purges ; contrôles serveur conservés.
- Validation française obligatoire pour les nouvelles participations et les changements d’adresse, sans contournement des activités, limites de texte ou communes autorisées. Conservation encadrée des adresses historiques inchangées.
- Composants de contrôle partagés dans les neuf rubriques, fiches maison Informations / Modération / Gestion, actions rapides et menus mobiles, pagination, consultation et édition utilisateur distinctes, contrastes des fenêtres corrigés et protection des brouillons.
- Prévisualisation et confirmation des changements de localisation ; maisons et calendriers existants préservés. Valeurs par défaut réellement utilisées pour les nouvelles saisons.
- Auteur réel des suppressions de maison, liens facultatifs affichés uniquement avec une destination utilisable, résumés de confidentialité alignés sur l’historique minimal de cinq ans, présence TEST réservée aux administrateurs.
- Statistiques : libellé « Visites déclarées », dénominateurs des taux explicites et cartes/timeline communes au tableau de bord.
- Collecte plein écran avec commandes dédiées et accès au compte préservant le parcours ; restauration de la navigation générale hors collecte.
- Vérification locale SMTP chiffré et STARTTLS, six modèles HTML/texte et notifications réelles idempotentes ; rendus mobiles contrôlés. Aucune validation de réception dans des boîtes Gmail/Outlook réelles.

## V0.8

- Sessions de 12 heures maximum, plafonnement des anciennes sessions et expiration des privilèges administratifs après 60 minutes d’inactivité. Reconfirmation du mot de passe pour les opérations sensibles ; protections individuelles contre les tentatives abusives.
- Permissions individuelles ADMIN dans Utilisateurs, annuaire global indépendant des saisons et historique limité aux années de participation validée, conservé cinq ans puis effacé à la suppression du compte.
- Six modèles transactionnels personnalisables, éditeur visuel commun avec campagnes et documents, aperçu HTML/texte et test strictement réservé à l’adresse vérifiée du Super Admin. Accusé de réception, validation et refus de maison via outbox idempotente ; protection TEST conservée.
- Modération avec motifs guidés, aperçu du refus et retour en attente après modification substantielle du propriétaire. Actions rapides utilisateurs, journal filtré et paginé côté serveur, auteur réel et rétention de 90 jours.
- Fréquentation réelle : présences éphémères par compte, mesures anonymes toutes les quinze minutes, moyennes par demi-heure et pic horodaté. Aucun historique artificiel pour les périodes sans relevés.
- Accueil application selon session et calendrier réel, connexion immédiate sans session, accès anticipé Super Admin et menu permanent hors collecte. Harmonisation des thèmes, formulaires et interfaces mobiles, liens/contact centralisés et réglages de carte agrandissables.
- Migrations additives 009/010 ; comptes, maisons, saisons, API et volumes existants préservés. Politique de confidentialité publiée dans une nouvelle version en conservant le texte d’exploitant.
- Limites : pas d’images dans l’éditeur, de FAQ ni de tutoriels ; vérification des emails dans des boîtes Outlook/Gmail réelles non effectuée. Le HTML utilise des tables responsives et des formats limités avec couverture automatisée.

## V0.7.3

- Refonte mobile-first de la carte : consultation épurée, contrôles compacts et fiches maisons flottantes.
- Collecte libre plein écran : panneau supérieur extensible, liste des maisons et commande d'arrêt en bas.
- Progression globale sans ordre ni étapes imposés ; maisons visitées et indisponibles distinguées.
- Mise en avant GPS fiable de la maison éligible la plus proche, sans tracé obligatoire.
- Préparation : sélection libre et niveaux de frayeur cumulatifs sans option « Je m'adapte » côté visiteur.
- Amélioration des menus, fenêtres, reprise et suivi de collecte ; validations automatisées ciblées.
- Préparation technique d'une préproduction isolée sans impact sur la stack de production.

## V0.7.2

- Corrections de modération : retour REFUSED vers PENDING après correction propriétaire et réexamen Admin explicite.
- Horaires TEST respectés et rapports de collecte hors ligne persistants et idempotents.
- Back-office : Communications reconnectées, Activité globale/saison, protections utilisateurs et purge manuelle REAL pour SUPER_ADMIN.
- Blocage des emails réels associés aux saisons TEST, y compris tests, retries et anciens messages en attente.
- Formulaires maison mutualisés, métriques Dashboard/Statistiques harmonisées, chargements ciblés et rafraîchissement après actions.
- Fiche maison publique améliorée : hero résidentiel réaliste, adresse lisible, activités orange/gris, frayeur et adaptation, stock de bonbons distinct et desktop élargi.
- Nettoyage du code mort confirmé, documentation actualisée et dette technique documentée.
- Aucune nouvelle migration ; modèle Saison, collecte libre et ORS/GPS conservés.

## V0.7.1

- Nouvelle page Statistiques à la place de Parcours.
- Statistiques détaillées par saison.
- KPI maisons, participants, visites et collectes.
- Graphiques des activités, statuts et parcours.
- Prise en charge des statistiques historiques anonymisées.
- Affichage explicite des données indisponibles sans valeur inventée.
- Création manuelle de maisons depuis le back-office.
- Sélection du propriétaire parmi les utilisateurs existants.
- Maisons créées par ADMIN/SUPER_ADMIN validées immédiatement.
- Maisons créées depuis l’application publique toujours soumises à modération.
- Rattachement serveur automatique à la saison active.

## V0.7.0

- Refonte complète de la gestion des saisons.
- Une seule saison active à la fois, REAL ou TEST.
- Comptes utilisateurs globaux et indépendants des saisons.
- Maisons rattachées automatiquement à la saison active.
- Saison TEST accessible uniquement aux administrateurs.
- Suppression du mode démo et de l’ancienne logique TEST parallèle.
- Nouveau tableau de gestion des saisons, avec présentation en cartes sur mobile.
- Saisons planifiées et historique en lecture seule.
- Snapshot de statistiques anonymes conservé après purge.
- Suppression des données détaillées et personnelles saisonnières à la purge.
- Nouveau dashboard basé sur la saison active.
- Création rapide de comptes de test sans invitation.
- Migration 008 préservant comptes, mots de passe et participations existantes.

## V0.6.4

- Nouveau shell du back-office.
- Dashboard administrateur refondu.
- Navigation desktop et mobile.
- Thèmes Clair / Sombre / Système persistants.
- Contexte de saison BO persistant.
- Activation publique d’une saison explicite et exclusive.
- Saison TEST indépendante de la saison publique.
- Statistiques et modération filtrées par saison.
- Activité récente enrichie.

## V0.6.3

- Nouveau parcours en collecte libre.
- Maisons visitables dans n’importe quel ordre.
- GPS temps réel pour progression et distance réelle.
- Validation automatique des visites.
- Maisons visitées grisées.
- Sauvegarde/reprise du parcours.
- Arrêt manuel ou fin automatique.
- Statistiques finales.
- ORS conservé uniquement pour l’estimation théorique.

## V0.6.2 — Saisons TEST et environnement isolé

- Saisons nommées REAL / TEST et environnement TEST isolé.
- Création de comptes TEST sans invitation et de maisons depuis l’admin.
- Saison TEST distincte de la saison publique.
- Suppression transactionnelle complète d’une saison TEST.
- Suppression de l’ancien seed automatique Mr Test.

## V0.6.1 — Mode démo réel et back-office bêta

- Suppression des anciennes maisons simulées.
- Peuplement idempotent de cinq vrais profils et maisons de test, dans une saison de test réelle.
- Mode démo : accès anticipé sécurisé à la vraie carte, sans simulation.
- Premier back-office bêta de gestion et modération des maisons.

## V0.6.0 — Carte & Parcours

- Nouvelle expérience Carte & Parcours, avec préparation et bonnes pratiques.
- Carte plein écran et GPS temps réel, avec recentrage volontaire.
- Bottom sheet à trois états et fiche maison plein écran.
- Persistance du parcours et reprise au retour dans l’application.
- Détection des maisons indisponibles et recalcul du parcours.

## V0.5.9 — Accueil, menus et bonnes pratiques

- Accueil desktop corrigé, avec une scène étendue et un bloc central centré.
- Menus mobile et desktop compactés et alignés.
- Liens légaux déplacés dans les footers.
- Ajout de « Signaler un bug » et « Soutenir le projet ».
- Bonnes pratiques simplifiées, en vue dédiée avec validation unique obligatoire.

## V0.5.8 — Inscrire ma maison et Ma participation

- Formulaire commun de création et d’édition, en plein écran mobile et desktop.
- Localisation et adresses françaises, avec validation explicite du point GPS.
- Actions rapides de participation accessibles dès l’ouverture.
- Gestion confirmée de « plus de bonbons » et de la fermeture, distincte de la suppression.
- Préparation des réglages du futur back-office.

## V0.5.7 — Menus, confidentialité et accueil desktop

- Corrections des menus desktop/mobile : panneau desktop compact et alignement commun des actions, y compris l’installation PWA.
- Politique de confidentialité intégrée aux sous-vues de Mon compte, avec retour au niveau précédent.
- Paramètres de confidentialité et de contact préparés pour le futur back-office.
- Accueil desktop recentré sur le visuel mobile, avec compteur centré et cadrage adapté.

## V0.5.6 — Mon compte premium et confidentialité

- Refonte premium de Mon compte : plein écran mobile, sous-vues internes et modal desktop conservant le contexte actif.
- Animations sobres d’ouverture, de fermeture et de retour, avec respect du mouvement réduit.
- Vue Confidentialité et données : informations réelles, prochaine purge, politique existante et points de branchement du contact et des règles de conservation.
- Intégration PWA dans le compte et le menu, avec installation native, aide iOS et masquage en standalone.
- Finitions : badge vert Email vérifié, déconnexion neutre et suppression rouge avec confirmation existante.

## V0.5.5 — installation PWA depuis le menu

- Action secondaire « Ajouter l’application » dans le menu de l’accueil, pour les visiteurs et tous les rôles connectés.
- Conservation de l’offre native lorsque le menu est fermé ; masquage en standalone, après installation ou sans méthode disponible.
- Aide iOS intégrée au panneau ; aucun CTA supplémentaire ni scroll global.
- Documentation du support PWA existant et tests navigateur ciblés.
- Contrôle des badges de parcours corrigé pour tenir compte du zoom visuel au survol, avec test de non-régression.

## V0.5.4 — accueil premium

- Nouvel accueil cinématique : village et lune, compteur dynamique, maisons inscrites, CTA contextuel et scène basse chat/portail/lanterne.
- Composition mobile sans défilement global, safe areas et adaptation tablette/desktop ; menu latéral accessible avec connexion et navigation adaptées aux permissions et à la participation.
- Réutilisation des données et fonctions V0.5.3, mode démo accessible depuis le menu ; documentation des fallbacks et futurs paramètres administrables.
- Vérifications responsive sur cinq formats et quatre états de menu, sans modification du routage, de la base de données ou de l’infrastructure.

## V0.5.3

- Directions conserve les instructions par défaut d’ORS afin de recevoir les segments distance/durée ; les étapes de navigation sont ignorées et ne sont ni stockées ni affichées.
- Tests du contrat multi-waypoints, du nombre de segments et du parcours final de cinq maisons démo avec Snap/Matrix/Directions, métriques fournisseur et aucune ligne droite de secours.

## V0.5.2

- Snap valide désormais chaque entrée indépendamment : les coordonnées/distances invalides sont ignorées, la structure globale reste strictement vérifiée. Les autres maisons restent utilisables et un départ non raccordable invite à choisir un autre point.
- Activation de la preview sans appel ORS, avec conservation du choix temporel sur les vraies maisons ; erreur fournisseur explicite dans la preview et les réponses de parcours.
- Tests ciblés sur deux entrées Snap invalides, cinq points démo cohérents, absence de tracé de secours, confidentialité des journaux et activation en panne ORS.

## V0.5.1

- Marqueurs MapLibre à positionnement natif ; icône et badge dans un élément interne, survol sans modifier la transformation géographique.
- Cinq maisons démo éphémères raccordées par Snap, espacées et connectées, vérifiées par Matrix/Directions piétons ; positions affichées identiques aux positions routées et libellés explicites.
- Endpoint HeiGIT par défaut et diagnostics serveur endpoint/champs invalides, sans clé ni repli à vol d’oiseau.
- Tests de zoom/déplacement desktop/mobile, données démo et compatibilité des trois endpoints.

## V0.5 — routage piéton réel

- Adaptateur serveur openrouteservice, profil foot-walking forcé : Snap, matrices piétonnes et Directions GeoJSON, sans repli à vol d’oiseau.
- Ordre et horaires fondés sur les coûts piétons, maisons ouvrant plus tard, métriques détaillées et contrôle des données hors appels réseau SQL verrouillés.
- Départ explicite, GPS haute précision/états/erreurs, marqueur lavande, étapes numérotées, cadrage et sélection mobile avec confirmation.
- Invalidation complète des résultats obsolètes ; confirmation obligatoire de la position des nouvelles maisons.
- Configuration ORS_API_KEY/ORS_BASE_URL documentée et tests dédiés métier, fournisseur et navigateur.

## V0.4 — Halloween Map V0.4 Beta

- Navigation compacte avec connexion desktop, menu utilisateur unique et panneaux mobiles dans le viewport.
- Carte réservée aux comptes connectés ; avant ouverture, seule la maison du propriétaire est renvoyée par le serveur.
- Trois rôles fixes USER / ADMIN / SUPER_ADMIN, inscription automatique et gestion Visible / Masquée / suppression de maison sans supprimer le compte.
- Mode démo Super Admin en un clic, hors ouverture publique : cinq maisons éphémères sous deux maisons réelles, sinon les vraies maisons ; parcours sans statistiques ni purge simulée.
- Récupération de mot de passe par token hashé, valable une heure, à usage unique, avec révocation des sessions.
- Layout HTML commun avec fallback texte pour vérification, invitation, récupération et campagnes ; SMTP_REPLY_TO facultatif.
- Migration 004 transactionnelle et rejouable, préservant les comptes et données V0.3.

## V0.3 — Halloween Map V0.3 Beta

- Comptes durables et participations saisonnières séparées. Migration 003 transactionnelle et rejouable, conservation des mots de passe, profils, maisons et états V0.2 ; purge sans suppression des comptes.
- Email obligatoire pour les nouvelles participations, liens hashés à usage unique, invitations sans mot de passe, gestion du compte et utilisateurs avec profils et exceptions individuelles.
- Communications multiples, dates absolues/relatives dans le fuseau de la saison, recalcul automatique, variables limitées et outbox atomique. Aucun nouvel envoi automatique sur résultat SMTP incertain.
- CMS avec défauts et personnalisations, Markdown limité, documents légaux immuables et versionnés, validations avant participation et réacceptation des changements importants.
- PWA installable, icônes officielles dérivées du manoir V0.2, parcours iOS/Android et cache limité aux ressources statiques, sans API ni adresses hors ligne.
- Paramètres événement/localisation, géocodage avec repli manuel, calendriers français et heures 24 h ; direction artistique V0.2 conservée.
- Tests métier et parcours navigateur essentiels, migrations fresh/legacy et idempotence. SMTP existant, aucune nouvelle variable d’environnement.
- Upgrade : arrêter app/worker V0.2 avant la migration, conserver PostgreSQL et son volume, puis redémarrer les trois services applicatifs avec la même image V0.3.

## V0.2 — Halloween Map V0.2 Beta

- Bootstrap automatique par lien à usage unique, hash persistant, session temporaire et wizard sans clé technique visible. Override SETUP_TOKEN facultatif.
- Quatre dates de saison indépendantes : inscriptions, carte, fermeture et purge. Données conservées en administration après fermeture ; purge différée, transactionnelle et idempotente.
- Rappels participants programmables, prévisualisation du message, compteurs et file persistante sans doublons. SMTP générique facultatif ; erreurs et résultats incertains sans réessai automatique.
- Mode démonstration réservé au staff autorisé et à sa session, heure simulée centralisée, vraie carte/fiches/filtres/parcours, bandeau explicite, aucun compteur ni traitement destructif simulé.
- Refonte globale selon le concept validé : village nocturne et lune, manoir, serif éditoriale locale, palette charbon/lavande/orange, formulaires premium, bottom sheets et dashboard avec mini-carte/graphiques.
- Migration additive 002 depuis V0.1 sans recréer PostgreSQL ni son volume : ouverture des inscriptions 30 jours avant la carte et purge 36 heures après fermeture pour les saisons existantes. Vérifier ces dates après upgrade.
- Renforcement des tests de concurrence, reprise worker, privacy/RBAC et heures locales ambiguës ; 38 tests métier et cinq parcours Playwright avec captures mobile, tablette, 1080p et 1440p.
- Documentation bootstrap, SMTP, preview et upgrade. Arrêter app/worker V0.1 pendant la migration afin d’empêcher l’ancienne purge à la fermeture.

## V0.1 — Halloween Map V0.1 Beta

- Premier lancement protégé, instance configurable et saison explicitement activée.
- Carte MapLibre, maisons uniformes, fiches sans photo et filtres d’activités/frayeur.
- Comptes participants, modération et gestion en direct des accueils.
- Parcours à pied estimés avec fenêtres horaires et disponibilités.
- Back-office, RBAC configurable, comptes d’équipe et journal minimal.
- Fermeture automatique, statistiques anonymes et purge idempotente.
- PostgreSQL, migrations, seed synthétique, Docker Compose et vérifications CI.
- Version persistante partagée par l’application, le tag, la release et l’image.
