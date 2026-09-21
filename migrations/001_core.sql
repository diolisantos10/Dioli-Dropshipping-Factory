-- DDF relational core. Additive migration: the legacy state bridge remains
-- available during the controlled transition and can be removed after cutover.
CREATE TABLE IF NOT EXISTS schema_migrations (
  version text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_events (
  id uuid PRIMARY KEY,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  actor text NOT NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  correlation_id uuid NOT NULL,
  reason text,
  before_state jsonb,
  after_state jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS audit_events_entity_idx ON audit_events(entity_type, entity_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS audit_events_correlation_idx ON audit_events(correlation_id);

CREATE TABLE IF NOT EXISTS outbox_events (
  id uuid PRIMARY KEY,
  topic text NOT NULL,
  aggregate_type text NOT NULL,
  aggregate_id text NOT NULL,
  payload jsonb NOT NULL,
  idempotency_key text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','PROCESSING','PUBLISHED','FAILED','DEAD')),
  attempts integer NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  last_error text
);
CREATE INDEX IF NOT EXISTS outbox_pending_idx ON outbox_events(status, available_at);

CREATE TABLE IF NOT EXISTS raw_candidates (
  id uuid PRIMARY KEY,
  source text NOT NULL CHECK (source IN ('MANUAL','TREND')),
  source_url text NOT NULL,
  normalized_url text NOT NULL UNIQUE,
  name text NOT NULL,
  notes text NOT NULL DEFAULT '',
  region text,
  category_hint text,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL CHECK (status IN ('CANDIDATO','TRIADO','APROVADO','REJEITADO','ARQUIVADO')),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS triage_decisions (
  id uuid PRIMARY KEY,
  candidate_id uuid NOT NULL REFERENCES raw_candidates(id),
  before_status text,
  after_status text NOT NULL,
  reason text NOT NULL,
  actor text NOT NULL,
  decided_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS categories (
  id uuid PRIMARY KEY,
  parent_id uuid REFERENCES categories(id),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  attribute_schema jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS master_products (
  id uuid PRIMARY KEY,
  candidate_id uuid UNIQUE REFERENCES raw_candidates(id),
  category_id uuid REFERENCES categories(id),
  status text NOT NULL CHECK (status IN ('EM_PRODUCAO','PRONTO','ARQUIVADO')),
  version integer NOT NULL DEFAULT 1,
  universal_title text NOT NULL,
  short_description text NOT NULL DEFAULT '',
  long_description text NOT NULL DEFAULT '',
  seo jsonb NOT NULL DEFAULT '{}'::jsonb,
  compliance jsonb NOT NULL DEFAULT '{}'::jsonb,
  localization jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS product_versions (
  product_id uuid NOT NULL REFERENCES master_products(id),
  version integer NOT NULL,
  snapshot jsonb NOT NULL,
  actor text NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(product_id, version)
);

CREATE TABLE IF NOT EXISTS product_variants (
  id uuid PRIMARY KEY,
  product_id uuid NOT NULL REFERENCES master_products(id),
  sku text UNIQUE,
  title text NOT NULL,
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  dimensions jsonb NOT NULL DEFAULT '{}'::jsonb,
  weight_grams integer CHECK (weight_grams IS NULL OR weight_grams >= 0),
  gtin text,
  status text NOT NULL DEFAULT 'ACTIVE'
);

CREATE TABLE IF NOT EXISTS media_assets (
  id uuid PRIMARY KEY,
  product_id uuid NOT NULL REFERENCES master_products(id),
  parent_asset_id uuid REFERENCES media_assets(id),
  kind text NOT NULL CHECK (kind IN ('ORIGINAL','DERIVADA')),
  status text NOT NULL CHECK (status IN ('EM_REVISAO','APROVADA','REJEITADA')),
  storage_key text NOT NULL,
  checksum text NOT NULL,
  mime_type text NOT NULL,
  bytes bigint NOT NULL CHECK (bytes >= 0),
  width integer,
  height integer,
  purpose text NOT NULL,
  provenance text NOT NULL,
  rights jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS suppliers (id uuid PRIMARY KEY, name text NOT NULL, status text NOT NULL DEFAULT 'INACTIVE');
CREATE TABLE IF NOT EXISTS supplier_connections (id uuid PRIMARY KEY, supplier_id uuid NOT NULL REFERENCES suppliers(id), adapter_key text NOT NULL, capabilities jsonb NOT NULL DEFAULT '[]'::jsonb, status text NOT NULL);
CREATE TABLE IF NOT EXISTS supplier_offers (id uuid PRIMARY KEY, supplier_id uuid NOT NULL REFERENCES suppliers(id), variant_id uuid NOT NULL REFERENCES product_variants(id), external_id text NOT NULL, currency text NOT NULL, unit_cost numeric(18,4) NOT NULL, logistics jsonb NOT NULL DEFAULT '{}'::jsonb, UNIQUE(supplier_id, external_id));
CREATE TABLE IF NOT EXISTS inventory_snapshots (id uuid PRIMARY KEY, offer_id uuid NOT NULL REFERENCES supplier_offers(id), quantity integer, availability text NOT NULL, captured_at timestamptz NOT NULL, stale_after timestamptz NOT NULL);

CREATE TABLE IF NOT EXISTS brands (id uuid PRIMARY KEY, name text NOT NULL UNIQUE, status text NOT NULL DEFAULT 'INACTIVE');
CREATE TABLE IF NOT EXISTS stores (id uuid PRIMARY KEY, brand_id uuid REFERENCES brands(id), name text NOT NULL, status text NOT NULL DEFAULT 'INACTIVE');
CREATE TABLE IF NOT EXISTS channels (id uuid PRIMARY KEY, name text NOT NULL UNIQUE, status text NOT NULL DEFAULT 'INACTIVE');
CREATE TABLE IF NOT EXISTS channel_connections (id uuid PRIMARY KEY, channel_id uuid NOT NULL REFERENCES channels(id), store_id uuid NOT NULL REFERENCES stores(id), adapter_key text NOT NULL, capabilities jsonb NOT NULL DEFAULT '[]'::jsonb, status text NOT NULL);
CREATE TABLE IF NOT EXISTS listings (id uuid PRIMARY KEY, connection_id uuid NOT NULL REFERENCES channel_connections(id), product_id uuid NOT NULL REFERENCES master_products(id), external_id text, status text NOT NULL, payload jsonb NOT NULL DEFAULT '{}'::jsonb, idempotency_key text NOT NULL UNIQUE, updated_at timestamptz NOT NULL);

CREATE TABLE IF NOT EXISTS pricing_rules (id uuid PRIMARY KEY, context jsonb NOT NULL, version integer NOT NULL, rules jsonb NOT NULL, active boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS price_calculations (id uuid PRIMARY KEY, product_id uuid NOT NULL REFERENCES master_products(id), offer_id uuid REFERENCES supplier_offers(id), context jsonb NOT NULL, version integer NOT NULL, currency text NOT NULL, components jsonb NOT NULL, suggested_price numeric(18,4), minimum_safe_price numeric(18,4), status text NOT NULL, reason text, calculated_at timestamptz NOT NULL, UNIQUE(product_id, context, version));

CREATE TABLE IF NOT EXISTS orders (id uuid PRIMARY KEY, connection_id uuid REFERENCES channel_connections(id), external_order_id text NOT NULL, status text NOT NULL, currency text NOT NULL, economic_snapshot jsonb NOT NULL, customer_ref text, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL, UNIQUE(connection_id, external_order_id));
CREATE TABLE IF NOT EXISTS order_items (id uuid PRIMARY KEY, order_id uuid NOT NULL REFERENCES orders(id), variant_id uuid REFERENCES product_variants(id), quantity integer NOT NULL CHECK (quantity > 0), sale_price numeric(18,4) NOT NULL, cost_snapshot numeric(18,4) NOT NULL);
CREATE TABLE IF NOT EXISTS supplier_orders (id uuid PRIMARY KEY, order_id uuid NOT NULL REFERENCES orders(id), supplier_id uuid NOT NULL REFERENCES suppliers(id), external_id text, status text NOT NULL, idempotency_key text NOT NULL UNIQUE);
CREATE TABLE IF NOT EXISTS fulfillments (id uuid PRIMARY KEY, supplier_order_id uuid NOT NULL REFERENCES supplier_orders(id), status text NOT NULL, updated_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS shipments (id uuid PRIMARY KEY, fulfillment_id uuid NOT NULL REFERENCES fulfillments(id), carrier text, tracking_code text, status text NOT NULL, shipped_at timestamptz);
CREATE TABLE IF NOT EXISTS tracking_events (id uuid PRIMARY KEY, shipment_id uuid NOT NULL REFERENCES shipments(id), external_event_id text, status text NOT NULL, location text, occurred_at timestamptz NOT NULL, payload jsonb NOT NULL DEFAULT '{}'::jsonb, UNIQUE(shipment_id, external_event_id));

CREATE TABLE IF NOT EXISTS sync_jobs (
  id uuid PRIMARY KEY,
  connector_type text NOT NULL,
  connector_id text NOT NULL,
  operation text NOT NULL,
  status text NOT NULL CHECK (status IN ('PENDING','RUNNING','SUCCEEDED','RETRYING','FAILED','DEAD')),
  idempotency_key text NOT NULL UNIQUE,
  attempts integer NOT NULL DEFAULT 0,
  correlation_id uuid NOT NULL,
  started_at timestamptz,
  finished_at timestamptz,
  last_error text
);

CREATE TABLE IF NOT EXISTS intelligence_metrics (
  id uuid PRIMARY KEY,
  metric_key text NOT NULL,
  dimensions jsonb NOT NULL,
  window_start timestamptz NOT NULL,
  window_end timestamptz NOT NULL,
  value numeric(24,6) NOT NULL,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  calculated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(metric_key, dimensions, window_start, window_end)
);
