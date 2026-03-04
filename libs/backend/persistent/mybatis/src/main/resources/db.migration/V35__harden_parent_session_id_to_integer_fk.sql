ALTER TABLE project_acp_sessions
    DROP CONSTRAINT IF EXISTS fk_project_acp_sessions_parent_session;

DROP INDEX IF EXISTS idx_project_acp_sessions_parent;

ALTER TABLE project_acp_sessions
    ALTER COLUMN parent_session_id TYPE INTEGER
    USING CASE
        WHEN parent_session_id ~ '^[0-9]+$' AND parent_session_id::NUMERIC <= 2147483647
            THEN parent_session_id::INTEGER
        ELSE NULL
    END;

UPDATE project_acp_sessions child
SET parent_session_id = NULL
WHERE parent_session_id IS NOT NULL
  AND NOT EXISTS (
      SELECT 1
      FROM project_acp_sessions parent
      WHERE parent.id = child.parent_session_id
  );

ALTER TABLE project_acp_sessions
    ADD CONSTRAINT fk_project_acp_sessions_parent_session
        FOREIGN KEY (parent_session_id)
            REFERENCES project_acp_sessions(id)
            ON DELETE SET NULL;

CREATE INDEX idx_project_acp_sessions_parent
    ON project_acp_sessions(parent_session_id);
