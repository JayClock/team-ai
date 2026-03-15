import { describe, expect, it, vi } from 'vitest';
import { createProviderAdapter } from './provider-adapter-registry.js';
import { PROVIDER_ADAPTER_KINDS } from './provider-types.js';

const acpCliFactory = vi.fn();

vi.mock('./acp-cli-provider.js', () => ({
  AcpCliProviderAdapter: class {
    constructor(...args: unknown[]) {
      acpCliFactory(...args);
    }
  },
}));

describe('provider adapter registry', () => {
  it('creates the generic ACP CLI adapter for acp-cli providers', () => {
    const preset = {
      id: 'opencode',
      providerId: 'opencode',
      name: 'OpenCode',
      description: 'OpenCode AI coding agent',
      command: 'opencode',
      args: ['acp'],
      adapterKind: PROVIDER_ADAPTER_KINDS.acpCli,
      cwdArg: '--cwd',
    };
    const launchCommand = {
      command: 'opencode',
      args: ['acp'],
    };

    createProviderAdapter({ preset, launchCommand });

    expect(acpCliFactory).toHaveBeenCalledWith(preset, launchCommand);
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

    createProviderAdapter({ preset, launchCommand });

    expect(acpCliFactory).toHaveBeenCalledWith(preset, launchCommand);
  });
});
