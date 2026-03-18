import fs from 'node:fs';
import path from 'node:path';
import {
  PROVIDER_ADAPTER_KINDS,
  type ProviderAdapterKind,
  type ProviderLaunchCommand,
} from './provider-types.js';

export interface AcpCliProviderPreset {
  id: string;
  name: string;
  description: string;
  command: string;
  args: string[];
  catalogSource?: 'environment' | 'static';
  adapterKind: ProviderAdapterKind;
  cwdArg?: string;
}

export const ACP_CLI_PROVIDER_PRESETS: readonly AcpCliProviderPreset[] = [
  {
    id: 'codex',
    name: 'Codex',
    description: 'OpenAI Codex CLI (via codex-acp wrapper)',
    command: 'codex-acp',
    args: [],
    adapterKind: PROVIDER_ADAPTER_KINDS.acpCli,
  },
  {
    id: 'opencode',
    name: 'OpenCode',
    description: 'OpenCode AI coding agent',
    command: 'opencode',
    args: ['acp'],
    adapterKind: PROVIDER_ADAPTER_KINDS.opencodeAcpCli,
    cwdArg: '--cwd',
  },
  {
    id: 'claude',
    name: 'Claude',
    description: 'Anthropic Claude Code CLI',
    command: 'claude',
    args: [],
    adapterKind: PROVIDER_ADAPTER_KINDS.acpCli,
  },
  {
    id: 'gemini',
    name: 'Gemini',
    description: 'Google Gemini CLI',
    command: 'gemini',
    args: ['--experimental-acp'],
    adapterKind: PROVIDER_ADAPTER_KINDS.acpCli,
  },
  {
    id: 'copilot',
    name: 'GitHub Copilot',
    description: 'GitHub Copilot CLI',
    command: 'copilot',
    args: ['--acp', '--allow-all-tools', '--no-ask-user'],
    adapterKind: PROVIDER_ADAPTER_KINDS.acpCli,
  },
  {
    id: 'auggie',
    name: 'Auggie',
    description: "Augment Code's AI agent",
    command: 'auggie',
    args: ['--acp'],
    adapterKind: PROVIDER_ADAPTER_KINDS.acpCli,
  },
  {
    id: 'kimi',
    name: 'Kimi',
    description: "Moonshot AI's Kimi CLI",
    command: 'kimi',
    args: ['acp'],
    adapterKind: PROVIDER_ADAPTER_KINDS.acpCli,
  },
  {
    id: 'kiro',
    name: 'Kiro',
    description: 'Amazon Kiro AI coding agent',
    command: 'kiro-cli',
    args: ['acp'],
    adapterKind: PROVIDER_ADAPTER_KINDS.acpCli,
  },
  {
    id: 'qoder',
    name: 'Qoder',
    description: 'Qoder AI coding agent',
    command: 'qodercli',
    args: ['--acp', '--yolo'],
    adapterKind: PROVIDER_ADAPTER_KINDS.acpCli,
  },
  {
    id: 'claude-code-sdk',
    name: 'Claude Code SDK',
    description: 'Environment-provided Claude Code SDK ACP bridge',
    command: 'claude-code-sdk',
    args: [],
    catalogSource: 'environment',
    adapterKind: PROVIDER_ADAPTER_KINDS.acpCli,
  },
  {
    id: 'opencode-sdk',
    name: 'OpenCode SDK',
    description: 'Environment-provided OpenCode SDK ACP bridge',
    command: 'opencode-sdk',
    args: [],
    catalogSource: 'environment',
    adapterKind: PROVIDER_ADAPTER_KINDS.acpCli,
  },
  {
    id: 'docker-opencode',
    name: 'Docker OpenCode',
    description: 'Run OpenCode ACP inside Docker',
    command: 'docker',
    args: ['run', '--rm', '-i'],
    catalogSource: 'environment',
    adapterKind: PROVIDER_ADAPTER_KINDS.opencodeAcpCli,
    cwdArg: '--cwd',
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
): ProviderLaunchCommand {
  const override = env[getProviderEnvCommandKey(preset.providerId)]?.trim();
  if (override) {
    const parsed = parseProviderCommand(override);
    if (parsed) {
      return parsed;
    }
  }

  const installed = readInstalledProviderCommand(preset.providerId, env);
  if (installed) {
    return installed;
  }

  return {
    command: preset.command,
    args: [...preset.args],
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

function parseProviderCommand(rawCommand: string): ProviderLaunchCommand | null {
  const [command, ...args] = tokenizeCommand(rawCommand);
  if (!command) {
    return null;
  }

  return {
    command,
    args,
  };
}

function readInstalledProviderCommand(
  providerName: string,
  env: NodeJS.ProcessEnv,
): ProviderLaunchCommand | null {
  try {
    const manifestPath = path.join(
      resolveDataDirectory(env),
      'acp',
      'providers.json',
    );

    if (!fs.existsSync(manifestPath)) {
      return null;
    }

    const raw = fs.readFileSync(manifestPath, 'utf-8');
    const parsed = JSON.parse(raw) as Record<
      string,
      { args?: unknown; command?: unknown }
    >;
    const entry = parsed[normalizeProviderId(providerName)];

    if (!entry || typeof entry.command !== 'string' || !entry.command.trim()) {
      return null;
    }

    return {
      command: entry.command,
      args: Array.isArray(entry.args)
        ? entry.args.filter((arg): arg is string => typeof arg === 'string')
        : [],
    };
  } catch {
    return null;
  }
}

function resolveDataDirectory(env: NodeJS.ProcessEnv): string {
  return env.TEAMAI_DATA_DIR?.trim() || path.join(process.cwd(), '.team-ai');
}
