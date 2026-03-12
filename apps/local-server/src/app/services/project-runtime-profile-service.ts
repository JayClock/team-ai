import type { Database } from 'better-sqlite3';
import { customAlphabet } from 'nanoid';
import type {
  ProjectRuntimeProfilePayload,
  UpdateProjectRuntimeProfileInput,
} from '../schemas/runtime-profile';
import { getProjectById } from './project-service';

const runtimeProfileIdGenerator = customAlphabet(
  '0123456789abcdefghijklmnopqrstuvwxyz',
  12,
);

interface ProjectRuntimeProfileRow {
  created_at: string;
  default_model: string | null;
  default_provider_id: string | null;
  enabled_mcp_server_ids_json: string;
  enabled_skill_ids_json: string;
  id: string;
  orchestration_mode: 'ROUTA' | 'DEVELOPER';
  project_id: string;
  updated_at: string;
}

function createRuntimeProfileId() {
  return `rprof_${runtimeProfileIdGenerator()}`;
}

function parseStringArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : [];
  } catch {
    return [];
  }
}

function mapProjectRuntimeProfileRow(
  row: ProjectRuntimeProfileRow,
): ProjectRuntimeProfilePayload {
  return {
    createdAt: row.created_at,
    defaultModel: row.default_model,
    defaultProviderId: row.default_provider_id,
    enabledMcpServerIds: parseStringArray(row.enabled_mcp_server_ids_json),
    enabledSkillIds: parseStringArray(row.enabled_skill_ids_json),
    id: row.id,
    orchestrationMode: row.orchestration_mode,
    projectId: row.project_id,
    updatedAt: row.updated_at,
  };
}

function getProjectRuntimeProfileRow(
  sqlite: Database,
  projectId: string,
): ProjectRuntimeProfileRow | null {
  return (
    (sqlite
      .prepare(
        `
          SELECT
            id,
            project_id,
            default_provider_id,
            default_model,
            orchestration_mode,
            enabled_skill_ids_json,
            enabled_mcp_server_ids_json,
            created_at,
            updated_at
          FROM project_runtime_profiles
          WHERE project_id = ? AND deleted_at IS NULL
        `,
      )
      .get(projectId) as ProjectRuntimeProfileRow | undefined) ?? null
  );
}

function createDefaultRuntimeProfile(
  projectId: string,
): ProjectRuntimeProfilePayload {
  const now = new Date().toISOString();

  return {
    createdAt: now,
    defaultModel: null,
    defaultProviderId: null,
    enabledMcpServerIds: [],
    enabledSkillIds: [],
    id: createRuntimeProfileId(),
    orchestrationMode: 'ROUTA',
    projectId,
    updatedAt: now,
  };
}

function insertRuntimeProfile(
  sqlite: Database,
  profile: ProjectRuntimeProfilePayload,
) {
  sqlite
    .prepare(
      `
        INSERT INTO project_runtime_profiles (
          id,
          project_id,
          default_provider_id,
          default_model,
          orchestration_mode,
          enabled_skill_ids_json,
          enabled_mcp_server_ids_json,
          created_at,
          updated_at,
          deleted_at
        )
        VALUES (
          @id,
          @projectId,
          @defaultProviderId,
          @defaultModel,
          @orchestrationMode,
          @enabledSkillIdsJson,
          @enabledMcpServerIdsJson,
          @createdAt,
          @updatedAt,
          NULL
        )
      `,
    )
    .run({
      ...profile,
      enabledMcpServerIdsJson: JSON.stringify(profile.enabledMcpServerIds),
      enabledSkillIdsJson: JSON.stringify(profile.enabledSkillIds),
    });
}

export async function getProjectRuntimeProfile(
  sqlite: Database,
  projectId: string,
): Promise<ProjectRuntimeProfilePayload> {
  await getProjectById(sqlite, projectId);
  const existing = getProjectRuntimeProfileRow(sqlite, projectId);

  if (existing) {
    return mapProjectRuntimeProfileRow(existing);
  }

  const profile = createDefaultRuntimeProfile(projectId);
  insertRuntimeProfile(sqlite, profile);
  return profile;
}

export async function updateProjectRuntimeProfile(
  sqlite: Database,
  projectId: string,
  input: UpdateProjectRuntimeProfileInput,
): Promise<ProjectRuntimeProfilePayload> {
  const current = await getProjectRuntimeProfile(sqlite, projectId);
  const next: ProjectRuntimeProfilePayload = {
    createdAt: current.createdAt,
    defaultModel:
      input.defaultModel === undefined
        ? current.defaultModel
        : input.defaultModel,
    defaultProviderId:
      input.defaultProviderId === undefined
        ? current.defaultProviderId
        : input.defaultProviderId,
    enabledMcpServerIds:
      input.enabledMcpServerIds ?? current.enabledMcpServerIds,
    enabledSkillIds: input.enabledSkillIds ?? current.enabledSkillIds,
    id: current.id,
    orchestrationMode: input.orchestrationMode ?? current.orchestrationMode,
    projectId: current.projectId,
    updatedAt: new Date().toISOString(),
  };

  sqlite
    .prepare(
      `
        UPDATE project_runtime_profiles
        SET
          default_provider_id = @defaultProviderId,
          default_model = @defaultModel,
          orchestration_mode = @orchestrationMode,
          enabled_skill_ids_json = @enabledSkillIdsJson,
          enabled_mcp_server_ids_json = @enabledMcpServerIdsJson,
          updated_at = @updatedAt
        WHERE project_id = @projectId AND deleted_at IS NULL
      `,
    )
    .run({
      ...next,
      enabledMcpServerIdsJson: JSON.stringify(next.enabledMcpServerIds),
      enabledSkillIdsJson: JSON.stringify(next.enabledSkillIds),
    });

  return next;
}
