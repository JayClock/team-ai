import type { Database } from 'better-sqlite3';
import { customAlphabet } from 'nanoid';
import type {
  ProjectRuntimeProfileConfig,
  ProjectRuntimeProfileConfigMap,
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
  mcp_server_configs_json: string;
  orchestration_mode: 'ROUTA' | 'DEVELOPER';
  project_id: string;
  skill_configs_json: string;
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

function isConfigRecord(value: unknown): value is ProjectRuntimeProfileConfig {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function parseConfigMap(value: string): ProjectRuntimeProfileConfigMap {
  try {
    const parsed = JSON.parse(value) as unknown;

    if (!isConfigRecord(parsed)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed).flatMap(([key, config]) => {
        const trimmedKey = key.trim();

        if (!trimmedKey || !isConfigRecord(config)) {
          return [];
        }

        return [[trimmedKey, { ...config }]];
      }),
    );
  } catch {
    return {};
  }
}

function normalizeStringArray(values: string[]): string[] {
  return Array.from(
    new Set(
      values.map((value) => value.trim()).filter((value) => value.length > 0),
    ),
  );
}

function normalizeConfigMap(
  value: ProjectRuntimeProfileConfigMap,
): ProjectRuntimeProfileConfigMap {
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, config]) => {
      const trimmedKey = key.trim();

      if (!trimmedKey || !isConfigRecord(config)) {
        return [];
      }

      return [[trimmedKey, { ...config }]];
    }),
  );
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
    mcpServerConfigs: parseConfigMap(row.mcp_server_configs_json),
    orchestrationMode: row.orchestration_mode,
    projectId: row.project_id,
    skillConfigs: parseConfigMap(row.skill_configs_json),
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
            skill_configs_json,
            mcp_server_configs_json,
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
    mcpServerConfigs: {},
    orchestrationMode: 'ROUTA',
    projectId,
    skillConfigs: {},
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
          skill_configs_json,
          mcp_server_configs_json,
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
          @skillConfigsJson,
          @mcpServerConfigsJson,
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
      mcpServerConfigsJson: JSON.stringify(profile.mcpServerConfigs),
      skillConfigsJson: JSON.stringify(profile.skillConfigs),
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
      input.enabledMcpServerIds === undefined
        ? current.enabledMcpServerIds
        : normalizeStringArray(input.enabledMcpServerIds),
    enabledSkillIds:
      input.enabledSkillIds === undefined
        ? current.enabledSkillIds
        : normalizeStringArray(input.enabledSkillIds),
    id: current.id,
    mcpServerConfigs:
      input.mcpServerConfigs === undefined
        ? current.mcpServerConfigs
        : normalizeConfigMap(input.mcpServerConfigs),
    orchestrationMode: input.orchestrationMode ?? current.orchestrationMode,
    projectId: current.projectId,
    skillConfigs:
      input.skillConfigs === undefined
        ? current.skillConfigs
        : normalizeConfigMap(input.skillConfigs),
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
          skill_configs_json = @skillConfigsJson,
          mcp_server_configs_json = @mcpServerConfigsJson,
          updated_at = @updatedAt
        WHERE project_id = @projectId AND deleted_at IS NULL
      `,
    )
    .run({
      ...next,
      enabledMcpServerIdsJson: JSON.stringify(next.enabledMcpServerIds),
      enabledSkillIdsJson: JSON.stringify(next.enabledSkillIds),
      mcpServerConfigsJson: JSON.stringify(next.mcpServerConfigs),
      skillConfigsJson: JSON.stringify(next.skillConfigs),
    });

  return next;
}
