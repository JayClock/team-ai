-- Add sub_type column to logical_entities for Fulfillment Modeling
-- Sub-type format: "value" (e.g., "rfp", "party")

ALTER TABLE logical_entities
ADD COLUMN sub_type VARCHAR(64);

-- Add index for sub_type queries
CREATE INDEX idx_logical_entities_sub_type ON logical_entities(project_id, sub_type);

COMMENT ON COLUMN logical_entities.sub_type IS 'Fulfillment Modeling sub-type value. Examples: rfp, party, domain, bounded_context';

