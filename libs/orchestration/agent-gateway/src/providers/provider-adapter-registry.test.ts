import { afterEach, describe, expect, it, vi } from 'vitest';
import { createProviderAdapter } from './provider-adapter-registry.js';
import { PROVIDER_ADAPTER_KINDS } from './provider-types.js';

const acpCliFactory = vi.fn();
const opencodeFactory = vi.fn();
const timeouts = {
  cancelGraceMs: 1_000,
  minimumPromptTransportMs: 30_000,
  packageManagerInitTimeoutMs: 120_000,
  promptCompletionGraceMs: 1_000,
  promptTimeoutMs: 300_000,
  providerInitTimeoutMs: 10_000,
  providerRequestTimeoutMs: 10_000,
};

vi.mock('./acp-cli-provider.js', () => ({
  AcpCliProviderAdapter: class {
    constructor(...args: unknown[]) {
      acpCliFactory(...args);
    }
  },
  OpencodeAcpCliProviderAdapter: class {
    constructor(...args: unknown[]) {
      opencodeFactory(...args);
    }
  },
}));

describe('provider adapter registry', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('creates the dedicated opencode ACP adapter for opencode providers', () => {
    const preset = {
      id: 'opencode',
      providerId: 'opencode',
      name: 'OpenCode',
      description: 'OpenCode AI coding agent',
      command: 'opencode',
      args: ['acp'],
      adapterKind: PROVIDER_ADAPTER_KINDS.opencodeAcpCli,
      cwdArg: '--cwd',
    };
    const launchCommand = {
      command: 'opencode',
      args: ['acp'],
    };

    createProviderAdapter({ preset, launchCommand, timeouts });

    expect(opencodeFactory).toHaveBeenCalledWith(
      preset,
      launchCommand,
      timeouts,
    );
  });

  it('creates the generic ACP CLI adapter for codex providers', () => {
    const preset = {
      id: 'codex',
      providerId: 'codex',
      name: 'Codex',
      description: 'OpenAI Codex CLI (via codex-acp wrapper)',
      command: 'codex-acp',
      args: [],
      adapterKind: PROVIDER_ADAPTER_KINDS.acpCli,
    };
    const launchCommand = {
      command: 'codex-acp',
      args: [],
    };

    createProviderAdapter({ preset, launchCommand, timeouts });

    expect(acpCliFactory).toHaveBeenCalledWith(
      preset,
      launchCommand,
      timeouts,
    );
    expect(opencodeFactory).not.toHaveBeenCalled();
  });
});
