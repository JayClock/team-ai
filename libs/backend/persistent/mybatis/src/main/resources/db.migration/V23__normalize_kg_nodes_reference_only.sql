-- Keep knowledge graph nodes as lightweight references to logical_entities.
-- Canonical fields (type/sub_type/name/label/definition) must come from logical_entities.

DROP INDEX IF EXISTS idx_kg_nodes_project_type;

ALTER TABLE kg_nodes
    DROP COLUMN IF EXISTS logical_entity_type,
    DROP COLUMN IF EXISTS logical_entity_sub_type,
    DROP COLUMN IF EXISTS logical_entity_name,
    DROP COLUMN IF EXISTS logical_entity_label,
    DROP COLUMN IF EXISTS logical_entity_definition;
