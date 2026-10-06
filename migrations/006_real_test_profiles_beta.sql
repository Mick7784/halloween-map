-- Test identification is metadata only; it must never affect public eligibility.
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='demo') THEN
    ALTER TABLE users RENAME COLUMN demo TO is_test;
  END IF;
  IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='participations' AND column_name='demo') THEN
    ALTER TABLE participations RENAME COLUMN demo TO is_test;
  END IF;
END $$;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;
ALTER TABLE participations ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;
ALTER TABLE participations ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'VALIDATED' CHECK(review_status IN('PENDING','VALIDATED','REFUSED'));
ALTER TABLE participations ADD COLUMN IF NOT EXISTS refusal_reason text NOT NULL DEFAULT '';
ALTER TABLE participations ADD COLUMN IF NOT EXISTS submitted_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE participations ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS early_access boolean NOT NULL DEFAULT false;
ALTER TABLE sessions DROP COLUMN IF EXISTS preview_at;
CREATE OR REPLACE FUNCTION participation_modified() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at=now(); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS participation_modified ON participations;
CREATE TRIGGER participation_modified BEFORE UPDATE ON participations FOR EACH ROW EXECUTE FUNCTION participation_modified();
