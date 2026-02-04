-- Create logical_entities table for model-driven design
CREATE TABLE logical_entities (
    id              SERIAL PRIMARY KEY,
    project_id      INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    
    -- Entity type: AGGREGATE, ENTITY, VALUE_OBJECT, EVENT, COMMAND, ACTOR
    type            VARCHAR(32) NOT NULL,
    
    -- Names
    name            VARCHAR(255) NOT NULL,  -- English name (for code), e.g., "Order"
    label           VARCHAR(255),           -- Chinese name (for product), e.g., "销售订单"
    
    -- Core definition (JSONB)
    -- Stores business meaning, fields, methods, business rules description
    definition      JSONB DEFAULT '{}',
    
    -- Status: DRAFT, REVIEWED, DEPRECATED
    status          VARCHAR(32) DEFAULT 'DRAFT',
    
    created_at      TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_logical_entities_project ON logical_entities(project_id);
CREATE INDEX idx_logical_entities_type ON logical_entities(project_id, type);
