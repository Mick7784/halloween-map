# Ouverture publique — vérifications V0.9.6

Checklist d'exploitation pour Halloween Map. À réaliser sur **l'instance réelle**, avec une saison REAL correctement paramétrée, avant d'autoriser les visites publiques. Ce document ne vaut ni audit de sécurité ni validation juridique.

## 1. Textes et informations légales (bloquant)

- [ ] Renseigner l'identité et les coordonnées de l'exploitant, le responsable de publication et les informations d'hébergement dans **Administration → Contenus & documents → Mentions légales**.
- [ ] Publier le contact relatif aux données personnelles, les durées de conservation des comptes inactifs et la procédure d'exercice des droits dans **Confidentialité**.
- [ ] Préciser les prestataires réellement utilisés (carte, géocodage et itinéraires piétons), l'utilisation temporaire du stockage local pour reprendre une collecte, les médias des emails conservés après archivage et les sauvegardes.
- [ ] Vérifier les CGU/bonnes pratiques, puis publier les versions définitives et les relire sans être connecté.
- [ ] Confirmer les coordonnées et durées réelles avec la personne responsable : ne jamais compléter ces champs à partir d'une supposition.

## 2. Emails de compte et campagnes

- [ ] Tester les six modèles de service dans **Gmail, Outlook et Apple Mail** : vérification, invitation, récupération, maison reçue, maison acceptée, maison refusée.
- [ ] Tester une campagne *envoi de test uniquement*, sans activer une campagne réelle.
- [ ] Vérifier les liens d'action, le texte du bouton, le contraste, le texte brut, l'affichage avec images bloquées et la variante mobile.
- [ ] Importer une image PNG/JPEG/WebP depuis l'administration HTTPS, l'insérer, enregistrer un modèle, recharger la bibliothèque et ouvrir l'URL **sans session**.
- [ ] Archiver une image et confirmer que l'ancienne URL publique continue de fonctionner.
- [ ] Vérifier les paramètres SMTP, SPF, DKIM et DMARC du domaine expéditeur.

## 3. Carte et parcours réels

- [ ] Tester iPhone Safari et Android Chrome, téléphone en portrait et paysage, GPS accordé/refusé, précision dégradée, retour en arrière-plan et reprise.
- [ ] Tester la flèche facultative d'orientation lorsqu'elle est prise en charge, sinon le marqueur GPS classique.
- [ ] Vérifier le point sur des maisons réelles puis une maison en pause/fermée, les horaires, une collecte sans réseau et le retour du réseau.
- [ ] Valider le décompte avant ouverture, l'ouverture à la bonne heure, l'arrêt à fermeture et la purge de la saison.
- [ ] Vérifier l'installation PWA et la mise à jour de l'icône/favicone sur mobile.

## 4. Hébergement et exploitation

- [ ] Sauvegarder la base et le volume PostgreSQL, puis tester une **restauration dans un environnement isolé** ; ne jamais faire `docker compose down -v` sur la production.
- [ ] Confirmer que `app`, `worker` et `migrate` exécutent le même digest de la release, et que les migrations **011, 012 et 013** figurent dans `schema_migrations`.
- [ ] Vérifier la santé du worker : elle requiert maintenant un cycle réussi récent (moins de 3 minutes) et moins de 3 échecs consécutifs.
- [ ] Consulter la supervision PostgreSQL avec les requêtes suivantes, sans enregistrer de noms ou adresses dans la surveillance.
- [ ] Mettre en place une alerte sur `consecutive_failures >= 3` et sur les messages `overdue_outbox > 0` persistant plusieurs cycles (l'envoi SMTP peut aussi être volontairement désactivé).
- [ ] Contrôler TLS, reverse proxy, ports exposés, sécurité des secrets, droits PostgreSQL, journaux et rotation des sauvegardes.
- [ ] Confirmer que les modérateurs acceptent le choix **administration desktop uniquement** (statistiques seules en mobile).

```sql
SELECT worker_name, last_attempt_at, last_success_at,
       consecutive_failures, overdue_outbox, oldest_overdue_at
FROM worker_health WHERE worker_name='season_worker';

SELECT name, applied_at FROM schema_migrations
WHERE name IN ('011_email_html_editor.sql','012_email_media.sql','013_worker_monitoring.sql')
ORDER BY name;
```

## 5. Alerte de dépendance toujours ouverte

L'avis [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) concerne `braces <= 3.0.3`, amené par l'outillage de développement ESLint/Next via micromatch. **Aucun correctif publié n'est disponible au 14/10/2026.** Ne pas forcer un downgrade incompatible pour masquer l'alerte. La CI vérifie désormais automatiquement `npm audit --omit=dev --audit-level=high` et l'avis de développement est suivi séparément. Réévaluer à chaque montée de version d'ESLint/Next.

## 6. Décision d'ouverture

Ne pas annoncer que l'ensemble des points a été vérifié tant que les cases relatives à l'instance réelle, aux boîtes email et aux smartphones physiques ne sont pas réellement cochées. Les tests automatisés sont nécessaires, mais ne remplacent ni ces contrôles ni l'information légale de l'exploitant.
