CREATE TABLE IF NOT EXISTS integration_configs (
  id uuid PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('SUPPLIER','CHANNEL','PROVIDER')),
  provider_key text NOT NULL,
  name text NOT NULL,
  environment text NOT NULL DEFAULT 'PRODUCTION' CHECK (environment IN ('SANDBOX','PRODUCTION')),
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','CONFIGURED','TESTED','ACTIVE','ERROR','DISABLED')),
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  encrypted_secrets text,
  secret_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  capabilities jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_tested_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS integration_configs_kind_idx ON integration_configs(kind, updated_at DESC);
CREATE TABLE IF NOT EXISTS brand_store_bindings (
  id uuid PRIMARY KEY,
  brand_name text NOT NULL,
  store_name text NOT NULL,
  integration_id uuid REFERENCES integration_configs(id),
  status text NOT NULL DEFAULT 'INACTIVE' CHECK (status IN ('ACTIVE','INACTIVE')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(brand_name, store_name, integration_id)
);
CREATE TABLE IF NOT EXISTS integration_test_runs (
  id uuid PRIMARY KEY,
  integration_id uuid NOT NULL REFERENCES integration_configs(id),
  status text NOT NULL CHECK (status IN ('SUCCEEDED','FAILED')),
  message text NOT NULL,
  checked_at timestamptz NOT NULL DEFAULT now()
);
