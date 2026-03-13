import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildProviderLaunchCommand,
  createAcpRuntimeClient,
} from './acp-runtime-client';

describe('acp-runtime-client provider configuration', () => {
  const originalCodexCommand = process.env.TEAMAI_ACP_CODEX_COMMAND;

  afterEach(() => {
    if (originalCodexCommand === undefined) {
      delete process.env.TEAMAI_ACP_CODEX_COMMAND;
    } else {
      process.env.TEAMAI_ACP_CODEX_COMMAND = originalCodexCommand;
    }
    vi.unstubAllEnvs();
  });

  it('treats codex as configured by default', () => {
    vi.stubEnv('TEAMAI_ACP_CODEX_COMMAND', '');

    const client = createAcpRuntimeClient();

    expect(client.isConfigured('codex')).toBe(true);
  });

  it('treats codex-acp as a codex alias for configuration checks', () => {
    vi.stubEnv('TEAMAI_ACP_CODEX_COMMAND', '');

    const client = createAcpRuntimeClient();

    expect(client.isConfigured('codex-acp')).toBe(true);
  });

  it('lets explicit env override the default command', () => {
    vi.stubEnv('TEAMAI_ACP_CODEX_COMMAND', 'custom-codex --acp');

    const client = createAcpRuntimeClient();

    expect(client.isConfigured('codex')).toBe(true);
    expect(client.isConfigured('custom-provider')).toBe(false);
  });

  it('adds --cwd when launching opencode ACP sessions', () => {
    expect(
      buildProviderLaunchCommand(
        'opencode',
        {
          command: 'opencode',
          args: ['acp'],
        },
        '/tmp/workspace',
      ),
    ).toEqual({
      command: 'opencode',
      args: ['acp', '--cwd', '/tmp/workspace'],
    });
  });

  it('does not duplicate --cwd when opencode already declares it', () => {
    expect(
      buildProviderLaunchCommand(
        'opencode',
        {
          command: 'opencode',
          args: ['acp', '--cwd', '/tmp/workspace'],
        },
        '/tmp/workspace',
      ),
    ).toEqual({
      command: 'opencode',
      args: ['acp', '--cwd', '/tmp/workspace'],
    });
  });
});
