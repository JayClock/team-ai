import { EventEmitter } from 'node:events';
import { spawn } from 'node:child_process';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CodexAppServerAdapter } from './codex-app-server-provider.js';

vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}));

class FakeChildProcess extends EventEmitter {
  readonly stdout = new EventEmitter();
  readonly stderr = new EventEmitter();
  readonly stdin = {
    writable: true,
    write: vi.fn(),
  };
  readonly kill = vi.fn();
  exitCode: number | null = null;
}

describe('CodexAppServerAdapter', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('starts a Codex app-server thread and forwards agent message deltas', async () => {
    const childProcess = new FakeChildProcess();
    vi.mocked(spawn).mockReturnValue(childProcess as never);

    const adapter = new CodexAppServerAdapter(
      {
        id: 'codex',
        providerId: 'codex',
        name: 'Codex',
        command: 'codex',
        args: ['app-server'],
      },
      {
        command: 'codex',
        args: ['app-server'],
      },
    );

    const onEvent = vi.fn();
    const onComplete = vi.fn();
    const onError = vi.fn();

    adapter.prompt(
      {
        sessionId: 'session-1',
        input: 'hello codex',
        timeoutMs: 2_000,
        traceId: 'trace-codex',
        cwd: '/tmp/workspace',
      },
      {
        onChunk: vi.fn(),
        onEvent,
        onComplete,
        onError,
      },
    );

    expect(spawn).toHaveBeenCalledWith(
      'codex',
      ['app-server'],
      expect.objectContaining({
        cwd: '/tmp/workspace',
        shell: false,
        stdio: ['pipe', 'pipe', 'pipe'],
      }),
    );

    await waitForWrites(childProcess, 1);
    const initializeRequest = readWrite(childProcess, 0);
    expect(initializeRequest.method).toBe('initialize');

    emitJson(childProcess, {
      jsonrpc: '2.0',
      id: initializeRequest.id,
      result: {
        userAgent: 'probe/0.114.0',
      },
    });

    await waitForWrites(childProcess, 3);
    expect(readWrite(childProcess, 1)).toMatchObject({
      method: 'initialized',
    });
    const threadStartRequest = readWrite(childProcess, 2);
    expect(threadStartRequest.method).toBe('thread/start');
    expect(threadStartRequest.params).toMatchObject({
      cwd: '/tmp/workspace',
      approvalPolicy: 'never',
      experimentalRawEvents: false,
      persistExtendedHistory: false,
    });

    emitJson(childProcess, {
      jsonrpc: '2.0',
      id: threadStartRequest.id,
      result: {
        thread: {
          id: 'thread-1',
        },
      },
    });

    await waitForWrites(childProcess, 4);
    const turnStartRequest = readWrite(childProcess, 3);
    expect(turnStartRequest.method).toBe('turn/start');
    expect(turnStartRequest.params).toMatchObject({
      threadId: 'thread-1',
      input: [
        {
          type: 'text',
          text: 'hello codex',
          text_elements: [],
        },
      ],
      cwd: '/tmp/workspace',
    });

    emitJson(childProcess, {
      jsonrpc: '2.0',
      id: turnStartRequest.id,
      result: {
        turn: {
          id: 'turn-1',
          status: 'inProgress',
          error: null,
        },
      },
    });

    emitJson(childProcess, {
      jsonrpc: '2.0',
      method: 'item/agentMessage/delta',
      params: {
        threadId: 'thread-1',
        turnId: 'turn-1',
        itemId: 'msg-1',
        delta: 'hello from codex',
      },
    });
    emitJson(childProcess, {
      jsonrpc: '2.0',
      method: 'turn/completed',
      params: {
        threadId: 'thread-1',
        turn: {
          id: 'turn-1',
          status: 'completed',
          error: null,
        },
      },
    });

    await vi.waitFor(() => {
      expect(onEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          protocol: 'acp',
          update: expect.objectContaining({
            eventType: 'agent_message',
            provider: 'codex',
            sessionId: 'session-1',
            traceId: 'trace-codex',
            message: expect.objectContaining({
              role: 'assistant',
              content: 'hello from codex',
              isChunk: true,
              messageId: 'msg-1',
            }),
          }),
          traceId: 'trace-codex',
        }),
      );
    });
    await vi.waitFor(() => {
      expect(onComplete).toHaveBeenCalledTimes(1);
    });
    expect(onError).not.toHaveBeenCalled();
  });

  it('interrupts the active turn when cancelled', async () => {
    const childProcess = new FakeChildProcess();
    vi.mocked(spawn).mockReturnValue(childProcess as never);

    const adapter = new CodexAppServerAdapter(
      {
        id: 'codex',
        providerId: 'codex',
        name: 'Codex',
        command: 'codex',
        args: ['app-server'],
      },
      {
        command: 'codex',
        args: ['app-server'],
      },
    );

    adapter.prompt(
      {
        sessionId: 'session-2',
        input: 'please cancel',
        timeoutMs: 2_000,
        cwd: '/tmp/workspace',
      },
      {
        onChunk: vi.fn(),
        onEvent: vi.fn(),
        onComplete: vi.fn(),
        onError: vi.fn(),
      },
    );

    await waitForWrites(childProcess, 1);
    const initializeRequest = readWrite(childProcess, 0);
    emitJson(childProcess, {
      jsonrpc: '2.0',
      id: initializeRequest.id,
      result: { userAgent: 'probe/0.114.0' },
    });

    await waitForWrites(childProcess, 3);
    const threadStartRequest = readWrite(childProcess, 2);
    emitJson(childProcess, {
      jsonrpc: '2.0',
      id: threadStartRequest.id,
      result: { thread: { id: 'thread-2' } },
    });

    await waitForWrites(childProcess, 4);
    const turnStartRequest = readWrite(childProcess, 3);
    emitJson(childProcess, {
      jsonrpc: '2.0',
      id: turnStartRequest.id,
      result: {
        turn: {
          id: 'turn-2',
          status: 'inProgress',
          error: null,
        },
      },
    });
    emitJson(childProcess, {
      jsonrpc: '2.0',
      method: 'turn/started',
      params: {
        threadId: 'thread-2',
        turn: {
          id: 'turn-2',
          status: 'inProgress',
          error: null,
        },
      },
    });

    expect(adapter.cancel('session-2')).toBe(true);

    await waitForWrites(childProcess, 5);
    expect(readWrite(childProcess, 4)).toMatchObject({
      method: 'turn/interrupt',
      params: {
        threadId: 'thread-2',
        turnId: 'turn-2',
      },
    });
  });
});

function emitJson(
  childProcess: FakeChildProcess,
  payload: Record<string, unknown>,
): void {
  childProcess.stdout.emit('data', Buffer.from(`${JSON.stringify(payload)}\n`));
}

function readWrite(
  childProcess: FakeChildProcess,
  index: number,
): Record<string, unknown> {
  return JSON.parse(
    childProcess.stdin.write.mock.calls[index][0].trim(),
  ) as Record<string, unknown>;
}

async function waitForWrites(
  childProcess: FakeChildProcess,
  count: number,
): Promise<void> {
  await vi.waitFor(() => {
    expect(childProcess.stdin.write).toHaveBeenCalledTimes(count);
  });
}
