import type { Database } from 'better-sqlite3';
import { customAlphabet } from 'nanoid';
import type {
  ProjectRuntimeProfileConfig,
  ProjectRuntimeProfileConfigMap,
  ProjectRuntimeRoleDefault,
  ProjectRuntimeRoleDefaults,
  ProjectRuntimeProfilePayload,
  UpdateProjectRuntimeProfileInput,
} from '../schemas/runtime-profile';
import { ProblemError } from '../errors/problem-error';
import { isRoleValue, type RoleValue } from '../schemas/role';
import { getProjectById } from './project-service';
import { listProviderModels as listProviderModelsFromService } from './provider-service';

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
  role_defaults_json: string;
  skill_configs_json: string;
  updated_at: string;
}

export interface UpdateProjectRuntimeProfileDeps {
  listProviderModels?: (
    providerId: string,
  ) => Promise<Array<{ id: string; providerId: string }>>;
}

function createRuntimeProfileId() {
  return `rprof_${runtimeProfileIdGenerator()}`;
}

const runtimeProfileRoles: RoleValue[] = [
  'ROUTA',
  'CRAFTER',
  'GATE',
  'DEVELOPER',
];

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

function normalizeOptionalText(
  value: string | null | undefined,
): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeRoleDefault(
  value: ProjectRuntimeRoleDefault | null | undefined,
): ProjectRuntimeRoleDefault | null {
  const providerId = normalizeOptionalText(value?.providerId);
  const model = normalizeOptionalText(value?.model);

  if (!providerId && !model) {
    return null;
  }

  return {
    model,
    providerId,
  };
}

function buildLegacyRoleDefaults(
  providerId: string | null,
  model: string | null,
): ProjectRuntimeRoleDefaults {
  const normalized = normalizeRoleDefault({
    model,
    providerId,
  });

  if (!normalized) {
    return {};
  }

  return Object.fromEntries(
    runtimeProfileRoles.map((role) => [role, { ...normalized }]),
  ) as ProjectRuntimeRoleDefaults;
}

function parseRoleDefaults(value: string): ProjectRuntimeRoleDefaults {
  try {
    const parsed = JSON.parse(value) as unknown;

    if (!isConfigRecord(parsed)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed).flatMap(([role, config]) => {
        if (!isRoleValue(role) || !isConfigRecord(config)) {
          return [];
        }

        const normalized = normalizeRoleDefault({
          model:
            typeof config.model === 'string' || config.model === null
              ? config.model
              : null,
          providerId:
            typeof config.providerId === 'string' || config.providerId === null
              ? config.providerId
              : null,
        });

        return normalized ? [[role, normalized]] : [];
      }),
    ) as ProjectRuntimeRoleDefaults;
  } catch {
    return {};
  }
}

function normalizeRoleDefaults(
  value: ProjectRuntimeRoleDefaults,
): ProjectRuntimeRoleDefaults {
  return Object.fromEntries(
    Object.entries(value).flatMap(([role, config]) => {
      if (!isRoleValue(role)) {
        return [];
      }

      const normalized = normalizeRoleDefault(config);
      return normalized ? [[role, normalized]] : [];
    }),
  ) as ProjectRuntimeRoleDefaults;
}

function setRoleDefault(
  roleDefaults: ProjectRuntimeRoleDefaults,
  role: RoleValue,
  value: ProjectRuntimeRoleDefault | null,
): ProjectRuntimeRoleDefaults {
  if (!value) {
    const next = { ...roleDefaults };
    delete next[role];
    return next;
  }

  return {
    ...roleDefaults,
    [role]: value,
  };
}

async function validateRoleDefault(
  role: RoleValue,
  roleDefault: ProjectRuntimeRoleDefault,
  deps: UpdateProjectRuntimeProfileDeps,
): Promise<void> {
  const providerId = normalizeOptionalText(roleDefault.providerId);
  const model = normalizeOptionalText(roleDefault.model);

  if (!model) {
    return;
  }

  if (!providerId) {
    throw new ProblemError({
      type: 'https://team-ai.dev/problems/runtime-profile-role-model-provider-required',
      title: 'Runtime Profile Role Provider Required',
      status: 400,
      detail:
        `${role} providerId must be set before saving a model in the runtime profile`,
    });
  }

  const listProviderModels =
    deps.listProviderModels ?? listProviderModelsFromService;
  const models = await listProviderModels(providerId);
  const belongsToProvider = models.some(
    (candidate) =>
      normalizeOptionalText(candidate.providerId) === providerId &&
      normalizeOptionalText(candidate.id) === model,
  );

  if (belongsToProvider) {
    return;
  }

  throw new ProblemError({
    type: 'https://team-ai.dev/problems/runtime-profile-role-model-provider-mismatch',
    title: 'Runtime Profile Role Model Provider Mismatch',
    status: 400,
    detail: `Model ${model} is not available for provider ${providerId} in role ${role}`,
  });
}

