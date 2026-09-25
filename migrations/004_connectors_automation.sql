-- OAuth handshakes, credential lifecycle, channel listings and automation runs.
CREATE TABLE IF NOT EXISTS oauth_states (
  state text PRIMARY KEY,
  provider_key text NOT NULL,
  integration_id uuid NOT NULL REFERENCES integration_configs(id),
  shop text,
  actor text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at timestamptz
);
CREATE INDEX IF NOT EXISTS oauth_states_expiry_idx ON oauth_states(expires_at);

ALTER TABLE integration_configs ADD COLUMN IF NOT EXISTS credential_expires_at timestamptz;
ALTER TABLE integration_configs ADD COLUMN IF NOT EXISTS connected_account text;

CREATE TABLE IF NOT EXISTS channel_listings (
  id uuid PRIMARY KEY,
  integration_id uuid NOT NULL REFERENCES integration_configs(id),
  product_id text NOT NULL,
  price_calculation_id text NOT NULL,
  external_id text NOT NULL,
  handle text NOT NULL DEFAULT '',
  admin_url text NOT NULL DEFAULT '',
  status text NOT NULL,
  price numeric(18,4) NOT NULL,
  currency text NOT NULL,
  actor text NOT NULL,
  published_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(integration_id, product_id),
  UNIQUE(integration_id, external_id)
);

CREATE TABLE IF NOT EXISTS automation_runs (
  id uuid PRIMARY KEY,
  trigger text NOT NULL,
  actor text NOT NULL,
  correlation_id uuid NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL CHECK (status IN ('RUNNING','SUCCEEDED','PARTIAL','FAILED')),
  results jsonb NOT NULL DEFAULT '[]'::jsonb
);
CREATE INDEX IF NOT EXISTS automation_runs_started_idx ON automation_runs(started_at DESC);
