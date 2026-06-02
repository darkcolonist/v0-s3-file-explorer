-- Allow multiple S3 storage connections per user.
-- Run this in the Supabase SQL editor before using multi-connection features.

ALTER TABLE user_s3_configs DROP CONSTRAINT IF EXISTS user_s3_configs_user_id_key;

ALTER TABLE user_s3_configs ADD COLUMN IF NOT EXISTS name TEXT;

UPDATE user_s3_configs
SET name = bucket
WHERE name IS NULL OR trim(name) = '';

ALTER TABLE user_s3_configs ALTER COLUMN name SET DEFAULT 'Default';
ALTER TABLE user_s3_configs ALTER COLUMN name SET NOT NULL;

CREATE INDEX IF NOT EXISTS user_s3_configs_user_id_idx ON user_s3_configs (user_id);
