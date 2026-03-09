import { EventEmitter } from 'node:events';
import { spawn } from 'node:child_process';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CodexProviderAdapter } from './codex-provider.js';

vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}));

class FakeChildProcess extends EventEmitter {
  readonly stdout = new EventEmitter();
  readonly stderr = new EventEmitter();
  readonly stdin = {
    write: vi.fn(),
    end: vi.fn(),
  };
  readonly kill = vi.fn();
  exitCode: number | null = null;
}

describe('CodexProviderAdapter', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('passes cwd and env to spawn', () => {
    const childProcess = new FakeChildProcess();
    vi.mocked(spawn).mockReturnValue(childProcess as never);
    const adapter = new CodexProviderAdapter('codex exec -');
    const onChunk = vi.fn();
    const onComplete = vi.fn();
    const onError = vi.fn();

    adapter.prompt(
      {
        sessionId: 'session-1',
        input: 'hello world',
        timeoutMs: 1000,
        traceId: 'trace-1',
        cwd: '/tmp/workspace',
        env: {
          TEAM_AI_STEP: 'planner',
        },
      },
      {
        onChunk,
        onComplete,
        onError,
      }
    );

    expect(spawn).toHaveBeenCalledWith(
      'codex',
      ['exec', '-'],
      expect.objectContaining({
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: false,
        cwd: '/tmp/workspace',
        env: expect.objectContaining({
          TEAM_AI_STEP: 'planner',
        }),
      })
    );
    expect(childProcess.stdin.write).toHaveBeenCalledWith('hello world');
    expect(childProcess.stdin.end).toHaveBeenCalled();

    childProcess.stdout.emit('data', Buffer.from('partial'));
    childProcess.exitCode = 0;
    childProcess.emit('close', 0, null);

    expect(onChunk).toHaveBeenCalledWith('partial');
    expect(onComplete).toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });
});
