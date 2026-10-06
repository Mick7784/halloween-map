-- The migration runner wraps all migrations in a transaction; safe to replay.
INSERT INTO roles(instance_id,name,permissions)
 SELECT i.id,n,'{}'::text[] FROM instances i CROSS JOIN (VALUES ('USER'),('ADMIN'),('SUPER_ADMIN')) AS names(n)
 ON CONFLICT(instance_id,name) DO NOTHING;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='permission_grants') THEN
  EXECUTE $sql$UPDATE users u SET role_id=r.id FROM roles r WHERE r.instance_id=u.instance_id AND r.name='ADMIN' AND u.permission_grants && ARRAY['admin.access','users.manage','participants.read']::text[] AND NOT EXISTS(SELECT 1 FROM roles old WHERE old.id=u.role_id AND old.name='SUPER_ADMIN')$sql$;
 END IF;
END $$;
UPDATE users u SET role_id=target.id FROM roles old,roles target
 WHERE old.id=u.role_id AND target.instance_id=u.instance_id AND target.name=
 CASE WHEN old.name='SUPER_ADMIN' THEN 'SUPER_ADMIN'
 WHEN old.name IN('ADMIN','LOCAL_ADMIN','MODERATOR','READ_ONLY') OR old.permissions && ARRAY['admin.access','users.manage','participants.read']::text[] THEN 'ADMIN' ELSE 'USER' END;
UPDATE users u SET role_id=r.id FROM roles r WHERE u.role_id IS NULL AND r.instance_id=u.instance_id AND r.name='USER';
DELETE FROM roles WHERE name NOT IN('USER','ADMIN','SUPER_ADMIN');
UPDATE roles SET permissions='{}';
ALTER TABLE users DROP COLUMN IF EXISTS permission_grants;
ALTER TABLE users DROP COLUMN IF EXISTS permission_revocations;
ALTER TABLE participations DROP CONSTRAINT IF EXISTS houses_status_check;
ALTER TABLE participations DROP CONSTRAINT IF EXISTS participations_status_check;
UPDATE participations SET status=CASE WHEN status IN('REJECTED','REFUSED','DISABLED','HIDDEN') THEN 'HIDDEN' ELSE 'VISIBLE' END;
ALTER TABLE participations ALTER COLUMN status SET DEFAULT 'VISIBLE';
ALTER TABLE participations ADD CONSTRAINT participations_status_check CHECK(status IN('VISIBLE','HIDDEN'));
ALTER TABLE email_tokens DROP CONSTRAINT IF EXISTS email_tokens_kind_check;
ALTER TABLE email_tokens ADD CONSTRAINT email_tokens_kind_check CHECK(kind IN('VERIFY','INVITE','ACTIVATE','RESET'));
ALTER TABLE email_outbox DROP CONSTRAINT IF EXISTS email_outbox_kind_check;
ALTER TABLE email_outbox ADD CONSTRAINT email_outbox_kind_check CHECK(kind IN('VERIFY','INVITE','RESET','CAMPAIGN','TEST'));
ALTER TABLE email_campaigns DROP CONSTRAINT IF EXISTS email_campaigns_audience_check;
UPDATE email_campaigns SET audience=CASE WHEN audience='APPROVED' THEN 'VISIBLE' WHEN audience='PENDING' THEN 'ALL' ELSE audience END;
ALTER TABLE email_campaigns ADD CONSTRAINT email_campaigns_audience_check CHECK(audience IN('ALL','VISIBLE','ACTIVE'));
DO $ BEGIN
 IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='sessions' AND column_name='preview_at') THEN
  UPDATE sessions SET preview_at=NULL;
 END IF;
END $;
