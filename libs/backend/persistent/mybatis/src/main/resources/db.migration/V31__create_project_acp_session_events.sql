-- Persistent ACP session event history for replay and history queries

CREATE TABLE project_acp_session_events (
    id             BIGSERIAL PRIMARY KEY,
    project_id     INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    session_id     INTEGER NOT NULL REFERENCES project_acp_sessions(id) ON DELETE CASCADE,
    event_id       VARCHAR(255) NOT NULL UNIQUE,
    event_type     VARCHAR(64) NOT NULL,
    emitted_at     TIMESTAMP(6) NOT NULL,
    data_json      TEXT NOT NULL,
    error_json     TEXT,
    created_at     TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_project_acp_session_events_project_session
    ON project_acp_session_events(project_id, session_id, id);
