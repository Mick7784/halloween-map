-- Executed transactionally by the migration runner. Guards also permit replay.
DO $$ BEGIN
 IF to_regclass('participations') IS NULL THEN ALTER TABLE houses RENAME TO participations; END IF;
END $$;
ALTER TABLE participations DROP CONSTRAINT IF EXISTS houses_user_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS participation_user_season ON participations(user_id,season_id);
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_status text NOT NULL DEFAULT 'UNVERIFIED' CHECK(email_status IN('UNVERIFIED','VERIFIED','BOUNCED','INVALID'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS account_status text NOT NULL DEFAULT 'ACTIVE' CHECK(account_status IN('ACTIVE','DISABLED','PENDING_ACTIVATION'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS permission_grants text[] NOT NULL DEFAULT '{}';
ALTER TABLE users ADD COLUMN IF NOT EXISTS permission_revocations text[] NOT NULL DEFAULT '{}';
ALTER TABLE participations ADD COLUMN IF NOT EXISTS legacy_imported boolean NOT NULL DEFAULT true;
ALTER TABLE participations ALTER COLUMN legacy_imported SET DEFAULT false;
ALTER TABLE participations ADD COLUMN IF NOT EXISTS terms_version text;
ALTER TABLE participations ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz;
ALTER TABLE participations ADD COLUMN IF NOT EXISTS guidelines_version text;
ALTER TABLE participations ADD COLUMN IF NOT EXISTS guidelines_accepted_at timestamptz;
INSERT INTO roles(instance_id,name,permissions) SELECT id,'PARTICIPANT','{}' FROM instances ON CONFLICT DO NOTHING;
UPDATE users u SET role_id=r.id FROM roles r WHERE u.role_id IS NULL AND r.instance_id=u.instance_id AND r.name='PARTICIPANT';
UPDATE roles SET permissions=(SELECT ARRAY(SELECT DISTINCT p FROM unnest(permissions || CASE WHEN name IN('SUPER_ADMIN','LOCAL_ADMIN') THEN ARRAY['admin.access','communications.read','communications.manage','content.manage'] ELSE ARRAY['admin.access'] END) p)) WHERE name IN('SUPER_ADMIN','LOCAL_ADMIN','MODERATOR','READ_ONLY') OR permissions && ARRAY['participants.read','participants.validate','participants.edit','participants.delete','users.read','users.manage','season.read','season.manage','season.preview','settings.read','settings.manage','stats.read','audit.read','roles.manage']::text[];
CREATE TABLE IF NOT EXISTS email_tokens(
 token_hash text PRIMARY KEY,user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
 kind text NOT NULL CHECK(kind IN('VERIFY','INVITE','ACTIVATE')), email_hash text NOT NULL,
 expires_at timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS email_campaigns(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),instance_id uuid NOT NULL REFERENCES instances ON DELETE CASCADE,
 season_id uuid NOT NULL, name text NOT NULL,subject text NOT NULL,body text NOT NULL,
 audience text NOT NULL DEFAULT 'ALL' CHECK(audience IN('ALL','APPROVED','PENDING','ACTIVE')),
 active boolean NOT NULL DEFAULT false,schedule_mode text NOT NULL DEFAULT 'ABSOLUTE' CHECK(schedule_mode IN('ABSOLUTE','RELATIVE')),
 anchor text NOT NULL DEFAULT 'opens_at' CHECK(anchor IN('opens_at','closes_at','registrations_open_at','purge_at')),
 offset_days integer NOT NULL DEFAULT 0 CHECK(offset_days BETWEEN -365 AND 365),scheduled_at timestamptz NOT NULL,
 status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN('DRAFT','SCHEDULED','SENDING','SENT','FAILED','CANCELLED')),
 recipients integer NOT NULL DEFAULT 0,sent integer NOT NULL DEFAULT 0,errors integer NOT NULL DEFAULT 0,
 legacy boolean NOT NULL DEFAULT false,created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(season_id,instance_id) REFERENCES seasons(id,instance_id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS campaign_legacy_season ON email_campaigns(season_id) WHERE legacy;
CREATE TABLE IF NOT EXISTS email_outbox(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
 season_id uuid REFERENCES seasons ON DELETE CASCADE,campaign_id uuid REFERENCES email_campaigns ON DELETE CASCADE,
 kind text NOT NULL CHECK(kind IN('VERIFY','INVITE','CAMPAIGN','TEST')),
 scheduled_at timestamptz NOT NULL DEFAULT now(),status text NOT NULL DEFAULT 'PENDING' CHECK(status IN('PENDING','CLAIMED','SENT','FAILED','CANCELLED')),
 attempts integer NOT NULL DEFAULT 0,claimed_at timestamptz,sent_at timestamptz,last_error text,
 retry_safe boolean NOT NULL DEFAULT false,idempotency_key text NOT NULL UNIQUE,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS outbox_due ON email_outbox(status,scheduled_at);
-- A sent reminder keeps totals only. An in-flight delivery retains its claim:
-- uncertainty must never turn into another voluntary SMTP send.
INSERT INTO email_campaigns(instance_id,season_id,name,subject,body,active,scheduled_at,status,recipients,sent,legacy)
 SELECT instance_id,id,'Rappel V0.2',CASE WHEN reminder_status='SENT' THEN '' ELSE reminder_subject END,
 CASE WHEN reminder_status='SENT' THEN '' ELSE reminder_body END,reminder_enabled,
 COALESCE(reminder_at,opens_at),CASE reminder_status WHEN 'SENT' THEN 'SENT' WHEN 'SENDING' THEN 'SENDING' WHEN 'ERROR' THEN 'FAILED' WHEN 'SCHEDULED' THEN 'SCHEDULED' ELSE 'DRAFT' END,
 reminder_recipients,reminder_sent,true FROM seasons WHERE reminder_status<>'NONE' ON CONFLICT DO NOTHING;
INSERT INTO email_outbox(user_id,season_id,campaign_id,kind,scheduled_at,status,claimed_at,idempotency_key)
 SELECT d.user_id,d.season_id,c.id,'CAMPAIGN',c.scheduled_at,
 CASE d.status WHEN 'QUEUED' THEN 'PENDING' WHEN 'CLAIMED' THEN 'CLAIMED' WHEN 'SENT' THEN 'SENT' ELSE 'FAILED' END,d.claimed_at,c.id::text||':'||d.user_id::text
 FROM reminder_deliveries d JOIN email_campaigns c ON c.season_id=d.season_id AND c.legacy WHERE c.status<>'SENT' ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS content_overrides(instance_id uuid NOT NULL REFERENCES instances ON DELETE CASCADE,key text NOT NULL,value text NOT NULL,updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(instance_id,key));
CREATE TABLE IF NOT EXISTS legal_documents(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),instance_id uuid NOT NULL REFERENCES instances ON DELETE CASCADE,
 kind text NOT NULL CHECK(kind IN('TERMS','GUIDELINES','PRIVACY','NOTICE')),version text NOT NULL,title text NOT NULL,body text NOT NULL,
 status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN('DRAFT','PUBLISHED')),active boolean NOT NULL DEFAULT false,
 requires_reaccept boolean NOT NULL DEFAULT false,published_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(instance_id,kind,version)
);
CREATE UNIQUE INDEX IF NOT EXISTS legal_active ON legal_documents(instance_id,kind) WHERE active;
CREATE OR REPLACE FUNCTION immutable_published_document() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF OLD.status='PUBLISHED' AND (NEW.body,NEW.title,NEW.version,NEW.kind,NEW.published_at,NEW.requires_reaccept,NEW.status,NEW.instance_id) IS DISTINCT FROM (OLD.body,OLD.title,OLD.version,OLD.kind,OLD.published_at,OLD.requires_reaccept,OLD.status,OLD.instance_id) THEN RAISE EXCEPTION 'Published documents are immutable'; END IF; RETURN NEW; END $$;
DROP TRIGGER IF EXISTS immutable_document ON legal_documents;
CREATE TRIGGER immutable_document BEFORE UPDATE ON legal_documents FOR EACH ROW EXECUTE FUNCTION immutable_published_document();

-- Retired V0.2 transport is no longer a second copy of seasonal messages.
DELETE FROM reminder_deliveries;
UPDATE seasons SET reminder_enabled=false,reminder_subject='',reminder_body='';

INSERT INTO content_overrides(instance_id,key,value) SELECT id,'footer.signature',config->>'footer' FROM instances WHERE config->>'footer' IS NOT NULL AND config->>'footer'<>'Une expérience DomotiK Studio' ON CONFLICT DO NOTHING;
