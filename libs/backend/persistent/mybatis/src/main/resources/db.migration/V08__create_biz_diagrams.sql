CREATE TABLE biz_diagrams (
  id                  BIGSERIAL PRIMARY KEY,
  project_id          BIGINT NOT NULL,
  name                VARCHAR(255) NOT NULL,
  description         TEXT,
  plantuml_code       TEXT NOT NULL,
  diagram_type        VARCHAR(50) DEFAULT 'flowchart',
  version             INT DEFAULT 1,
  created_at          TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX idx_biz_diagrams_project_id ON biz_diagrams(project_id);
