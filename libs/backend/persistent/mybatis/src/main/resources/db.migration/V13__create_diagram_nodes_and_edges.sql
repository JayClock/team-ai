-- Create diagram_nodes table for visual nodes in diagrams
CREATE TABLE diagram_nodes (
    id              SERIAL PRIMARY KEY,
    diagram_id      INTEGER NOT NULL REFERENCES diagrams(id) ON DELETE CASCADE,

    -- Node type: 'class-node', 'sticky-note', 'group', etc.
    type            VARCHAR(32) NOT NULL,

    -- Reference to logical entity (null for pure drawing nodes like sticky notes)
    logical_entity_id   INTEGER REFERENCES logical_entities(id) ON DELETE SET NULL,

    -- Parent node for grouping support
    parent_id       INTEGER REFERENCES diagram_nodes(id) ON DELETE CASCADE,

    -- Position and size
    position_x      NUMERIC(19, 2) NOT NULL,
    position_y      NUMERIC(19, 2) NOT NULL,
    width           INTEGER,
    height          INTEGER,

    -- Visual override (style_config JSONB)
    -- Allows overriding styles per diagram without affecting logical entity
    style_config    JSONB DEFAULT '{}',

    -- Local data for pure drawing nodes
    -- Used when logical_entity_id is null (e.g., sticky note content)
    local_data      JSONB DEFAULT '{}',

    created_at      TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_diagram_nodes_diagram ON diagram_nodes(diagram_id);
CREATE INDEX idx_diagram_nodes_parent ON diagram_nodes(parent_id);
CREATE INDEX idx_diagram_nodes_entity ON diagram_nodes(logical_entity_id);

-- Create diagram_edges table for connections between nodes
CREATE TABLE diagram_edges (
    id              SERIAL PRIMARY KEY,
    diagram_id      INTEGER NOT NULL REFERENCES diagrams(id) ON DELETE CASCADE,

    source_node_id  INTEGER NOT NULL REFERENCES diagram_nodes(id) ON DELETE CASCADE,
    target_node_id  INTEGER NOT NULL REFERENCES diagram_nodes(id) ON DELETE CASCADE,

    -- Semantic handle positions
    source_handle   VARCHAR(128),
    target_handle   VARCHAR(128),

    -- Relationship type: ASSOCIATION, INHERITANCE, AGGREGATION, FLOW, DEPENDENCY
    relation_type   VARCHAR(32),

    -- Edge label
    label           VARCHAR(255),

    -- Style properties (JSONB)
    style_props     JSONB DEFAULT '{}',

    created_at      TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_diagram_edges_diagram ON diagram_edges(diagram_id);
CREATE INDEX idx_diagram_edges_source ON diagram_edges(source_node_id);
CREATE INDEX idx_diagram_edges_target ON diagram_edges(target_node_id);
