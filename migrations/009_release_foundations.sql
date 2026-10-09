-- Additive release migration: accounts and seasonal house data remain intact.
ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_permissions text[];
UPDATE users u SET admin_permissions=ARRAY['admin.access','communications.read','communications.manage','content.manage','participants.read','participants.edit','participants.delete','users.read','users.manage','season.read','season.manage','stats.read','audit.read'] WHERE admin_permissions IS NULL AND EXISTS(SELECT 1 FROM roles r WHERE r.id=u.role_id AND r.name='ADMIN');
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS admin_last_activity_at timestamptz;
UPDATE sessions SET expires_at=LEAST(expires_at,created_at+interval '12 hours'),admin_last_activity_at=COALESCE(admin_last_activity_at,created_at);
ALTER TABLE sessions ALTER COLUMN admin_last_activity_at SET DEFAULT now();
CREATE TABLE IF NOT EXISTS participation_history(
 user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
 season_id uuid NOT NULL,
 year integer NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,season_id)
);
-- Intentionally no season FK: the minimal year marker survives seasonal purge.
CREATE TABLE IF NOT EXISTS active_presence(
 user_id uuid PRIMARY KEY REFERENCES users ON DELETE CASCADE,
 season_id uuid NOT NULL REFERENCES seasons ON DELETE CASCADE,
 seen_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS attendance_samples(
 season_id uuid NOT NULL REFERENCES seasons ON DELETE CASCADE,
 sampled_at timestamptz NOT NULL,
 sample_slot timestamptz NOT NULL,
 active_count integer NOT NULL CHECK(active_count>=0),
 PRIMARY KEY(season_id,sample_slot)
);
CREATE INDEX IF NOT EXISTS audit_activity_page ON audit_logs(instance_id,created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS audit_retention ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS history_retention ON participation_history(recorded_at);
-- Publish a new immutable privacy version, preserving the operator's existing text.
WITH next_versions AS (
 SELECT instance_id,GREATEST(extract(year FROM now())::integer*1000,COALESCE(max(split_part(version,'.',1)::integer*1000+split_part(version,'.',2)::integer) FILTER(WHERE version ~ '^[0-9]{4}\.[0-9]{1,3}$'),0))+1 number
 FROM legal_documents WHERE kind='PRIVACY' GROUP BY instance_id
)
INSERT INTO legal_documents(instance_id,kind,version,title,body,status,active,published_at)
 SELECT d.instance_id,'PRIVACY',(floor(v.number/1000)::integer)::text||'.'||(v.number%1000)::text,title,
 body || E'\n\n## Participation et fréquentation\n\nAprès la purge des maisons, un marqueur minimal conserve uniquement les années de participation validée de votre compte pendant cinq ans. Aucune adresse, position, maison ou visite passée ne figure dans cet historique. Vous et les administrateurs habilités pouvez le consulter ; supprimer votre compte efface ces marqueurs. Les mentions antérieures de conservation exclusivement anonyme après purge sont remplacées par cette règle.\n\nLa fréquentation compte les membres authentifiés actifs au premier plan. La présence par compte expire après trois minutes ; les mesures de quinze minutes et leur pic sont conservés uniquement sous forme de totaux anonymes par saison. Aucune page visitée, adresse IP, position GPS ou parcours n’est enregistré pour cette mesure. Le journal métier est conservé au maximum 90 jours et les événements saisonniers sont effacés lors de la purge.',
 'PUBLISHED',false,now() FROM legal_documents d JOIN next_versions v ON v.instance_id=d.instance_id WHERE kind='PRIVACY' AND active
 AND position('## Participation et fréquentation' IN body)=0;
UPDATE legal_documents SET active=false WHERE kind='PRIVACY' AND active AND position('## Participation et fréquentation' IN body)=0 AND EXISTS(SELECT 1 FROM legal_documents n WHERE n.instance_id=legal_documents.instance_id AND n.kind='PRIVACY' AND position('## Participation et fréquentation' IN n.body)>0 AND n.status='PUBLISHED');
UPDATE legal_documents d SET active=true WHERE d.kind='PRIVACY' AND position('## Participation et fréquentation' IN d.body)>0 AND d.status='PUBLISHED' AND NOT EXISTS(SELECT 1 FROM legal_documents n WHERE n.instance_id=d.instance_id AND n.kind='PRIVACY' AND n.status='PUBLISHED' AND (n.published_at,n.id)>(d.published_at,d.id));
CREATE OR REPLACE FUNCTION record_validated_participation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.review_status='VALIDATED' THEN
  INSERT INTO participation_history(user_id,season_id,year)
  SELECT NEW.user_id,s.id,s.year FROM seasons s WHERE s.id=NEW.season_id AND NOT s.is_test
  ON CONFLICT DO NOTHING;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS minimal_participation_history ON participations;
CREATE TRIGGER minimal_participation_history AFTER INSERT OR UPDATE OF review_status ON participations FOR EACH ROW EXECUTE FUNCTION record_validated_participation();
INSERT INTO participation_history(user_id,season_id,year)
 SELECT p.user_id,s.id,s.year FROM participations p JOIN seasons s ON s.id=p.season_id WHERE p.review_status='VALIDATED' AND NOT s.is_test ON CONFLICT DO NOTHING;