async function validateRuntimeProfileDefaults(
  profile: Pick<ProjectRuntimeProfilePayload, 'roleDefaults'>,
  deps: UpdateProjectRuntimeProfileDeps,
): Promise<void> {
  for (const role of runtimeProfileRoles) {
    const roleDefault = profile.roleDefaults[role];
    if (!roleDefault) {
      continue;
    }

    await validateRoleDefault(role, roleDefault, deps);
  }
}

function resolveLegacyDefaultsFromRoleDefaults(
  roleDefaults: ProjectRuntimeRoleDefaults,
): Pick<ProjectRuntimeProfilePayload, 'defaultModel' | 'defaultProviderId'> {
  const routa = roleDefaults.ROUTA ?? null;

  return {
    defaultModel: normalizeOptionalText(routa?.model),
    defaultProviderId: normalizeOptionalText(routa?.providerId),
  };
}

export function resolveProjectRuntimeRoleDefault(
  profile: Pick<ProjectRuntimeProfilePayload, 'roleDefaults'>,
  role: RoleValue,
): ProjectRuntimeRoleDefault | null {
  return normalizeRoleDefault(profile.roleDefaults[role]);
}

function mapProjectRuntimeProfileRow(
  row: ProjectRuntimeProfileRow,
): ProjectRuntimeProfilePayload {
  const parsedRoleDefaults = parseRoleDefaults(row.role_defaults_json);
  const roleDefaults =
    Object.keys(parsedRoleDefaults).length > 0
      ? parsedRoleDefaults
      : buildLegacyRoleDefaults(row.default_provider_id, row.default_model);
  const legacyDefaults = resolveLegacyDefaultsFromRoleDefaults(roleDefaults);

  return {
    createdAt: row.created_at,
    defaultModel: legacyDefaults.defaultModel,
    defaultProviderId: legacyDefaults.defaultProviderId,
    enabledMcpServerIds: parseStringArray(row.enabled_mcp_server_ids_json),
    enabledSkillIds: parseStringArray(row.enabled_skill_ids_json),
    id: row.id,
    mcpServerConfigs: parseConfigMap(row.mcp_server_configs_json),
    orchestrationMode: row.orchestration_mode,
    projectId: row.project_id,
    roleDefaults,
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
            role_defaults_json,
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
    roleDefaults: {},
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
          role_defaults_json,
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
          @roleDefaultsJson,
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
      roleDefaultsJson: JSON.stringify(profile.roleDefaults),
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
  deps: UpdateProjectRuntimeProfileDeps = {},
): Promise<ProjectRuntimeProfilePayload> {
  const current = await getProjectRuntimeProfile(sqlite, projectId);
  let nextRoleDefaults =
    input.roleDefaults === undefined
      ? current.roleDefaults
      : normalizeRoleDefaults(input.roleDefaults);

  if (input.defaultProviderId !== undefined || input.defaultModel !== undefined) {
    const currentRoutaDefault =
      resolveProjectRuntimeRoleDefault(current, 'ROUTA') ??
      normalizeRoleDefault({
        model: current.defaultModel,
        providerId: current.defaultProviderId,
      });
    const nextRoutaDefault = normalizeRoleDefault({
      model:
        input.defaultModel === undefined
          ? currentRoutaDefault?.model ?? null
          : input.defaultModel,
      providerId:
        input.defaultProviderId === undefined
          ? currentRoutaDefault?.providerId ?? null
          : input.defaultProviderId,
    });
    nextRoleDefaults = setRoleDefault(nextRoleDefaults, 'ROUTA', nextRoutaDefault);
  }

  const legacyDefaults = resolveLegacyDefaultsFromRoleDefaults(nextRoleDefaults);
  const next: ProjectRuntimeProfilePayload = {
    createdAt: current.createdAt,
    defaultModel: legacyDefaults.defaultModel,
    defaultProviderId: legacyDefaults.defaultProviderId,
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
    roleDefaults: nextRoleDefaults,
    skillConfigs:
      input.skillConfigs === undefined
        ? current.skillConfigs
        : normalizeConfigMap(input.skillConfigs),
    updatedAt: new Date().toISOString(),
  };

  await validateRuntimeProfileDefaults(next, deps);

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
          role_defaults_json = @roleDefaultsJson,
          updated_at = @updatedAt
        WHERE project_id = @projectId AND deleted_at IS NULL
      `,
    )
    .run({
      ...next,
      enabledMcpServerIdsJson: JSON.stringify(next.enabledMcpServerIds),
      enabledSkillIdsJson: JSON.stringify(next.enabledSkillIds),
      mcpServerConfigsJson: JSON.stringify(next.mcpServerConfigs),
      roleDefaultsJson: JSON.stringify(next.roleDefaults),
      skillConfigsJson: JSON.stringify(next.skillConfigs),
    });

  return next;
}
