import { EventEmitter } from 'node:events';
import { spawn } from 'node:child_process';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AcpCliProviderAdapter,
  OpencodeAcpCliProviderAdapter,
} from './acp-cli-provider.js';

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

    const adapter = new OpencodeAcpCliProviderAdapter(
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
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        protocol: 'acp',
        update: expect.objectContaining({
          eventType: 'agent_message',
          provider: 'opencode',
          sessionId: 'session-1',
          traceId: 'trace-opencode',
          message: expect.objectContaining({
            role: 'assistant',
            content: 'hello from opencode',
            isChunk: true,
            messageId: null,
          }),
        }),
        traceId: 'trace-opencode',
      }),
    );
    expect(onComplete).toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it('cancels active ACP prompts through session/cancel', async () => {
    const childProcess = new FakeChildProcess();
    vi.mocked(spawn).mockReturnValue(childProcess as never);

    const adapter = new OpencodeAcpCliProviderAdapter(
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

  it('normalizes turn_complete session updates to canonical completion events', async () => {
    const childProcess = new FakeChildProcess();
    vi.mocked(spawn).mockReturnValue(childProcess as never);

    const adapter = new OpencodeAcpCliProviderAdapter(
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

    const onEvent = vi.fn();

    adapter.prompt(
      {
        sessionId: 'session-3',
        input: 'complete me',
        timeoutMs: 2_000,
        traceId: 'trace-complete',
        cwd: '/tmp/workspace',
      },
      {
        onChunk: vi.fn(),
        onEvent,
        onComplete: vi.fn(),
        onError: vi.fn(),
      },
    );

    await waitForWrites(childProcess, 1);
    emitJson(childProcess, {
      jsonrpc: '2.0',
      id: readWrite(childProcess, 0).id,
      result: { protocolVersion: 1 },
    });

    await waitForWrites(childProcess, 2);
    emitJson(childProcess, {
      jsonrpc: '2.0',
      id: readWrite(childProcess, 1).id,
      result: { sessionId: 'runtime-3' },
    });

    await waitForWrites(childProcess, 3);
    const promptRequest = readWrite(childProcess, 2);

    emitJson(childProcess, {
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        sessionId: 'runtime-3',
        update: {
          sessionUpdate: 'turn_complete',
          stopReason: 'end_turn',
          state: 'CANCELLED',
          usage: { inputTokens: 12, outputTokens: 6 },
          userMessageId: 'user-1',
        },
      },
    });
    emitJson(childProcess, {
      jsonrpc: '2.0',
      id: promptRequest.id,
      result: { stopReason: 'end_turn' },
    });

    await flush();

    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        protocol: 'acp',
        update: expect.objectContaining({
          eventType: 'turn_complete',
          provider: 'opencode',
          sessionId: 'session-3',
          traceId: 'trace-complete',
          turnComplete: expect.objectContaining({
            stopReason: 'end_turn',
            state: 'CANCELLED',
            usage: { inputTokens: 12, outputTokens: 6 },
            userMessageId: 'user-1',
          }),
        }),
      }),
    );
  });

  it('normalizes extended acp session updates to canonical shapes', async () => {
    const childProcess = new FakeChildProcess();
    vi.mocked(spawn).mockReturnValue(childProcess as never);

    const adapter = new OpencodeAcpCliProviderAdapter(
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

    const onEvent = vi.fn();

    adapter.prompt(
      {
        sessionId: 'session-4',
        input: 'list commands',
        timeoutMs: 2_000,
        traceId: 'trace-meta',
        cwd: '/tmp/workspace',
      },
      {
        onChunk: vi.fn(),
        onEvent,
        onComplete: vi.fn(),
        onError: vi.fn(),
      },
    );

    await waitForWrites(childProcess, 1);
    emitJson(childProcess, {
      jsonrpc: '2.0',
      id: readWrite(childProcess, 0).id,
      result: { protocolVersion: 1 },
    });

    await waitForWrites(childProcess, 2);
    emitJson(childProcess, {
      jsonrpc: '2.0',
      id: readWrite(childProcess, 1).id,
      result: { sessionId: 'runtime-4' },
    });

    await waitForWrites(childProcess, 3);
    const promptRequest = readWrite(childProcess, 2);

    emitJson(childProcess, {
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        sessionId: 'runtime-4',
        update: {
          sessionUpdate: 'available_commands_update',
          availableCommands: [{ name: 'ship-it', description: 'Deploy now' }],
        },
      },
    });
    emitJson(childProcess, {
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        sessionId: 'runtime-4',
        update: {
          sessionUpdate: 'session_info_update',
          title: 'Renamed Session',
          updatedAt: '2026-03-14T10:00:00.000Z',
        },
      },
    });
    emitJson(childProcess, {
      jsonrpc: '2.0',
      id: promptRequest.id,
      result: { stopReason: 'end_turn' },
    });

    await flush();

    expect(onEvent).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        protocol: 'acp',
        update: expect.objectContaining({
          eventType: 'available_commands_update',
          availableCommands: [
            { name: 'ship-it', description: 'Deploy now' },
          ],
        }),
      }),
    );
    expect(onEvent).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        protocol: 'acp',
        update: expect.objectContaining({
          eventType: 'session_info_update',
          sessionInfo: {
            title: 'Renamed Session',
            updatedAt: '2026-03-14T10:00:00.000Z',
          },
        }),
      }),
    );
  });

  it('exposes shared adapter behavior and normalizeNotification contract', () => {
    const adapter = new OpencodeAcpCliProviderAdapter(
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

    expect(adapter.getBehavior()).toEqual({
      immediateToolInput: false,
      protocol: 'acp',
      streaming: true,
      toolInputMode: 'deferred',
    });

    expect(
      adapter.normalizeNotification('session-contract', 'trace-contract', {
        sessionUpdate: 'tool_call_update',
        toolCallId: 'tool-contract',
        kind: 'read_file',
        status: 'completed',
        rawInput: {
          path: 'README.md',
        },
        rawOutput: 'done',
        locations: [],
        content: [],
      }),
    ).toMatchObject({
      eventType: 'tool_call_update',
      traceId: 'trace-contract',
      toolCall: {
        toolCallId: 'tool-contract',
        kind: 'read_file',
        status: 'completed',
        inputFinalized: true,
        output: 'done',
      },
    });
  });

  it('keeps generic ACP CLI providers on the standard tool input path', () => {
    const adapter = new AcpCliProviderAdapter(
      {
        id: 'codex',
        providerId: 'codex',
        name: 'Codex',
        command: 'codex-acp',
        args: [],
      },
      {
        command: 'codex-acp',
        args: [],
      },
    );

    expect(adapter.getBehavior()).toEqual({
      immediateToolInput: false,
      protocol: 'acp',
      streaming: true,
      toolInputMode: 'standard',
    });

    expect(
      adapter.normalizeNotification('session-contract', 'trace-contract', {
        sessionUpdate: 'tool_call',
        toolCallId: 'tool-contract',
        kind: 'read_file',
        status: 'running',
        rawInput: {
          path: 'README.md',
        },
        locations: [],
        content: [],
      }),
    ).toMatchObject({
      eventType: 'tool_call',
      traceId: 'trace-contract',
      toolCall: {
        toolCallId: 'tool-contract',
        kind: 'read_file',
        status: 'running',
        input: {
          path: 'README.md',
        },
        inputFinalized: true,
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
