-- Project-level orchestration sessions and steps persistence

CREATE TABLE project_orchestration_sessions (
    id               SERIAL PRIMARY KEY,
    project_id       INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    goal             TEXT NOT NULL,
    status           VARCHAR(32) NOT NULL,
    coordinator_id   INTEGER REFERENCES project_agents(id) ON DELETE SET NULL,
    implementer_id   INTEGER REFERENCES project_agents(id) ON DELETE SET NULL,
    task_id          INTEGER REFERENCES project_tasks(id) ON DELETE SET NULL,
    current_step_id  INTEGER,
    started_at       TIMESTAMP(6),
    completed_at     TIMESTAMP(6),
    failure_reason   TEXT,
    created_at       TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_project_orch_sessions_project ON project_orchestration_sessions(project_id);
CREATE INDEX idx_project_orch_sessions_project_status
    ON project_orchestration_sessions(project_id, status);
CREATE INDEX idx_project_orch_sessions_project_created
    ON project_orchestration_sessions(project_id, created_at DESC);

CREATE TABLE project_orchestration_steps (
    id             SERIAL PRIMARY KEY,
    session_id     INTEGER NOT NULL REFERENCES project_orchestration_sessions(id) ON DELETE CASCADE,
    sequence_no    INTEGER NOT NULL,
    title          VARCHAR(255) NOT NULL,
    objective      TEXT NOT NULL,
    status         VARCHAR(32) NOT NULL,
    task_id        INTEGER REFERENCES project_tasks(id) ON DELETE SET NULL,
    assignee_id    INTEGER REFERENCES project_agents(id) ON DELETE SET NULL,
    started_at     TIMESTAMP(6),
    completed_at   TIMESTAMP(6),
    failure_reason TEXT,
    created_at     TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at     TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX ux_project_orch_steps_session_sequence
    ON project_orchestration_steps(session_id, sequence_no);
CREATE INDEX idx_project_orch_steps_session ON project_orchestration_steps(session_id);
CREATE INDEX idx_project_orch_steps_session_status
    ON project_orchestration_steps(session_id, status);

ALTER TABLE project_orchestration_sessions
    ADD CONSTRAINT fk_project_orch_sessions_current_step
    FOREIGN KEY (current_step_id)
    REFERENCES project_orchestration_steps(id)
    ON DELETE SET NULL;
