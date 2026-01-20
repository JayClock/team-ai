ALTER TABLE conversations
  DROP CONSTRAINT IF EXISTS conversations_user_id_fkey,
  DROP COLUMN IF EXISTS user_id;
