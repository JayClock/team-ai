-- Add sub_type column to logical_entities for Fulfillment Modeling
-- Sub-type format: "TYPE_PREFIX:value" (e.g., "EVIDENCE:rfp", "ROLE:party_role")

ALTER TABLE logical_entities
ADD COLUMN sub_type VARCHAR(64);

-- Add index for sub_type queries
CREATE INDEX idx_logical_entities_sub_type ON logical_entities(project_id, sub_type);

COMMENT ON COLUMN logical_entities.sub_type IS 'Fulfillment Modeling sub-type. Format: PREFIX:value. Examples: EVIDENCE:rfp, PARTICIPANT:party, ROLE:domain_logic_role, CONTEXT:bounded_context';



