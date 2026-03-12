import { EventEmitter } from 'node:events';
import { spawn } from 'node:child_process';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AcpCliProviderAdapter } from './acp-cli-provider.js';

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

describe('AcpCliProviderAdapter', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('starts opencode ACP sessions with --cwd and forwards normalized updates', async () => {
    const childProcess = new FakeChildProcess();
    vi.mocked(spawn).mockReturnValue(childProcess as never);

    const adapter = new AcpCliProviderAdapter(
      {
        id: 'opencode',
        providerId: 'opencode',
        name: 'OpenCode',
        command: 'opencode',
        args: ['acp'],
        cwdArg: '--cwd',
      },
      {
        command: 'opencode',
        args: ['acp'],
      },
    );

    const onChunk = vi.fn();
    const onEvent = vi.fn();
    const onComplete = vi.fn();
    const onError = vi.fn();

    adapter.prompt(
      {
        sessionId: 'session-1',
        input: 'hello opencode',
        timeoutMs: 2_000,
        traceId: 'trace-opencode',
        cwd: '/tmp/workspace',
      },
      {
        onChunk,
        onEvent,
        onComplete,
        onError,
      },
    );

    expect(spawn).toHaveBeenCalledWith(
      'opencode',
      ['acp', '--cwd', '/tmp/workspace'],
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
        protocolVersion: 1,
      },
    });

    await waitForWrites(childProcess, 2);
    const newSessionRequest = readWrite(childProcess, 1);
    expect(newSessionRequest.method).toBe('session/new');
    expect(newSessionRequest.params).toMatchObject({
      cwd: '/tmp/workspace',
      mcpServers: [],
    });

    emitJson(childProcess, {
      jsonrpc: '2.0',
      id: newSessionRequest.id,
      result: {
        sessionId: 'runtime-1',
      },
    });

    await waitForWrites(childProcess, 3);
    const promptRequest = readWrite(childProcess, 2);
    expect(promptRequest.method).toBe('session/prompt');
    expect(promptRequest.params).toMatchObject({
      sessionId: 'runtime-1',
      prompt: [{ type: 'text', text: 'hello opencode' }],
      _meta: {
        traceId: 'trace-opencode',
      },
    });

    emitJson(childProcess, {
      jsonrpc: '2.0',
      id: 99,
      method: 'session/request_permission',
      params: {
        options: [
          {
            optionId: 'allow-once',
            kind: 'allow_once',
          },
        ],
      },
    });

    await waitForWrites(childProcess, 4);
    expect(readWrite(childProcess, 3)).toMatchObject({
      id: 99,
      result: {
        outcome: {
          outcome: 'selected',
          optionId: 'allow-once',
        },
      },
    });

    emitJson(childProcess, {
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        sessionId: 'runtime-1',
        update: {
          sessionUpdate: 'agent_message_chunk',
          content: {
            type: 'text',
            text: 'hello from opencode',
          },
        },
      },
    });
    emitJson(childProcess, {
      jsonrpc: '2.0',
      id: promptRequest.id,
      result: {
        stopReason: 'end_turn',
      },
    });

    await flush();

    expect(onChunk).not.toHaveBeenCalled();
    expect(onEvent).toHaveBeenCalledWith({
      protocol: 'acp',
      payload: {
        type: 'agent_message_chunk',
        sessionUpdate: 'agent_message_chunk',
        content: 'hello from opencode',
        messageId: null,
      },
      traceId: 'trace-opencode',
    });
    expect(onComplete).toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it('cancels active ACP prompts through session/cancel', async () => {
    const childProcess = new FakeChildProcess();
    vi.mocked(spawn).mockReturnValue(childProcess as never);

    const adapter = new AcpCliProviderAdapter(
      {
        id: 'opencode',
        providerId: 'opencode',
        name: 'OpenCode',
        command: 'opencode',
        args: ['acp'],
        cwdArg: '--cwd',
      },
      {
        command: 'opencode',
        args: ['acp'],
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
      result: { protocolVersion: 1 },
    });

    await waitForWrites(childProcess, 2);
    const newSessionRequest = readWrite(childProcess, 1);
    emitJson(childProcess, {
      jsonrpc: '2.0',
      id: newSessionRequest.id,
      result: { sessionId: 'runtime-2' },
    });

    await waitForWrites(childProcess, 3);
    expect(adapter.cancel('session-2')).toBe(true);

    await waitForWrites(childProcess, 4);
    expect(readWrite(childProcess, 3)).toMatchObject({
      method: 'session/cancel',
      params: {
        sessionId: 'runtime-2',
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
  for (let index = 0; index < 20; index += 1) {
    if (childProcess.stdin.write.mock.calls.length >= count) {
      return;
    }
    await flush();
  }

  throw new Error(
    `Expected ${count} writes, received ${childProcess.stdin.write.mock.calls.length}`,
  );
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}
