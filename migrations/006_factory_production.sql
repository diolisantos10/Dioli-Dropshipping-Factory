CREATE TABLE IF NOT EXISTS factory_production_runs (
  candidate_id text PRIMARY KEY,
  product_id text,
  status text NOT NULL CHECK (status IN ('PROCESSING','BLOCKED','FAILED','READY')),
  stage text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  attempts integer NOT NULL DEFAULT 0,
  started_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  lease_until timestamptz
);
