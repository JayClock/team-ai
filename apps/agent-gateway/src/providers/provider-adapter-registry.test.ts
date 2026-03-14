import { describe, expect, it, vi } from 'vitest';
import { createProviderAdapter } from './provider-adapter-registry.js';
import { PROVIDER_ADAPTER_KINDS } from './provider-types.js';

const acpCliFactory = vi.fn();
const codexFactory = vi.fn();

vi.mock('./acp-cli-provider.js', () => ({
  AcpCliProviderAdapter: class {
    constructor(...args: unknown[]) {
      acpCliFactory(...args);
    }
  },
}));

vi.mock('./codex-app-server-provider.js', () => ({
  CodexAppServerAdapter: class {
    constructor(...args: unknown[]) {
      codexFactory(...args);
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
    expect(codexFactory).not.toHaveBeenCalled();
  });

  it('creates the codex app-server adapter for codex providers', () => {
    const preset = {
      id: 'codex',
      providerId: 'codex',
      name: 'Codex',
      description: 'OpenAI Codex CLI (via codex app-server)',
      command: 'codex',
      args: ['app-server'],
      adapterKind: PROVIDER_ADAPTER_KINDS.codexAppServer,
    };
    const launchCommand = {
      command: 'codex',
      args: ['app-server'],
    };

    createProviderAdapter({ preset, launchCommand });

    expect(codexFactory).toHaveBeenCalledWith(preset, launchCommand);
  });
});
