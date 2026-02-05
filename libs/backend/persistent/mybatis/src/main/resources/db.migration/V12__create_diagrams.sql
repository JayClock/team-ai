-- Create diagrams table for canvas/view layer
CREATE TABLE diagrams (
    id              SERIAL PRIMARY KEY,
    project_id      INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

    -- Diagram metadata
    title           VARCHAR(255) NOT NULL,  -- e.g. "下单流程上下文图"
    type            VARCHAR(32) NOT NULL,    -- FLOWCHART, SEQUENCE, CLASS, COMPONENT, STATE, ACTIVITY

    -- Viewport state (JSONB)
    viewport        JSONB DEFAULT '{"x": 0, "y": 0, "zoom": 1}',

    created_at      TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_diagrams_project ON diagrams(project_id);
CREATE INDEX idx_diagrams_type ON diagrams(project_id, type);
