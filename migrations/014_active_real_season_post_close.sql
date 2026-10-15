-- V0.9.9: only the REAL season explicitly activated by the organiser exists
-- in the public context. Previous TEST rows are retained for data safety.
UPDATE instances i SET active_season_id=NULL
WHERE i.active_season_id IN (SELECT id FROM seasons WHERE is_test);

-- Public closing must not silently revoke the Super Admin's live map preview.
-- A season may stay manually active after closes_at until deactivation or purge.
CREATE OR REPLACE FUNCTION active_season_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.active_season_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM seasons s
    WHERE s.id=NEW.active_season_id AND s.instance_id=NEW.id
      AND NOT s.is_test AND s.purged_at IS NULL AND NOT s.archived
  ) THEN
    RAISE EXCEPTION 'Active season must be a non-purged real season in this instance';
  END IF;
  RETURN NEW;
END $$;
