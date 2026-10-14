-- Email assets are retained after removal from the editor so already-sent
-- email images never break. Only random UUIDs are exposed on public URLs.
CREATE TABLE IF NOT EXISTS email_media (
  id uuid PRIMARY KEY,
  instance_id uuid NOT NULL REFERENCES instances(id) ON DELETE CASCADE,
  filename text NOT NULL,
  mime_type text NOT NULL CHECK (mime_type='image/webp'),
  sha256 text NOT NULL,
  size_bytes integer NOT NULL CHECK (size_bytes BETWEEN 1 AND 600000),
  data bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  hidden boolean NOT NULL DEFAULT false,
  UNIQUE(instance_id, sha256)
);
CREATE INDEX IF NOT EXISTS email_media_library
  ON email_media(instance_id, created_at DESC);
