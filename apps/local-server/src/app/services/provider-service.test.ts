import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProblemError } from '../errors/problem-error';
import {
  clearProviderModelCache,
  listProviderModels,
  listProviders,
} from './provider-service';

describe('provider service', () => {
  afterEach(() => {
    clearProviderModelCache();
  });

  it('lists providers that support scoped model discovery', async () => {
    await expect(listProviders()).resolves.toEqual([
      {
        defaultModel: null,
        id: 'opencode',
        modelsHref: '/api/providers/opencode/models',
        name: 'OpenCode',
      },
    ]);
  });

  it('parses runtime-discovered models for opencode', async () => {
    const models = await listProviderModels('opencode', {
      runCommand: vi.fn(async () => ({
        stdout: [
          'openai/gpt-5-mini',
          'openai/gpt-5',
          'invalid-line',
          'openai/gpt-5-mini',
        ].join('\n'),
        stderr: '',
      })),
    });

    expect(models).toEqual([
      {
        id: 'openai/gpt-5-mini',
        name: 'openai/gpt-5-mini',
        providerId: 'opencode',
      },
      {
        id: 'openai/gpt-5',
        name: 'openai/gpt-5',
        providerId: 'opencode',
      },
    ]);
  });

  it('caches runtime model discovery for a short ttl', async () => {
    let now = 1_000;
    const runCommand = vi.fn(async () => ({
      stdout: 'openai/gpt-5-mini',
      stderr: '',
    }));

    await listProviderModels('opencode', {
      now: () => now,
      runCommand,
    });
    await listProviderModels('opencode', {
      now: () => now + 30_000,
      runCommand,
    });

    now += 61_000;
    await listProviderModels('opencode', {
      now: () => now,
      runCommand,
    });

    expect(runCommand).toHaveBeenCalledTimes(2);
  });

  it('returns a clear error when the provider command is missing', async () => {
    const error = await listProviderModels('opencode', {
      runCommand: vi.fn(async () => {
        const missingCommandError = new Error(
          'spawn opencode ENOENT',
        ) as Error & {
          code?: string;
        };
        missingCommandError.code = 'ENOENT';
        throw missingCommandError;
      }),
    }).catch((value: unknown) => value);

    expect(error).toBeInstanceOf(ProblemError);
    expect(error).toMatchObject({
      status: 503,
      title: 'Provider Model Command Missing',
    });
    expect((error as ProblemError).message).toBe(
      'Provider opencode cannot list models because "opencode" is not available',
    );
  });
});
