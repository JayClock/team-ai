-- Create diagram_versions table for snapshot-based version history
CREATE TABLE diagram_versions (
    id              SERIAL PRIMARY KEY,
    diagram_id      INTEGER NOT NULL REFERENCES diagrams(id) ON DELETE CASCADE,

    -- Version identifier, e.g. v1, v2...
    version_name    VARCHAR(64) NOT NULL,

    -- Full snapshot of nodes, edges and viewport
    snapshot_data   JSONB NOT NULL,

    created_at      TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_diagram_versions_diagram ON diagram_versions(diagram_id);
