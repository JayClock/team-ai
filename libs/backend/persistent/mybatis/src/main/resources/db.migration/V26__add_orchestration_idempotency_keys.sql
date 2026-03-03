ALTER TABLE project_orchestration_sessions
    ADD COLUMN start_request_id VARCHAR(128);

CREATE UNIQUE INDEX ux_project_orch_sessions_start_request_id
    ON project_orchestration_sessions(project_id, start_request_id)
    WHERE start_request_id IS NOT NULL;

ALTER TABLE project_tasks
    ADD COLUMN delegate_request_id VARCHAR(128),
    ADD COLUMN approve_request_id VARCHAR(128);

CREATE UNIQUE INDEX ux_project_tasks_delegate_request_id
    ON project_tasks(project_id, delegate_request_id)
    WHERE delegate_request_id IS NOT NULL;

CREATE UNIQUE INDEX ux_project_tasks_approve_request_id
    ON project_tasks(project_id, approve_request_id)
    WHERE approve_request_id IS NOT NULL;
