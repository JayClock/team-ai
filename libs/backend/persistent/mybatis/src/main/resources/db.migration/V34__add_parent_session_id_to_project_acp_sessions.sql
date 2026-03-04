ALTER TABLE project_acp_sessions
    ADD COLUMN parent_session_id VARCHAR(255);

CREATE INDEX idx_project_acp_sessions_parent
    ON project_acp_sessions(parent_session_id);
