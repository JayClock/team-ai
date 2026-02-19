-- Self-healing migration for legacy environments:
-- 1) Ensure diagrams.status exists
-- 2) Backfill pre-existing rows
-- 3) Re-assert default/constraint
ALTER TABLE diagrams
ADD COLUMN IF NOT EXISTS status VARCHAR(32);

UPDATE diagrams
SET status = 'published',
    updated_at = CURRENT_TIMESTAMP
WHERE status IS NULL OR status = 'draft';

ALTER TABLE diagrams
ALTER COLUMN status SET DEFAULT 'draft';

ALTER TABLE diagrams
ALTER COLUMN status SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_diagrams_status'
      AND conrelid = 'diagrams'::regclass
  ) THEN
    ALTER TABLE diagrams
    ADD CONSTRAINT chk_diagrams_status
    CHECK (status IN ('draft', 'published'));
  END IF;
END
$$;
