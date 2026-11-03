CREATE TABLE IF NOT EXISTS revoked_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, token_hash)
);

CREATE INDEX IF NOT EXISTS revoked_tokens_user_id_idx ON revoked_tokens(user_id);
CREATE INDEX IF NOT EXISTS revoked_tokens_token_hash_idx ON revoked_tokens(token_hash);
CREATE INDEX IF NOT EXISTS revoked_tokens_expires_at_idx ON revoked_tokens(expires_at);
