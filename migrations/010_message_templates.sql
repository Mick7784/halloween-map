CREATE TABLE IF NOT EXISTS message_templates(
 instance_id uuid NOT NULL REFERENCES instances ON DELETE CASCADE,
 kind text NOT NULL CHECK(kind IN('VERIFY','INVITE','RESET','HOUSE_SUBMITTED','HOUSE_APPROVED','HOUSE_REFUSED')),
 subject text NOT NULL,body text NOT NULL,updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(instance_id,kind)
);
ALTER TABLE participations ADD COLUMN IF NOT EXISTS review_revision integer NOT NULL DEFAULT 0;
ALTER TABLE email_outbox ADD COLUMN IF NOT EXISTS participation_id uuid REFERENCES participations ON DELETE CASCADE;
ALTER TABLE email_outbox ADD COLUMN IF NOT EXISTS review_revision integer;
ALTER TABLE email_outbox DROP CONSTRAINT IF EXISTS email_outbox_kind_check;
ALTER TABLE email_outbox ADD CONSTRAINT email_outbox_kind_check CHECK(kind IN('VERIFY','INVITE','RESET','CAMPAIGN','TEST','HOUSE_SUBMITTED','HOUSE_APPROVED','HOUSE_REFUSED'));
CREATE OR REPLACE FUNCTION house_review_revision() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.review_status IS DISTINCT FROM OLD.review_status THEN NEW.review_revision=OLD.review_revision+1; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS house_review_revision ON participations;
CREATE TRIGGER house_review_revision BEFORE UPDATE OF review_status ON participations FOR EACH ROW EXECUTE FUNCTION house_review_revision();
CREATE OR REPLACE FUNCTION queue_house_notification() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE notification_kind text; BEGIN
 IF TG_OP='INSERT' AND NEW.review_status='PENDING' THEN notification_kind='HOUSE_SUBMITTED';
 ELSIF TG_OP='UPDATE' AND NEW.review_status IS DISTINCT FROM OLD.review_status THEN
  IF NEW.review_status='VALIDATED' THEN notification_kind='HOUSE_APPROVED';
  ELSIF NEW.review_status='REFUSED' THEN notification_kind='HOUSE_REFUSED'; END IF;
 END IF;
 IF notification_kind IS NOT NULL THEN
  INSERT INTO email_outbox(user_id,season_id,participation_id,review_revision,kind,idempotency_key)
  SELECT NEW.user_id,NEW.season_id,NEW.id,NEW.review_revision,notification_kind,NEW.id::text||':'||NEW.review_revision::text||':'||notification_kind
  FROM seasons s JOIN users u ON u.id=NEW.user_id WHERE s.id=NEW.season_id AND NOT s.is_test AND NOT s.archived AND s.purged_at IS NULL AND u.account_status='ACTIVE' AND u.email_status='VERIFIED'
  ON CONFLICT(idempotency_key) DO NOTHING;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS house_email_notification ON participations;
CREATE TRIGGER house_email_notification AFTER INSERT OR UPDATE OF review_status ON participations FOR EACH ROW EXECUTE FUNCTION queue_house_notification();
