import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildProviderLaunchCommand,
  createAcpRuntimeClient,
  resolveAcpPromptTransportTimeoutMs,
  resolveAcpRequestTimeoutMs,
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

  it('does not pass -m to the opencode acp subprocess', () => {
    expect(
      buildProviderLaunchCommand(
        'opencode',
        {
          command: 'opencode',
          args: ['acp'],
        },
        '/tmp/workspace',
        'opencode/minimax-m2.5-free',
      ),
    ).toEqual({
      command: 'opencode',
      args: ['acp', '--cwd', '/tmp/workspace'],
    });
  });

  it('still passes -m for non-opencode providers', () => {
    expect(
      buildProviderLaunchCommand(
        'custom-provider',
        {
          command: 'custom-agent',
          args: ['acp'],
        },
        '/tmp/workspace',
        'custom/model-1',
      ),
    ).toEqual({
      command: 'custom-agent',
      args: ['acp', '-m', 'custom/model-1'],
    });
  });

  it('wraps docker-opencode sessions in a docker run command', () => {
    expect(
      buildProviderLaunchCommand(
        'docker-opencode',
        {
          command: 'docker',
          args: ['run', '--rm', '-i'],
        },
        '/tmp/workspace',
      ),
    ).toEqual({
      command: 'docker',
      args: [
        'run',
        '--rm',
        '-i',
        '-v',
        '/tmp/workspace:/tmp/workspace',
        '-w',
        '/tmp/workspace',
        'ghcr.io/sst/opencode:latest',
        'opencode',
        'acp',
        '--cwd',
        '/tmp/workspace',
      ],
    });
  });

  it('uses longer initialize timeouts for npx-based ACP providers', () => {
    expect(resolveAcpRequestTimeoutMs('initialize', 'npx')).toBe(120_000);
    expect(resolveAcpRequestTimeoutMs('session/new', 'uvx')).toBe(120_000);
    expect(resolveAcpRequestTimeoutMs('initialize', 'codex-acp')).toBe(10_000);
  });

  it('keeps prompt transport timeout aligned with routa grace semantics', () => {
    expect(resolveAcpPromptTransportTimeoutMs(1_000)).toBe(30_000);
    expect(resolveAcpPromptTransportTimeoutMs(45_000)).toBe(46_000);
  });
});
