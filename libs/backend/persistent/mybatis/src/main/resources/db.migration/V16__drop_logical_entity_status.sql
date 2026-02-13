-- Remove obsolete status field from logical_entities
ALTER TABLE logical_entities
DROP COLUMN IF EXISTS status;
