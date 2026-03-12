export interface AcpCliProviderPreset {
  id: string;
  name: string;
  command: string;
  args: string[];
  cwdArg?: string;
}

const ACP_CLI_PROVIDER_PRESETS: readonly AcpCliProviderPreset[] = [
  {
    id: 'opencode',
    name: 'OpenCode',
    command: 'opencode',
    args: ['acp'],
    cwdArg: '--cwd',
  },
  {
    id: 'gemini',
    name: 'Gemini',
    command: 'gemini',
    args: ['--experimental-acp'],
  },
  {
    id: 'copilot',
    name: 'GitHub Copilot',
    command: 'copilot',
    args: ['--acp', '--allow-all-tools', '--no-ask-user'],
  },
  {
    id: 'auggie',
    name: 'Auggie',
    command: 'auggie',
    args: ['--acp'],
  },
  {
    id: 'kimi',
    name: 'Kimi',
    command: 'kimi',
    args: ['acp'],
  },
  {
    id: 'kiro',
    name: 'Kiro',
    command: 'kiro-cli',
    args: ['acp'],
  },
  {
    id: 'qoder',
    name: 'Qoder',
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
  return providerName.endsWith('-registry')
    ? providerName.slice(0, -'-registry'.length)
    : providerName;
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
