-- V0.6.4 upgrade: keep the existing active REAL; old TEST references become inactive.
-- No account, participation, password or season is deleted by this migration.
DROP TRIGGER IF EXISTS user_season_origin ON users;
DROP TRIGGER IF EXISTS participation_season_context ON participations;
DROP TRIGGER IF EXISTS instance_season_context ON instances;
DROP TRIGGER IF EXISTS season_defaults ON seasons;
DROP FUNCTION IF EXISTS season_context_guard();
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='created_for_season_id') THEN
 UPDATE participations p SET starts_at='2000-01-01T00:00:00Z',ends_at='2201-01-01T00:00:00Z'
 FROM seasons s WHERE p.season_id=s.id AND s.is_test AND (p.starts_at>'2000-01-01T00:00:00Z' OR p.ends_at<'2201-01-01T00:00:00Z');
 END IF;
END $$;
ALTER TABLE instances DROP CONSTRAINT IF EXISTS instance_test_season_fk;
ALTER TABLE users DROP CONSTRAINT IF EXISTS user_origin_season_fk;
DROP INDEX IF EXISTS users_season_origin;
ALTER TABLE instances DROP COLUMN IF EXISTS test_season_id;
ALTER TABLE users DROP COLUMN IF EXISTS created_for_season_id;
ALTER TABLE users DROP COLUMN IF EXISTS is_test;
ALTER TABLE participations DROP COLUMN IF EXISTS is_test;
ALTER TABLE sessions DROP COLUMN IF EXISTS early_access;
ALTER TABLE seasons DROP COLUMN IF EXISTS activated;
ALTER TABLE seasons ADD COLUMN IF NOT EXISTS stats_snapshot_at timestamptz;
CREATE OR REPLACE FUNCTION season_definition_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='UPDATE' AND NEW.is_test IS DISTINCT FROM OLD.is_test AND
 (EXISTS(SELECT 1 FROM instances WHERE active_season_id=NEW.id) OR
 EXISTS(SELECT 1 FROM participations WHERE season_id=NEW.id) OR
 EXISTS(SELECT 1 FROM email_campaigns WHERE season_id=NEW.id) OR OLD.routes_count>0) THEN
 RAISE EXCEPTION 'Used season type cannot change'; END IF;
 IF btrim(NEW.name)='' THEN NEW.name='Halloween '||NEW.year; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER season_defaults BEFORE INSERT OR UPDATE ON seasons FOR EACH ROW EXECUTE FUNCTION season_definition_guard();
-- TEST dates are technical bounds. Existing test houses become immediately available;
-- their activity, moderation, content and owners remain unchanged.
UPDATE seasons SET registrations_open_at='2000-01-01T00:00:00Z',opens_at='2000-01-01T00:00:00Z',
 closes_at='2201-01-01T00:00:00Z',purge_at='2201-01-02T00:00:00Z',registrations_open=true WHERE is_test;
-- Opaque idempotency receipts; no user, address, steps, coordinates or GPS trace.
CREATE TABLE IF NOT EXISTS collection_reports (
 id uuid PRIMARY KEY,season_id uuid NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
 finished boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS collection_reports_season ON collection_reports(season_id);
ALTER TABLE collection_reports ADD COLUMN IF NOT EXISTS started boolean NOT NULL DEFAULT false;

-- Same-instance FK + one nullable pointer already guarantee uniqueness.
-- Also reject reactivation of archived/purged/closed REAL at the DB boundary.
CREATE OR REPLACE FUNCTION active_season_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.active_season_id IS NOT NULL AND NOT EXISTS(
   SELECT 1 FROM seasons s WHERE s.id=NEW.active_season_id AND s.instance_id=NEW.id
   AND s.purged_at IS NULL AND NOT s.archived AND (s.is_test OR s.closes_at>now())
 ) THEN RAISE EXCEPTION 'Active season must be usable in this instance'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS instance_active_season ON instances;
CREATE TRIGGER instance_active_season BEFORE INSERT OR UPDATE OF active_season_id ON instances FOR EACH ROW EXECUTE FUNCTION active_season_guard();
