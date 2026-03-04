-- Decommission orchestration sessions: project now manages ACP sessions only.

DROP TABLE IF EXISTS project_orchestration_sessions CASCADE;
DROP TABLE IF EXISTS project_orchestration_steps CASCADE;
