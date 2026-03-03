CREATE TABLE project_mcp_servers (
    id          SERIAL PRIMARY KEY,
    project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name        VARCHAR(128) NOT NULL,
    transport   VARCHAR(16) NOT NULL,
    target      TEXT NOT NULL,
    enabled     BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX ux_project_mcp_servers_project_name
    ON project_mcp_servers(project_id, name);

CREATE INDEX idx_project_mcp_servers_project_enabled
    ON project_mcp_servers(project_id, enabled);
