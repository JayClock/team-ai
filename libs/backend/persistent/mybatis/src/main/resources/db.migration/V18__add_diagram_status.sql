-- Add publish workflow status for diagrams
ALTER TABLE diagrams
ADD COLUMN status VARCHAR(32) NOT NULL DEFAULT 'draft';

ALTER TABLE diagrams
ADD CONSTRAINT chk_diagrams_status
CHECK (status IN ('draft', 'published'));
