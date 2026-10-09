CREATE TABLE IF NOT EXISTS brand_discovery_briefs (
  brand_key text PRIMARY KEY,
  brief jsonb NOT NULL,
  cursor integer NOT NULL DEFAULT 0,
  last_run_at timestamptz,
  last_status text NOT NULL DEFAULT 'WAITING',
  last_message text NOT NULL DEFAULT '',
  daily_date text,
  daily_imported integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
