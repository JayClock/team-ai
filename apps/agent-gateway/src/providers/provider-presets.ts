export interface AcpCliProviderPreset {
  id: string;
  name: string;
  description: string;
  command: string;
  args: string[];
  cwdArg?: string;
}

export const ACP_CLI_PROVIDER_PRESETS: readonly AcpCliProviderPreset[] = [
  {
    id: 'opencode',
    name: 'OpenCode',
    description: 'OpenCode AI coding agent',
    command: 'opencode',
    args: ['acp'],
    cwdArg: '--cwd',
  },
  {
    id: 'gemini',
    name: 'Gemini',
    description: 'Google Gemini CLI',
    command: 'gemini',
    args: ['--experimental-acp'],
  },
  {
    id: 'copilot',
    name: 'GitHub Copilot',
    description: 'GitHub Copilot CLI',
    command: 'copilot',
    args: ['--acp', '--allow-all-tools', '--no-ask-user'],
  },
  {
    id: 'auggie',
    name: 'Auggie',
    description: "Augment Code's AI agent",
    command: 'auggie',
    args: ['--acp'],
  },
  {
    id: 'kimi',
    name: 'Kimi',
    description: "Moonshot AI's Kimi CLI",
    command: 'kimi',
    args: ['acp'],
  },
  {
    id: 'kiro',
    name: 'Kiro',
    description: 'Amazon Kiro AI coding agent',
    command: 'kiro-cli',
    args: ['acp'],
  },
  {
    id: 'qoder',
    name: 'Qoder',
    description: 'Qoder AI coding agent',
    command: 'qodercli',
    args: ['--acp', '--yolo'],
  },
] as const;

export interface ResolvedAcpCliProviderPreset extends AcpCliProviderPreset {
  providerId: string;
}

export function resolveAcpCliProviderPreset(
  providerName: string,
): ResolvedAcpCliProviderPreset | null {
  const providerId = normalizeProviderId(providerName);
  const preset = ACP_CLI_PROVIDER_PRESETS.find(
    (candidate) => candidate.id === providerId,
  );

  if (!preset) {
    return null;
  }

  return {
    ...preset,
    providerId,
  };
}

export function resolveAcpCliCommand(
  preset: ResolvedAcpCliProviderPreset,
  env: NodeJS.ProcessEnv = process.env,
): {
  args: string[];
  command: string;
} {
  const override = env[getProviderEnvCommandKey(preset.providerId)]?.trim();
  if (!override) {
    return {
      command: preset.command,
      args: [...preset.args],
    };
  }

  const [command, ...args] = tokenizeCommand(override);
  if (!command) {
    return {
      command: preset.command,
      args: [...preset.args],
    };
  }

  return {
    command,
    args,
  };
}

export function getProviderEnvCommandKey(providerName: string): string {
  return `TEAMAI_ACP_${normalizeEnvProviderName(providerName)}_COMMAND`;
}

export function normalizeProviderId(providerName: string): string {
  const normalized = providerName.endsWith('-registry')
    ? providerName.slice(0, -'-registry'.length)
    : providerName;

  if (normalized === 'codex-acp') {
    return 'codex';
  }

  return normalized;
}

function normalizeEnvProviderName(providerName: string): string {
  return providerName
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_');
}

function tokenizeCommand(command: string): string[] {
  return command
    .trim()
    .split(/\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}
