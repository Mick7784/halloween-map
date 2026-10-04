CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), singleton boolean UNIQUE NOT NULL DEFAULT true CHECK (singleton),
  public_name text NOT NULL, territory text NOT NULL, postal_code text NOT NULL, country text NOT NULL,
  timezone text NOT NULL DEFAULT 'Europe/Paris', latitude double precision NOT NULL, longitude double precision NOT NULL,
  zoom integer NOT NULL DEFAULT 13 CHECK (zoom BETWEEN 2 AND 18), plan text NOT NULL DEFAULT 'COMMUNITY' CHECK (plan IN ('COMMUNITY','PRO')),
  config jsonb NOT NULL DEFAULT '{"flags":{},"quotas":{},"footer":"Une expérience DomotiK Studio","defaultOpen":"10-31T12:00","defaultClose":"11-01T00:00"}', active_season_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), instance_id uuid NOT NULL REFERENCES instances ON DELETE CASCADE,
  name text NOT NULL, permissions text[] NOT NULL, UNIQUE(instance_id,name), UNIQUE(id,instance_id)
);
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), instance_id uuid NOT NULL REFERENCES instances ON DELETE CASCADE,
  email text NOT NULL, display_name text NOT NULL, password_hash text NOT NULL, role_id uuid,
  kind text NOT NULL CHECK (kind IN ('STAFF','PARTICIPANT')), demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(instance_id,email), UNIQUE(id,instance_id),
  FOREIGN KEY(role_id,instance_id) REFERENCES roles(id,instance_id)
);
CREATE TABLE seasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), instance_id uuid NOT NULL REFERENCES instances ON DELETE CASCADE,
  year integer NOT NULL, activated boolean NOT NULL DEFAULT false, registrations_open boolean NOT NULL DEFAULT true,
  opens_at timestamptz NOT NULL, closes_at timestamptz NOT NULL, archived boolean NOT NULL DEFAULT false,
  purged_at timestamptz, stats jsonb NOT NULL DEFAULT '{}', routes_count integer NOT NULL DEFAULT 0,
  CHECK(closes_at > opens_at), UNIQUE(instance_id,year), UNIQUE(id,instance_id)
);
ALTER TABLE instances ADD CONSTRAINT active_season_fk FOREIGN KEY(active_season_id,id) REFERENCES seasons(id,instance_id);
CREATE TABLE houses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), instance_id uuid NOT NULL REFERENCES instances ON DELETE CASCADE,
  season_id uuid NOT NULL, user_id uuid NOT NULL UNIQUE,
  name text NOT NULL, address text NOT NULL, latitude double precision NOT NULL CHECK(latitude BETWEEN -90 AND 90),
  longitude double precision NOT NULL CHECK(longitude BETWEEN -180 AND 180),
  activities text[] NOT NULL CHECK(cardinality(activities) > 0 AND activities <@ ARRAY['DECORATION','CANDY','ACTING']::text[]),
  starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL, fear integer NOT NULL CHECK(fear BETWEEN 1 AND 5),
  adaptable boolean NOT NULL DEFAULT false, rp text NOT NULL DEFAULT '', practical text NOT NULL DEFAULT '',
  candy_available boolean NOT NULL DEFAULT true, status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','APPROVED','REJECTED','DISABLED')),
  activity text NOT NULL DEFAULT 'ACTIVE' CHECK(activity IN ('ACTIVE','PAUSED','ENDED')), demo boolean NOT NULL DEFAULT false,
  CHECK(ends_at > starts_at), FOREIGN KEY(season_id,instance_id) REFERENCES seasons(id,instance_id) ON DELETE CASCADE,
  FOREIGN KEY(user_id,instance_id) REFERENCES users(id,instance_id) ON DELETE CASCADE
);
CREATE INDEX houses_visibility ON houses(instance_id,season_id,status,activity,ends_at);
CREATE TABLE sessions (
  token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE audit_logs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, instance_id uuid NOT NULL REFERENCES instances ON DELETE CASCADE,
  actor_id uuid REFERENCES users ON DELETE SET NULL, action text NOT NULL, target_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE rate_limits (key text PRIMARY KEY, hits integer NOT NULL, reset_at timestamptz NOT NULL);
