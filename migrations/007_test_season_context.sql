ALTER TABLE seasons ADD COLUMN IF NOT EXISTS name text NOT NULL DEFAULT '';
ALTER TABLE seasons ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;
UPDATE seasons SET name='Halloween '||year WHERE btrim(name)='';
ALTER TABLE seasons DROP CONSTRAINT IF EXISTS seasons_instance_id_year_key;
ALTER TABLE instances ADD COLUMN IF NOT EXISTS test_season_id uuid;
ALTER TABLE users ADD COLUMN IF NOT EXISTS created_for_season_id uuid;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS season_id uuid;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='instance_test_season_fk') THEN ALTER TABLE instances ADD CONSTRAINT instance_test_season_fk FOREIGN KEY(test_season_id,id) REFERENCES seasons(id,instance_id); END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='user_origin_season_fk') THEN ALTER TABLE users ADD CONSTRAINT user_origin_season_fk FOREIGN KEY(created_for_season_id,instance_id) REFERENCES seasons(id,instance_id); END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='audit_season_fk') THEN ALTER TABLE audit_logs ADD CONSTRAINT audit_season_fk FOREIGN KEY(season_id,instance_id) REFERENCES seasons(id,instance_id) ON DELETE CASCADE; END IF;
END $$;
-- Upgrade only the explicitly recorded V0.6.1 provisioning. Other flags remain legacy metadata.
UPDATE seasons s SET is_test=true,name='Tests octobre' FROM instances i WHERE s.instance_id=i.id AND s.id::text=i.config->'testProvisioning'->>'seasonId';
UPDATE users u SET created_for_season_id=s.id FROM seasons s,instances i WHERE s.instance_id=i.id AND s.id::text=i.config->'testProvisioning'->>'seasonId' AND u.instance_id=i.id AND u.is_test AND EXISTS(SELECT 1 FROM participations p WHERE p.user_id=u.id AND p.season_id=s.id) AND NOT EXISTS(SELECT 1 FROM participations p WHERE p.user_id=u.id AND p.season_id<>s.id);
UPDATE instances i SET test_season_id=s.id FROM seasons s WHERE s.instance_id=i.id AND s.is_test AND s.id::text=i.config->'testProvisioning'->>'seasonId';
UPDATE instances i SET active_season_id=s.id FROM seasons s WHERE s.instance_id=i.id AND NOT s.is_test AND s.id::text=i.config->'testProvisioning'->>'previousSeasonId' AND i.active_season_id::text=i.config->'testProvisioning'->>'seasonId';
UPDATE instances i SET active_season_id=NULL WHERE EXISTS(SELECT 1 FROM seasons s WHERE s.id=i.active_season_id AND s.is_test);
UPDATE instances SET config=config-'testProvisioning';
UPDATE audit_logs a SET season_id=p.season_id FROM participations p WHERE a.season_id IS NULL AND a.instance_id=p.instance_id AND a.target_id=p.id;
UPDATE audit_logs a SET season_id=s.id FROM seasons s WHERE a.season_id IS NULL AND a.instance_id=s.instance_id AND a.target_id=s.id;
UPDATE audit_logs a SET season_id=u.created_for_season_id FROM users u WHERE a.season_id IS NULL AND u.created_for_season_id IS NOT NULL AND a.instance_id=u.instance_id AND (a.target_id=u.id OR a.actor_id=u.id);
CREATE INDEX IF NOT EXISTS users_season_origin ON users(instance_id,created_for_season_id);
CREATE INDEX IF NOT EXISTS audit_season_context ON audit_logs(instance_id,season_id,created_at);
CREATE OR REPLACE FUNCTION season_context_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_TABLE_NAME='seasons' THEN
  IF TG_OP='UPDATE' AND NEW.is_test IS DISTINCT FROM OLD.is_test AND (EXISTS(SELECT 1 FROM instances WHERE active_season_id=NEW.id OR test_season_id=NEW.id) OR EXISTS(SELECT 1 FROM users WHERE created_for_season_id=NEW.id) OR EXISTS(SELECT 1 FROM participations WHERE season_id=NEW.id)) THEN RAISE EXCEPTION 'Used season type cannot change'; END IF;
  IF btrim(NEW.name)='' THEN NEW.name='Halloween '||NEW.year; END IF;
 ELSIF TG_TABLE_NAME='users' THEN
  IF NEW.created_for_season_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM seasons WHERE id=NEW.created_for_season_id AND instance_id=NEW.instance_id AND is_test) THEN RAISE EXCEPTION 'Account origin must be a test season'; END IF;
 ELSIF TG_TABLE_NAME='participations' THEN
  IF EXISTS(SELECT 1 FROM users WHERE id=NEW.user_id AND created_for_season_id IS NOT NULL AND created_for_season_id<>NEW.season_id) OR EXISTS(SELECT 1 FROM seasons s JOIN users u ON u.id=NEW.user_id WHERE s.id=NEW.season_id AND s.is_test AND u.created_for_season_id IS DISTINCT FROM s.id) THEN RAISE EXCEPTION 'Season account isolation'; END IF;
 ELSIF TG_TABLE_NAME='instances' THEN
  IF NEW.active_season_id IS NOT NULL AND EXISTS(SELECT 1 FROM seasons WHERE id=NEW.active_season_id AND is_test) THEN RAISE EXCEPTION 'Public season cannot be test'; END IF;
  IF NEW.test_season_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM seasons WHERE id=NEW.test_season_id AND is_test) THEN RAISE EXCEPTION 'Test reference must be test'; END IF;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS season_defaults ON seasons;
CREATE TRIGGER season_defaults BEFORE INSERT OR UPDATE ON seasons FOR EACH ROW EXECUTE FUNCTION season_context_guard();
DROP TRIGGER IF EXISTS user_season_origin ON users;
CREATE TRIGGER user_season_origin BEFORE INSERT OR UPDATE ON users FOR EACH ROW EXECUTE FUNCTION season_context_guard();
DROP TRIGGER IF EXISTS participation_season_context ON participations;
CREATE TRIGGER participation_season_context BEFORE INSERT OR UPDATE ON participations FOR EACH ROW EXECUTE FUNCTION season_context_guard();
DROP TRIGGER IF EXISTS instance_season_context ON instances;
CREATE TRIGGER instance_season_context BEFORE INSERT OR UPDATE ON instances FOR EACH ROW EXECUTE FUNCTION season_context_guard();
