# Changelog

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
