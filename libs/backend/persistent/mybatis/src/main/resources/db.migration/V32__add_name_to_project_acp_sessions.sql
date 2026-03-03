-- Optional display name for ACP sessions

ALTER TABLE project_acp_sessions
  ADD COLUMN name VARCHAR(255);
