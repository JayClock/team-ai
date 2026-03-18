import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GatewayTimeoutConfig } from '../config.js';
import { PROVIDER_ADAPTER_KINDS } from './provider-types.js';
import type { ResolvedAcpCliProviderPreset } from './provider-presets.js';

const { spawnMock } = vi.hoisted(() => ({
  spawnMock: vi.fn(),
}));

vi.mock(import('node:child_process'), async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import('node:child_process');
  return {
    ...actual,
    default: {
      ...actual,
      spawn: spawnMock,
    },
    spawn: spawnMock,
  };
});

async function loadAcpCliProviderModule() {
  return await import('./acp-cli-provider.js');
}

const opencodePreset: ResolvedAcpCliProviderPreset = {
  id: 'opencode',
  providerId: 'opencode',
  name: 'OpenCode',
  description: 'OpenCode AI coding agent',
  command: 'opencode',
  args: ['acp'],
  adapterKind: PROVIDER_ADAPTER_KINDS.opencodeAcpCli,
  cwdArg: '--cwd',
};

const codexPreset: ResolvedAcpCliProviderPreset = {
  id: 'codex',
  providerId: 'codex',
  name: 'Codex',
  description: 'OpenAI Codex CLI (via codex-acp wrapper)',
  command: 'codex-acp',
  args: [],
  adapterKind: PROVIDER_ADAPTER_KINDS.acpCli,
};

const timeoutConfig: GatewayTimeoutConfig = {
  promptTimeoutMs: 300_000,
  promptCompletionGraceMs: 1_000,
  cancelGraceMs: 1_000,
  providerInitTimeoutMs: 10_000,
  packageManagerInitTimeoutMs: 120_000,
  providerRequestTimeoutMs: 10_000,
  minimumPromptTransportMs: 30_000,
};

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
    spawnMock.mockReturnValue(childProcess as never);
    const { OpencodeAcpCliProviderAdapter } = await loadAcpCliProviderModule();

    const adapter = new OpencodeAcpCliProviderAdapter(
      opencodePreset,
      {
        command: 'opencode',
        args: ['acp'],
      },
      timeoutConfig,
    );

    const onChunk = vi.fn();
    const onEvent = vi.fn();
    const onComplete = vi.fn();
    const onError = vi.fn();

    adapter.prompt(
      {
        sessionId: 'session-1',
        input: 'hello opencode',
        model: 'openai/gpt-5',
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

    expect(spawnMock).toHaveBeenCalledWith(
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
      model: 'openai/gpt-5',
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

  it('uses routa-style init timeouts for npx and uvx runtimes', async () => {
    const { resolveAcpCliRequestTimeoutMs } = await loadAcpCliProviderModule();

    expect(resolveAcpCliRequestTimeoutMs('initialize', 'npx', timeoutConfig)).toBe(120_000);
    expect(resolveAcpCliRequestTimeoutMs('session/new', 'uvx', timeoutConfig)).toBe(120_000);
    expect(resolveAcpCliRequestTimeoutMs('initialize', 'opencode', timeoutConfig)).toBe(
      10_000,
    );
    expect(resolveAcpCliRequestTimeoutMs('session/prompt', 'npx', timeoutConfig)).toBe(10_000);
  });

  it('cancels active ACP prompts through session/cancel', async () => {
    const childProcess = new FakeChildProcess();
    spawnMock.mockReturnValue(childProcess as never);
    const { OpencodeAcpCliProviderAdapter } = await loadAcpCliProviderModule();

    const adapter = new OpencodeAcpCliProviderAdapter(
      opencodePreset,
      {
        command: 'opencode',
        args: ['acp'],
      },
      timeoutConfig,
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

  it('fails loudly when session/new rejects the requested model', async () => {
    const childProcess = new FakeChildProcess();
    spawnMock.mockReturnValue(childProcess as never);
    const { OpencodeAcpCliProviderAdapter } = await loadAcpCliProviderModule();

    const adapter = new OpencodeAcpCliProviderAdapter(
      opencodePreset,
      {
        command: 'opencode',
        args: ['acp'],
      },
      timeoutConfig,
    );

    const onError = vi.fn();

    adapter.prompt(
      {
        sessionId: 'session-model-error',
        input: 'hello opencode',
        model: 'openai/does-not-exist',
        timeoutMs: 2_000,
        cwd: '/tmp/workspace',
      },
      {
        onChunk: vi.fn(),
        onEvent: vi.fn(),
        onComplete: vi.fn(),
        onError,
      },
    );

    await waitForWrites(childProcess, 1);
    emitJson(childProcess, {
      jsonrpc: '2.0',
      id: readWrite(childProcess, 0).id,
      result: { protocolVersion: 1 },
    });

    await waitForWrites(childProcess, 2);
    const newSessionRequest = readWrite(childProcess, 1);
    expect(newSessionRequest.params).toMatchObject({
      model: 'openai/does-not-exist',
    });

    emitJson(childProcess, {
      jsonrpc: '2.0',
      id: newSessionRequest.id,
      error: {
        code: -32000,
        message: 'unsupported model',
      },
    });

    await flush();

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'PROVIDER_PROMPT_FAILED',
        message: expect.stringContaining('unsupported model'),
      }),
    );
  });

  it('normalizes turn_complete session updates to canonical completion events', async () => {
    const childProcess = new FakeChildProcess();
    spawnMock.mockReturnValue(childProcess as never);
    const { OpencodeAcpCliProviderAdapter } = await loadAcpCliProviderModule();

    const adapter = new OpencodeAcpCliProviderAdapter(
      opencodePreset,
      {
        command: 'opencode',
        args: ['acp'],
      },
      timeoutConfig,
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
    spawnMock.mockReturnValue(childProcess as never);
    const { OpencodeAcpCliProviderAdapter } = await loadAcpCliProviderModule();

    const adapter = new OpencodeAcpCliProviderAdapter(
      opencodePreset,
      {
        command: 'opencode',
        args: ['acp'],
      },
      timeoutConfig,
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
          availableCommands: [{ name: 'ship-it', description: 'Deploy now' }],
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

  it('exposes shared adapter behavior and normalizeNotification contract', async () => {
    const { OpencodeAcpCliProviderAdapter } = await loadAcpCliProviderModule();

    const adapter = new OpencodeAcpCliProviderAdapter(
      opencodePreset,
      {
        command: 'opencode',
        args: ['acp'],
      },
      timeoutConfig,
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

  it('keeps generic ACP CLI providers on the standard tool input path', async () => {
    const { AcpCliProviderAdapter } = await loadAcpCliProviderModule();

    const adapter = new AcpCliProviderAdapter(
      codexPreset,
      {
        command: 'codex-acp',
        args: [],
      },
      timeoutConfig,
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
