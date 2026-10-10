# Changelog

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
