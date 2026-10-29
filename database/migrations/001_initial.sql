CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

DO $$ BEGIN
  CREATE TYPE location_zone AS ENUM (
    'HALL_OF_RESIDENCE', 'LECTURE_THEATRE', 'FACULTY', 'COMMON_AREA', 'TRANSIT_ROUTE'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE item_type AS ENUM ('LOST', 'FOUND');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE item_category AS ENUM (
    'ELECTRONICS', 'ID_CARDS_DOCUMENTS', 'CLOTHING_ACCESSORIES', 'KEYS', 'BOOKS', 'OTHER'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE item_status AS ENUM ('OPEN', 'CLAIM_PENDING', 'RESOLVED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE claim_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name VARCHAR(160) NOT NULL,
  email VARCHAR(254) NOT NULL UNIQUE,
  phone_number VARCHAR(20) NOT NULL,
  whatsapp_number VARCHAR(20) NOT NULL,
  matric_number VARCHAR(40) NOT NULL UNIQUE,
  department VARCHAR(160) NOT NULL,
  password_hash TEXT NOT NULL,
  is_verified BOOLEAN NOT NULL DEFAULT FALSE,
  verification_token_hash TEXT,
  verification_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT users_oau_email CHECK (email ~* '^[^@]+@(student\.oauife\.edu\.ng|oauife\.edu\.ng)$')
);

CREATE TABLE IF NOT EXISTS locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(160) NOT NULL UNIQUE,
  zone location_zone NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type item_type NOT NULL,
  category item_category NOT NULL,
  title VARCHAR(180) NOT NULL,
  description TEXT NOT NULL,
  location_id UUID REFERENCES locations(id) ON DELETE SET NULL,
  custom_location VARCHAR(240),
  date_event_occurred TIMESTAMPTZ NOT NULL,
  image_urls TEXT[] NOT NULL DEFAULT '{}',
  status item_status NOT NULL DEFAULT 'OPEN',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE items ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE TABLE IF NOT EXISTS claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  claimant_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  proof_of_ownership TEXT NOT NULL,
  status claim_status NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS items_reporter_id_idx ON items(reporter_id);
CREATE INDEX IF NOT EXISTS items_location_id_idx ON items(location_id);
CREATE INDEX IF NOT EXISTS items_status_created_idx ON items(status, created_at DESC);
CREATE INDEX IF NOT EXISTS items_type_category_idx ON items(type, category);
CREATE INDEX IF NOT EXISTS items_title_search_idx ON items USING GIN (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS items_description_search_idx ON items USING GIN (description gin_trgm_ops);
CREATE INDEX IF NOT EXISTS claims_item_id_idx ON claims(item_id);
CREATE INDEX IF NOT EXISTS claims_claimant_id_idx ON claims(claimant_id);
CREATE INDEX IF NOT EXISTS claims_status_idx ON claims(status);
CREATE UNIQUE INDEX IF NOT EXISTS claims_one_pending_per_user_item_idx
  ON claims(item_id, claimant_id) WHERE status = 'PENDING';
CREATE UNIQUE INDEX IF NOT EXISTS claims_one_approved_per_item_idx
  ON claims(item_id) WHERE status = 'APPROVED';

-- Configure the public image bucket when this migration runs in Supabase.
DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    EXECUTE $sql$
      INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
      VALUES ('item-images', 'item-images', TRUE, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp'])
      ON CONFLICT (id) DO UPDATE SET
        public = EXCLUDED.public,
        file_size_limit = EXCLUDED.file_size_limit,
        allowed_mime_types = EXCLUDED.allowed_mime_types
    $sql$;
  END IF;
END $$;
