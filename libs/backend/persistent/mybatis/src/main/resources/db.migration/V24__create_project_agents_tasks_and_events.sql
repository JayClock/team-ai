-- Project-level multi-agent orchestration persistence

CREATE TABLE project_agents (
    id          SERIAL PRIMARY KEY,
    project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name        VARCHAR(255) NOT NULL,
    role        VARCHAR(32) NOT NULL,
    model_tier  VARCHAR(32) NOT NULL,
    status      VARCHAR(32) NOT NULL,
    parent_id   INTEGER REFERENCES project_agents(id) ON DELETE SET NULL,
    created_at  TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_project_agents_project ON project_agents(project_id);
CREATE INDEX idx_project_agents_project_status ON project_agents(project_id, status);
CREATE INDEX idx_project_agents_parent ON project_agents(parent_id);

CREATE TABLE project_tasks (
    id                    SERIAL PRIMARY KEY,
    project_id            INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title                 VARCHAR(255) NOT NULL,
    objective             TEXT NOT NULL,
    scope                 TEXT,
    acceptance_criteria   JSONB,
    verification_commands JSONB,
    status                VARCHAR(32) NOT NULL,
    assigned_to           INTEGER REFERENCES project_agents(id) ON DELETE SET NULL,
    delegated_by          INTEGER REFERENCES project_agents(id) ON DELETE SET NULL,
    completion_summary    TEXT,
    verification_verdict  VARCHAR(32),
    verification_report   TEXT,
    created_at            TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at            TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_project_tasks_project ON project_tasks(project_id);
CREATE INDEX idx_project_tasks_project_status ON project_tasks(project_id, status);
CREATE INDEX idx_project_tasks_assigned_to ON project_tasks(assigned_to);

CREATE TABLE project_agent_events (
    id          SERIAL PRIMARY KEY,
    project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    type        VARCHAR(64) NOT NULL,
    agent_id    INTEGER REFERENCES project_agents(id) ON DELETE SET NULL,
    task_id     INTEGER REFERENCES project_tasks(id) ON DELETE SET NULL,
    message     TEXT,
    occurred_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at  TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_project_agent_events_project_time ON project_agent_events(project_id, occurred_at DESC);
CREATE INDEX idx_project_agent_events_agent ON project_agent_events(agent_id);
CREATE INDEX idx_project_agent_events_task ON project_agent_events(task_id);
