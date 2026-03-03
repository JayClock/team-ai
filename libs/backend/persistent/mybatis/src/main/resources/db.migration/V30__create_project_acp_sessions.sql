-- Project-level ACP sessions persistence

CREATE TABLE project_acp_sessions (
    id                SERIAL PRIMARY KEY,
    project_id        INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    actor_user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
    provider          VARCHAR(128) NOT NULL,
    mode              VARCHAR(128),
    status            VARCHAR(32) NOT NULL,
    started_at        TIMESTAMP(6),
    last_activity_at  TIMESTAMP(6),
    completed_at      TIMESTAMP(6),
    failure_reason    TEXT,
    last_event_id     VARCHAR(255),
    created_at        TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at        TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_project_acp_sessions_project ON project_acp_sessions(project_id);
CREATE INDEX idx_project_acp_sessions_project_status
    ON project_acp_sessions(project_id, status);
CREATE INDEX idx_project_acp_sessions_project_activity
    ON project_acp_sessions(project_id, last_activity_at DESC);
