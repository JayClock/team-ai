-- Knowledge graph persistence for published diagrams.
-- Use PostgreSQL-native recursive CTE for traversal and pgvector when extension is available.

CREATE TABLE kg_publish_jobs (
    id BIGSERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    diagram_id INTEGER NOT NULL REFERENCES diagrams(id) ON DELETE CASCADE,
    status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    attempt_count INTEGER NOT NULL DEFAULT 0,
    requested_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMP(6),
    finished_at TIMESTAMP(6),
    next_run_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_error TEXT,
    updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_kg_publish_jobs_project_diagram UNIQUE (project_id, diagram_id)
);

CREATE INDEX idx_kg_publish_jobs_status_next_run
    ON kg_publish_jobs(status, next_run_at);

CREATE TABLE kg_nodes (
    id BIGSERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    logical_entity_id INTEGER NOT NULL REFERENCES logical_entities(id) ON DELETE CASCADE,
    logical_entity_type VARCHAR(64) NOT NULL,
    logical_entity_sub_type VARCHAR(128),
    logical_entity_name VARCHAR(255) NOT NULL,
    logical_entity_label VARCHAR(255),
    logical_entity_definition JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_kg_nodes_project_entity UNIQUE (project_id, logical_entity_id)
);

CREATE INDEX idx_kg_nodes_project_type
    ON kg_nodes(project_id, logical_entity_type);

CREATE TABLE kg_edges (
    id BIGSERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    diagram_id INTEGER NOT NULL REFERENCES diagrams(id) ON DELETE CASCADE,
    source_node_id INTEGER,
    target_node_id INTEGER,
    source_logical_entity_id INTEGER NOT NULL REFERENCES logical_entities(id) ON DELETE CASCADE,
    target_logical_entity_id INTEGER NOT NULL REFERENCES logical_entities(id) ON DELETE CASCADE,
    relation_type VARCHAR(64) NOT NULL,
    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_kg_edges_project_diagram_relation UNIQUE (
        project_id,
        diagram_id,
        source_logical_entity_id,
        target_logical_entity_id,
        relation_type
    )
);

CREATE INDEX idx_kg_edges_project_source
    ON kg_edges(project_id, source_logical_entity_id);

CREATE INDEX idx_kg_edges_project_target
    ON kg_edges(project_id, target_logical_entity_id);

CREATE INDEX idx_kg_edges_project_diagram
    ON kg_edges(project_id, diagram_id);

CREATE TABLE kg_embeddings (
    id BIGSERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    logical_entity_id INTEGER NOT NULL REFERENCES logical_entities(id) ON DELETE CASCADE,
    source_text TEXT NOT NULL,
    embedding DOUBLE PRECISION[] NOT NULL,
    updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_kg_embeddings_project_entity UNIQUE (project_id, logical_entity_id)
);

CREATE INDEX idx_kg_embeddings_project_entity
    ON kg_embeddings(project_id, logical_entity_id);

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'vector') THEN
        CREATE EXTENSION IF NOT EXISTS vector;
        ALTER TABLE kg_embeddings
            ADD COLUMN IF NOT EXISTS embedding_vector vector(8);
        CREATE INDEX IF NOT EXISTS idx_kg_embeddings_vector_l2
            ON kg_embeddings
            USING ivfflat (embedding_vector vector_l2_ops)
            WITH (lists = 100);
    END IF;
END $$;
