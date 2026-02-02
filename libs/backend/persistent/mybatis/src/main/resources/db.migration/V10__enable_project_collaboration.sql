ALTER TABLE projects RENAME COLUMN user_id TO creator_id;

ALTER TABLE projects DROP CONSTRAINT projects_user_id_fkey;
ALTER TABLE projects ADD CONSTRAINT projects_creator_id_fkey
    FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE SET NULL;

CREATE TABLE project_members (
    project_id BIGINT NOT NULL,
    user_id    BIGINT NOT NULL,
    role       VARCHAR(50) NOT NULL DEFAULT 'EDITOR',
    joined_at  TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (project_id, user_id),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_project_members_user_id ON project_members(user_id);
CREATE INDEX idx_project_members_project_id ON project_members(project_id);

INSERT INTO project_members (project_id, user_id, role)
SELECT id, creator_id, 'OWNER' FROM projects
WHERE creator_id IS NOT NULL;
