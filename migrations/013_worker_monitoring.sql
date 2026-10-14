-- A successful PostgreSQL SELECT alone is not a worker health signal.
-- This singleton heartbeat records completed processing cycles and overdue outbox counts.
-- No recipient data, private messages or error strings are persisted here.
CREATE TABLE IF NOT EXISTS worker_health (
  worker_name text PRIMARY KEY,
  last_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_success_at timestamptz,
  last_error_at timestamptz,
  consecutive_failures integer NOT NULL DEFAULT 0 CHECK (consecutive_failures >= 0),
  overdue_outbox integer NOT NULL DEFAULT 0 CHECK (overdue_outbox >= 0),
  oldest_overdue_at timestamptz
);
