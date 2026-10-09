CREATE TABLE IF NOT EXISTS supplier_media_archive (
  source_url text PRIMARY KEY,
  blob_id uuid NOT NULL REFERENCES media_blobs(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
