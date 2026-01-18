-- 1. 创建 projects 表
CREATE TABLE projects (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT NOT NULL,
  name        VARCHAR(255) NOT NULL,
  domain_model TEXT,
  created_at  TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX idx_projects_user_id ON projects(user_id);

-- 2. 为每个用户创建默认项目
INSERT INTO projects (user_id, name, domain_model)
SELECT DISTINCT user_id, 'Default Project', '' FROM conversations;

-- 3. 修改 conversations 表添加 project_id
ALTER TABLE conversations ADD COLUMN project_id BIGINT;
ALTER TABLE conversations ADD CONSTRAINT fk_conversations_project
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
CREATE INDEX idx_conversations_project_id ON conversations(project_id);

-- 4. 将现有对话关联到用户的默认项目
UPDATE conversations c
SET project_id = (
  SELECT p.id FROM projects p
  WHERE p.user_id = c.user_id
  AND p.name = 'Default Project'
  LIMIT 1
)
WHERE project_id IS NULL;
