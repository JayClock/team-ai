import type { ProviderModelPayload } from '../schemas/provider';

export interface AcpProviderModelListingConfig {
  args: string[];
  command: string;
  parse: (stdout: string, providerId: string) => ProviderModelPayload[];
}

export interface AcpProviderRuntimeCommandPreset {
  args: string[];
  command: string;
}

export interface AcpProviderRuntimeLaunchConfig {
  appendCwd: boolean;
  modelArgFlag: string;
  passModelToLaunch: boolean;
}

export interface AcpProviderDefinition {
  defaultModel: string | null;
  id: string;
  modelListing?: AcpProviderModelListingConfig;
  models?: ProviderModelPayload[];
  name: string;
  runtimeCommandPreset?: AcpProviderRuntimeCommandPreset;
  runtimeLaunch?: Partial<AcpProviderRuntimeLaunchConfig>;
}

const DEFAULT_RUNTIME_LAUNCH_CONFIG: AcpProviderRuntimeLaunchConfig = {
  appendCwd: false,
  modelArgFlag: '-m',
  passModelToLaunch: true,
};

const ACP_PROVIDER_DEFINITIONS: AcpProviderDefinition[] = [
  {
    defaultModel: null,
    id: 'codex',
    name: 'Codex',
    models: [
      'gpt-5.4',
      'gpt-5.3-codex',
      'gpt-5.2-codex',
      'gpt-5.1-codex',
      'gpt-5.1-codex-max',
      'gpt-5.1-codex-mini',
      'gpt-5-codex',
      'codex-mini-latest',
    ].map((id) => toStaticModel(id, 'codex')),
    runtimeCommandPreset: {
      command: 'codex-acp',
      args: [],
    },
  },
  {
    defaultModel: null,
    id: 'opencode',
    name: 'OpenCode',
    modelListing: {
      command: 'opencode',
      args: ['models'],
      parse: parseSlashSeparatedModels,
    },
    runtimeCommandPreset: {
      command: 'opencode',
      args: ['acp'],
    },
    runtimeLaunch: {
      appendCwd: true,
      passModelToLaunch: false,
    },
  },
  {
    defaultModel: null,
    id: 'gemini',
    name: 'Gemini',
    runtimeCommandPreset: {
      command: 'gemini',
      args: ['--experimental-acp'],
    },
  },
  {
    defaultModel: null,
    id: 'copilot',
    name: 'Copilot',
    runtimeCommandPreset: {
      command: 'copilot',
      args: ['--acp', '--allow-all-tools', '--no-ask-user'],
    },
  },
  {
    defaultModel: null,
    id: 'auggie',
    name: 'Auggie',
    runtimeCommandPreset: {
      command: 'auggie',
      args: ['--acp'],
    },
  },
  {
    defaultModel: null,
    id: 'kimi',
    name: 'Kimi',
    runtimeCommandPreset: {
      command: 'kimi',
      args: ['acp'],
    },
  },
  {
    defaultModel: null,
    id: 'kiro',
    name: 'Kiro',
    runtimeCommandPreset: {
      command: 'kiro-cli',
      args: ['acp'],
    },
  },
  {
    defaultModel: null,
    id: 'qoder',
    name: 'Qoder',
    runtimeCommandPreset: {
      command: 'qodercli',
      args: ['--acp', '--yolo'],
    },
  },
  {
    defaultModel: null,
    id: 'claude',
    name: 'Claude',
    runtimeCommandPreset: {
      command: 'claude',
      args: [],
    },
  },
];

export function getAcpProviderDefinition(
  providerId: string,
): AcpProviderDefinition | null {
  const normalizedProviderId = providerId.trim();
  return (
    ACP_PROVIDER_DEFINITIONS.find(
      (provider) => provider.id === normalizedProviderId,
    ) ?? null
  );
}

export function listModelSelectableProviderDefinitions(): AcpProviderDefinition[] {
  return ACP_PROVIDER_DEFINITIONS.filter(
    (provider) => provider.modelListing || provider.models,
  );
}

export function listStaticRuntimeProviderDefinitions(): AcpProviderDefinition[] {
  return ACP_PROVIDER_DEFINITIONS.filter(
    (provider) => provider.runtimeCommandPreset !== undefined,
  );
}

export function resolveProviderRuntimeLaunchConfig(
  providerId: string,
): AcpProviderRuntimeLaunchConfig {
  return {
    ...DEFAULT_RUNTIME_LAUNCH_CONFIG,
    ...(getAcpProviderDefinition(providerId)?.runtimeLaunch ?? {}),
  };
}

function parseSlashSeparatedModels(
  stdout: string,
  providerId: string,
): ProviderModelPayload[] {
  const seen = new Set<string>();
  const models: ProviderModelPayload[] = [];

  for (const rawLine of stdout.split(/\r?\n/u)) {
    const id = rawLine.trim();
    if (!id || !id.includes('/') || seen.has(id)) {
      continue;
    }

    seen.add(id);
    models.push({
      id,
      name: id,
      providerId,
    });
  }

  return models;
}

function toStaticModel(
  id: string,
  providerId: string,
): ProviderModelPayload {
  return {
    id,
    name: id,
    providerId,
  };
}
