CREATE TABLE IF NOT EXISTS media_blobs (
  id uuid PRIMARY KEY,
  filename text NOT NULL,
  mime_type text NOT NULL,
  bytes bigint NOT NULL CHECK (bytes >= 0),
  checksum_sha256 text NOT NULL,
  content bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS media_blobs_checksum_idx ON media_blobs(checksum_sha256);
