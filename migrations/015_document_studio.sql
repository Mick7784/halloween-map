ALTER TABLE legal_documents ADD COLUMN IF NOT EXISTS format text NOT NULL DEFAULT 'markdown' CHECK(format IN ('markdown','tiptap'));
ALTER TABLE legal_documents ADD COLUMN IF NOT EXISTS content_json jsonb;
ALTER TABLE legal_documents ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 1;
ALTER TABLE legal_documents ADD COLUMN IF NOT EXISTS base_version text;
ALTER TABLE legal_documents ADD COLUMN IF NOT EXISTS prepared boolean NOT NULL DEFAULT false;
ALTER TABLE legal_documents ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES users ON DELETE SET NULL;
ALTER TABLE legal_documents ADD COLUMN IF NOT EXISTS published_by uuid REFERENCES users ON DELETE SET NULL;
ALTER TABLE legal_documents ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE OR REPLACE FUNCTION immutable_published_document() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' AND OLD.status='PUBLISHED' THEN RAISE EXCEPTION 'Published documents cannot be deleted'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 IF OLD.status='PUBLISHED' AND (NEW.body,NEW.title,NEW.version,NEW.kind,NEW.published_at,NEW.requires_reaccept,NEW.status,NEW.instance_id,NEW.format,NEW.content_json,NEW.revision,NEW.prepared,NEW.base_version) IS DISTINCT FROM (OLD.body,OLD.title,OLD.version,OLD.kind,OLD.published_at,OLD.requires_reaccept,OLD.status,OLD.instance_id,OLD.format,OLD.content_json,OLD.revision,OLD.prepared,OLD.base_version) THEN RAISE EXCEPTION 'Published documents are immutable'; END IF; RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS immutable_document ON legal_documents;
CREATE TRIGGER immutable_document BEFORE UPDATE OR DELETE ON legal_documents FOR EACH ROW EXECUTE FUNCTION immutable_published_document();

-- Evidence is independent of ephemeral participations and the 90-day audit log.
CREATE TABLE IF NOT EXISTS legal_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 instance_id uuid NOT NULL REFERENCES instances ON DELETE CASCADE,
 user_id uuid REFERENCES users ON DELETE SET NULL,
 document_id uuid REFERENCES legal_documents,
 kind text NOT NULL CHECK(kind IN ('TERMS','GUIDELINES','PRIVACY','NOTICE')),
 version text NOT NULL,
 action text NOT NULL CHECK(action IN ('PUBLISHED','ACCEPTED','ACKNOWLEDGED')),
 occurred_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT (now()+interval '5 years')
);
CREATE INDEX IF NOT EXISTS legal_events_retention ON legal_events(expires_at);
CREATE INDEX IF NOT EXISTS legal_events_user ON legal_events(instance_id,user_id);
CREATE UNIQUE INDEX IF NOT EXISTS legal_events_import_identity ON legal_events(instance_id,user_id,kind,version,action,occurred_at);
-- Import only acceptance timestamps that already exist; never infer TERMS from
-- a GUIDELINES_ONLY version field or reconstruct timestamps from audit logs.
INSERT INTO legal_events(instance_id,user_id,document_id,kind,version,action,occurred_at,expires_at)
SELECT DISTINCT p.instance_id,p.user_id,d.id,'TERMS',p.terms_version,'ACCEPTED',p.terms_accepted_at,p.terms_accepted_at+interval '5 years'
FROM participations p LEFT JOIN legal_documents d ON d.instance_id=p.instance_id AND d.kind='TERMS' AND d.version=p.terms_version AND d.status='PUBLISHED'
WHERE p.terms_accepted_at IS NOT NULL AND p.terms_version IS NOT NULL ON CONFLICT DO NOTHING;
INSERT INTO legal_events(instance_id,user_id,document_id,kind,version,action,occurred_at,expires_at)
SELECT DISTINCT p.instance_id,p.user_id,d.id,'GUIDELINES',p.guidelines_version,'ACKNOWLEDGED',p.guidelines_accepted_at,p.guidelines_accepted_at+interval '5 years'
FROM participations p LEFT JOIN legal_documents d ON d.instance_id=p.instance_id AND d.kind='GUIDELINES' AND d.version=p.guidelines_version AND d.status='PUBLISHED'
WHERE p.guidelines_accepted_at IS NOT NULL AND p.guidelines_version IS NOT NULL ON CONFLICT DO NOTHING;
