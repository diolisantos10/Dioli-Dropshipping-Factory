CREATE TABLE IF NOT EXISTS real_models (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  brand text NOT NULL,
  measurements jsonb NOT NULL DEFAULT '{}',
  photos jsonb NOT NULL DEFAULT '[]',
  notes text NOT NULL DEFAULT '',
  revision integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);
