import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import type {
  NormalizedAcpToolCall,
  NormalizedAcpUpdate,
  ProviderAdapter,
  ProviderError,
  ProviderPromptCallbacks,
  ProviderPromptRequest,
} from './provider-types.js';
import type { ResolvedAcpCliProviderPreset } from './provider-presets.js';

const DEFAULT_CANCEL_GRACE_MS = 3_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;

type JsonRpcMessage = {
  error?: {
    code: number;
    data?: unknown;
    message: string;
  };
  id?: number | string;
  jsonrpc: '2.0';
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
};

type PendingRequest = {
  reject: (reason: Error) => void;
  resolve: (value: unknown) => void;
  timeout: ReturnType<typeof setTimeout>;
};

type CompletionOutcome = 'cancelled' | 'completed';

type ActiveRun = {
  callbacks: ProviderPromptCallbacks;
  messageLengths: Map<string, number>;
  planItems: Array<{ content: string; status: 'completed' | 'in_progress' | 'pending' }>;
  rejectCompletion: (reason: Error) => void;
  resolveCompletion: (value: CompletionOutcome) => void;
  settled: boolean;
  traceId?: string;
  turnId?: string;
};

type ActiveSession = {
  buffer: string;
  child: ChildProcessWithoutNullStreams;
  cwd?: string;
  pendingRequests: Map<number, PendingRequest>;
  requestId: number;
  run: ActiveRun | null;
  runtimeThreadId: string;
  sessionId: string;
  stderr: string;
};

export class CodexAppServerAdapter implements ProviderAdapter {
  readonly name: string;

  private readonly baseArgs: string[];
  private readonly command: string;
  private readonly sessions = new Map<string, ActiveSession>();
  private readonly startingSessions = new Map<string, Promise<ActiveSession>>();

  constructor(
    private readonly preset: ResolvedAcpCliProviderPreset,
    launchCommand: {
      args: string[];
      command: string;
    },
  ) {
    this.name = preset.providerId;
    this.command = launchCommand.command;
    this.baseArgs = [...launchCommand.args];
  }

  prompt(
    request: ProviderPromptRequest,
    callbacks: ProviderPromptCallbacks,
  ): void {
    void this.runPrompt(request, callbacks);
  }

  cancel(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    const turnId = session?.run?.turnId;
    if (!session?.run || !turnId) {
      return false;
    }

    this.writeMessage(session, {
      jsonrpc: '2.0',
      method: 'turn/interrupt',
      params: {
        threadId: session.runtimeThreadId,
        turnId,
      },
    });

    return true;
  }

  async close(): Promise<void> {
    const activeSessions = [...this.sessions.values()];
    this.sessions.clear();
    this.startingSessions.clear();
    await Promise.all(
      activeSessions.map((session) => this.disposeSession(session, true)),
    );
  }

  private async runPrompt(
    request: ProviderPromptRequest,
    callbacks: ProviderPromptCallbacks,
  ): Promise<void> {
    let session: ActiveSession | null = null;

    try {
      session = await this.ensureSession(request);
      if (session.run) {
        callbacks.onError({
          code: 'PROVIDER_SESSION_BUSY',
          message: `Session already has an active run: ${request.sessionId}`,
          retryable: false,
          retryAfterMs: 0,
        });
        return;
      }

      let resolveCompletion!: (value: CompletionOutcome) => void;
      let rejectCompletion!: (reason: Error) => void;
      const completion = new Promise<CompletionOutcome>((resolve, reject) => {
        resolveCompletion = resolve;
        rejectCompletion = reject;
      });

      session.run = {
        callbacks,
        messageLengths: new Map(),
        planItems: [],
        rejectCompletion,
        resolveCompletion,
        settled: false,
        traceId: request.traceId,
      };

      const started = asRecord(
        await this.sendRequest(
          session,
          'turn/start',
          {
            threadId: session.runtimeThreadId,
            input: [
              {
                type: 'text',
                text: request.input,
                text_elements: [],
              },
            ],
            ...(request.cwd ? { cwd: request.cwd } : {}),
          },
          Math.max(request.timeoutMs + 1_000, 30_000),
        ),
      );

      const turn = asRecord(started.turn);
      const turnId = asString(turn.id)?.trim();
      if (!turnId) {
        throw new Error(`${this.preset.name} did not return a turn id`);
      }

      if (!session.run || session.run.settled) {
        return;
      }
      session.run.turnId = turnId;

      const initialStatus = asString(turn.status);
      if (initialStatus === 'failed') {
        throw buildCodexTurnError(this.preset.name, turn.error);
      }

      const outcome = await this.withPromptTimeout(
        session,
        completion,
        request.timeoutMs,
      );

      if (!session.run || session.run.settled) {
        return;
      }

      session.run.settled = true;
      session.run = null;

      if (outcome === 'cancelled') {
        callbacks.onError(
          createProviderError(
            'PROVIDER_CANCELLED',
            `${this.preset.name} run cancelled`,
            false,
            0,
          ),
        );
        return;
      }

      callbacks.onComplete();
    } catch (error) {
      if (session?.run && !session.run.settled) {
        session.run.settled = true;
        session.run = null;
      }

      callbacks.onError(
        normalizeProviderError(error, this.preset.name, request.timeoutMs),
      );
    }
  }

  private async ensureSession(
    request: ProviderPromptRequest,
  ): Promise<ActiveSession> {
    const active = this.sessions.get(request.sessionId);
    if (active) {
      return active;
    }

    const pending = this.startingSessions.get(request.sessionId);
    if (pending) {
      return await pending;
    }

    const starting = this.startSession(request)
      .then((session) => {
        this.sessions.set(request.sessionId, session);
        return session;
      })
      .finally(() => {
        this.startingSessions.delete(request.sessionId);
      });

    this.startingSessions.set(request.sessionId, starting);
    return await starting;
  }

  private async startSession(
    request: ProviderPromptRequest,
  ): Promise<ActiveSession> {
    const child = spawn(this.command, [...this.baseArgs], {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false,
      ...(request.cwd ? { cwd: request.cwd } : {}),
      ...(request.env
        ? { env: { ...process.env, ...request.env } }
        : { env: process.env }),
    });

    const session: ActiveSession = {
      sessionId: request.sessionId,
      child,
      buffer: '',
      cwd: request.cwd,
      pendingRequests: new Map(),
      requestId: 0,
      run: null,
      runtimeThreadId: '',
      stderr: '',
    };

    child.stdout.on('data', (chunk: Buffer) => {
      this.processStdout(session, chunk);
    });

    child.stderr.on('data', (chunk: Buffer) => {
      session.stderr = appendBoundedText(
        session.stderr,
        chunk.toString('utf-8'),
      );
    });

    child.on('error', (error: Error) => {
      this.failSession(
        session,
        createProviderError(
          'PROVIDER_PROCESS_START_FAILED',
          `Failed to start ${this.preset.name}: ${error.message}`,
          true,
          1_000,
        ),
      );
    });

    child.on(
      'close',
      (exitCode: number | null, signal: NodeJS.Signals | null) => {
        const suffix = session.stderr.trim()
          ? `: ${session.stderr.trim()}`
          : '';
        const error =
          signal === 'SIGTERM' || signal === 'SIGKILL'
            ? createProviderError(
                'PROVIDER_CANCELLED',
                `${this.preset.name} run cancelled (${signal})`,
                false,
                0,
              )
            : createProviderError(
                'PROVIDER_PROCESS_EXITED',
                `${this.preset.name} exited with code ${exitCode ?? -1}${suffix}`,
                true,
                1_000,
              );
        this.failSession(session, error);
      },
    );

    await this.sendRequest(session, 'initialize', {
      clientInfo: {
        name: 'team-ai-agent-gateway',
        version: 'desktop',
      },
      capabilities: null,
    });

    this.writeMessage(session, {
      jsonrpc: '2.0',
      method: 'initialized',
    });

    const created = asRecord(
      await this.sendRequest(session, 'thread/start', {
        cwd: request.cwd,
        approvalPolicy: 'never',
        experimentalRawEvents: false,
        persistExtendedHistory: false,
      }),
    );

    const runtimeThreadId = asString(asRecord(created.thread).id)?.trim();
    if (!runtimeThreadId) {
      await this.disposeSession(session, true);
      throw new Error(`${this.preset.name} did not return a thread id`);
    }

    session.runtimeThreadId = runtimeThreadId;
    return session;
  }

  private processStdout(session: ActiveSession, chunk: Buffer): void {
    session.buffer += chunk.toString('utf-8');

    let newlineIndex = session.buffer.indexOf('\n');
    while (newlineIndex >= 0) {
      const line = session.buffer.slice(0, newlineIndex).trim();
      session.buffer = session.buffer.slice(newlineIndex + 1);

      if (line) {
        this.handleLine(session, line);
      }

      newlineIndex = session.buffer.indexOf('\n');
    }
  }

  private handleLine(session: ActiveSession, line: string): void {
    let message: JsonRpcMessage;

    try {
      message = JSON.parse(line) as JsonRpcMessage;
    } catch {
      return;
    }

    if (
      message.id !== undefined &&
      (message.result !== undefined || message.error !== undefined)
    ) {
      const pending = this.resolvePendingRequest(session, message.id);
      if (!pending) {
        return;
      }

      if (message.error) {
        pending.reject(
          new Error(
            `Codex Error [${message.error.code}]: ${message.error.message}`,
          ),
        );
        return;
      }

      pending.resolve(message.result);
      return;
    }

    if (message.id !== undefined && message.method) {
      this.handleServerRequest(session, message);
      return;
    }

    if (!message.method) {
      return;
    }

    this.handleNotification(session, message.method, asRecord(message.params));
  }

  private handleNotification(
    session: ActiveSession,
    method: string,
    params: Record<string, unknown>,
  ): void {
    const run = session.run;
    if (!run || run.settled) {
      return;
    }

    switch (method) {
      case 'error': {
        run.rejectCompletion(
          new Error(
            asString(params.message) ??
              `${this.preset.name} returned an unknown protocol error`,
          ),
        );
        return;
      }

      case 'turn/started': {
        const turnId = asString(asRecord(params.turn).id);
        if (turnId && !run.turnId) {
          run.turnId = turnId;
        }
        return;
      }

      case 'item/agentMessage/delta': {
        const itemId = asString(params.itemId) ?? undefined;
        const delta = asString(params.delta);
        if (!delta) {
          return;
        }

        if (itemId) {
          const previousLength = run.messageLengths.get(itemId) ?? 0;
          run.messageLengths.set(itemId, previousLength + delta.length);
        }

        run.callbacks.onEvent({
          protocol: 'acp',
          update: createAcpUpdate(session.sessionId, this.preset.providerId, 'agent_message', {
            traceId: run.traceId,
            rawNotification: params,
            message: {
              role: 'assistant',
              content: delta,
              contentBlock: { type: 'text', text: delta },
              isChunk: true,
              messageId: itemId ?? null,
            },
          }),
          traceId: run.traceId,
        });
        return;
      }

      case 'item/reasoning/textDelta':
      case 'item/reasoning/summaryTextDelta': {
        const delta = asString(params.delta);
        if (!delta) {
          return;
        }

        run.callbacks.onEvent({
          protocol: 'acp',
          update: createAcpUpdate(session.sessionId, this.preset.providerId, 'agent_thought', {
            traceId: run.traceId,
            rawNotification: params,
            message: {
              role: 'thought',
              content: delta,
              contentBlock: { type: 'text', text: delta },
              isChunk: true,
              messageId: asString(params.itemId) ?? null,
            },
          }),
          traceId: run.traceId,
        });
        return;
      }

      case 'turn/plan/updated': {
        const plan = Array.isArray(params.plan) ? params.plan : [];
        run.planItems = plan.map((step) => ({
          content: asString(asRecord(step).step) ?? '',
          status: normalizePlanStatus(asString(asRecord(step).status)),
        }));

        run.callbacks.onEvent({
          protocol: 'acp',
          update: createAcpUpdate(session.sessionId, this.preset.providerId, 'plan_update', {
            traceId: run.traceId,
            rawNotification: params,
            planItems: run.planItems.map((item) => ({
              description: item.content,
              status: item.status,
            })),
          }),
          traceId: run.traceId,
        });
        return;
      }

      case 'item/started': {
        const toolPayload = toToolPayload(asRecord(params.item), false);
        if (!toolPayload) {
          return;
        }

        run.callbacks.onEvent({
          protocol: 'acp',
          update: createAcpUpdate(
            session.sessionId,
            this.preset.providerId,
            'tool_call',
            {
              traceId: run.traceId,
              rawNotification: params,
              toolCall: toolPayload,
            },
          ),
          traceId: run.traceId,
        });
        return;
      }

      case 'item/completed': {
        const item = asRecord(params.item);
        const type = asString(item.type);

        if (type === 'agentMessage') {
          const itemId = asString(item.id);
          const text = asString(item.text);
          if (itemId && text) {
            const previousLength = run.messageLengths.get(itemId) ?? 0;
            const remainder = text.slice(previousLength);
            if (remainder.length > 0) {
              run.messageLengths.set(itemId, text.length);
              run.callbacks.onEvent({
                protocol: 'acp',
                update: createAcpUpdate(
                  session.sessionId,
                  this.preset.providerId,
                  'agent_message',
                  {
                    traceId: run.traceId,
                    rawNotification: item,
                    message: {
                      role: 'assistant',
                      content: remainder,
                      contentBlock: { type: 'text', text: remainder },
                      isChunk: true,
                      messageId: itemId,
                    },
                  },
                ),
                traceId: run.traceId,
              });
            }
          }
          return;
        }

        const toolPayload = toToolPayload(item, true);
        if (!toolPayload) {
          return;
        }

        run.callbacks.onEvent({
          protocol: 'acp',
          update: createAcpUpdate(
            session.sessionId,
            this.preset.providerId,
            'tool_call_update',
            {
              traceId: run.traceId,
              rawNotification: params,
              toolCall: toolPayload,
            },
          ),
          traceId: run.traceId,
        });
        return;
      }

      case 'turn/completed': {
        const turn = asRecord(params.turn);
        const turnId = asString(turn.id);
        if (turnId && !run.turnId) {
          run.turnId = turnId;
        }
        if (run.turnId && turnId && run.turnId !== turnId) {
          return;
        }

        const status = asString(turn.status);
        if (status === 'completed') {
          run.resolveCompletion('completed');
          return;
        }

        if (status === 'interrupted') {
          run.resolveCompletion('cancelled');
          return;
        }

        if (status === 'failed') {
          run.rejectCompletion(buildCodexTurnError(this.preset.name, turn.error));
        }
        return;
      }

      default:
        return;
    }
  }

  private handleServerRequest(
    session: ActiveSession,
    message: JsonRpcMessage,
  ): void {
    const id = message.id;
    const method = message.method;
    if (id === undefined || !method) {
      return;
    }

    switch (method) {
      case 'execCommandApproval':
      case 'applyPatchApproval':
        this.writeMessage(session, {
          jsonrpc: '2.0',
          id,
          result: {
            decision: 'denied',
          },
        });
        return;

      case 'item/commandExecution/requestApproval':
        this.writeMessage(session, {
          jsonrpc: '2.0',
          id,
          result: {
            decision: 'decline',
          },
        });
        return;

      case 'item/fileChange/requestApproval':
        this.writeMessage(session, {
          jsonrpc: '2.0',
          id,
          result: {
            decision: 'decline',
          },
        });
        return;

      case 'item/permissions/requestApproval':
        this.writeMessage(session, {
          jsonrpc: '2.0',
          id,
          result: {
            permissions: {},
            scope: 'turn',
          },
        });
        return;

      case 'item/tool/requestUserInput':
        this.writeMessage(session, {
          jsonrpc: '2.0',
          id,
          result: {
            answers: {},
          },
        });
        return;

      default:
        this.writeMessage(session, {
          jsonrpc: '2.0',
          id,
          error: {
            code: -32601,
            message: `Method not supported: ${method}`,
          },
        });
    }
  }

  private async withPromptTimeout(
    session: ActiveSession,
    request: Promise<CompletionOutcome>,
    timeoutMs: number,
  ): Promise<CompletionOutcome> {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    try {
      return await Promise.race([
        request,
        new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => {
            const turnId = session.run?.turnId;
            if (turnId) {
              this.writeMessage(session, {
                jsonrpc: '2.0',
                method: 'turn/interrupt',
                params: {
                  threadId: session.runtimeThreadId,
                  turnId,
                },
              });
            }

            reject(
              createProviderError(
                'PROVIDER_TIMEOUT',
                `${this.preset.name} run timed out after ${timeoutMs}ms`,
                true,
                1_000,
              ),
            );
          }, timeoutMs);
        }),
      ]);
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }

  private async sendRequest(
    session: ActiveSession,
    method: string,
    params: Record<string, unknown>,
    timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
  ): Promise<unknown> {
    return awaitResponse(() => {
      session.requestId += 1;
      const id = session.requestId;

      return new Promise<unknown>((resolve, reject) => {
        const timeout = setTimeout(() => {
          session.pendingRequests.delete(id);
          reject(new Error(`Timeout waiting for ${method} (id=${id})`));
        }, timeoutMs);

        session.pendingRequests.set(id, {
          resolve,
          reject,
          timeout,
        });

        this.writeMessage(session, {
          jsonrpc: '2.0',
          id,
          method,
          params,
        });
      });
    });
  }

  private resolvePendingRequest(
    session: ActiveSession,
    id: number | string,
  ): PendingRequest | null {
    const numericId = typeof id === 'string' ? Number.parseInt(id, 10) : id;
    if (!Number.isInteger(numericId)) {
      return null;
    }

    const pending = session.pendingRequests.get(numericId);
    if (!pending) {
      return null;
    }

    clearTimeout(pending.timeout);
    session.pendingRequests.delete(numericId);
    return pending;
  }

  private writeMessage(session: ActiveSession, message: JsonRpcMessage): void {
    if (!session.child.stdin.writable) {
      throw new Error(`${this.preset.name} stdin is not writable`);
    }

    session.child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  private failSession(session: ActiveSession, error: ProviderError): void {
    for (const pending of session.pendingRequests.values()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error(error.message));
    }
    session.pendingRequests.clear();

    this.sessions.delete(session.sessionId);
    this.startingSessions.delete(session.sessionId);

    if (session.run && !session.run.settled) {
      session.run.settled = true;
      const { callbacks } = session.run;
      session.run = null;
      callbacks.onError(error);
    }

    void this.disposeSession(session, false);
  }

  private async disposeSession(
    session: ActiveSession,
    terminateProcess: boolean,
  ): Promise<void> {
    if (!terminateProcess || session.child.exitCode != null) {
      return;
    }

    session.child.kill('SIGTERM');
    setTimeout(() => {
      if (session.child.exitCode == null) {
        session.child.kill('SIGKILL');
      }
    }, DEFAULT_CANCEL_GRACE_MS);
  }
}

function toToolPayload(
  item: Record<string, unknown>,
  completed: boolean,
): NormalizedAcpToolCall | null {
  const type = asString(item.type);
  const id = asString(item.id);
  if (!type || !id) {
    return null;
  }

  switch (type) {
    case 'commandExecution':
      return {
        toolCallId: id,
        title: asString(item.command) ?? 'command',
        kind: 'command_execution',
        status: completed
          ? normalizeCompletedToolStatus(asString(item.status))
          : 'running',
        input: {
          command: asString(item.command),
          cwd: asString(item.cwd),
          commandActions: Array.isArray(item.commandActions)
            ? item.commandActions
            : [],
        },
        inputFinalized: true,
        output: completed ? item.aggregatedOutput ?? null : null,
        locations: [],
        content: [],
      };

    case 'mcpToolCall':
      return {
        toolCallId: id,
        title:
          `${asString(item.server) ?? 'mcp'}:${asString(item.tool) ?? 'tool'}`,
        kind: 'mcp_tool_call',
        status: completed
          ? normalizeCompletedToolStatus(asString(item.status))
          : 'running',
        input: item.arguments ?? null,
        inputFinalized: true,
        output: completed ? item.result ?? item.error ?? null : null,
        locations: [],
        content: [],
      };

    case 'dynamicToolCall':
      return {
        toolCallId: id,
        title: asString(item.tool) ?? 'dynamic_tool',
        kind: 'dynamic_tool_call',
        status: completed
          ? normalizeCompletedToolStatus(asString(item.status))
          : 'running',
        input: item.arguments ?? null,
        inputFinalized: true,
        output: completed ? item.contentItems ?? null : null,
        locations: [],
        content: [],
      };

    case 'fileChange':
      return {
        toolCallId: id,
        title: 'file_change',
        kind: 'file_change',
        status: completed
          ? normalizeCompletedToolStatus(asString(item.status))
          : 'running',
        input: item.changes ?? null,
        inputFinalized: true,
        output: completed ? item.changes ?? null : null,
        locations: [],
        content: [],
      };

    default:
      return null;
  }
}

function createAcpUpdate(
  sessionId: string,
  provider: string,
  eventType: NormalizedAcpUpdate['eventType'],
  extras: Omit<
    Partial<NormalizedAcpUpdate>,
    'eventType' | 'provider' | 'sessionId' | 'timestamp'
  > = {},
): NormalizedAcpUpdate {
  return {
    sessionId,
    provider,
    eventType,
    timestamp: new Date().toISOString(),
    rawNotification: extras.rawNotification ?? null,
    ...extras,
  };
}

function normalizeCompletedToolStatus(
  status: string | null,
): 'completed' | 'failed' {
  if (
    status === 'completed' ||
    status === 'success' ||
    status === 'succeeded'
  ) {
    return 'completed';
  }

  return 'failed';
}

function normalizePlanStatus(
  status: string | null,
): 'completed' | 'in_progress' | 'pending' {
  if (status === 'completed') {
    return 'completed';
  }

  if (status === 'inProgress') {
    return 'in_progress';
  }

  return 'pending';
}

function buildCodexTurnError(providerName: string, errorInput: unknown): Error {
  const error = asRecord(errorInput);
  const message =
    asString(error.message) ??
    `${providerName} reported a failed turn without an error message`;
  const details = asString(error.additionalDetails);
  return new Error(details ? `${message}: ${details}` : message);
}

function createProviderError(
  code: string,
  message: string,
  retryable: boolean,
  retryAfterMs: number,
): ProviderError {
  return {
    code,
    message,
    retryable,
    retryAfterMs,
  };
}

function normalizeProviderError(
  error: unknown,
  providerName: string,
  timeoutMs: number,
): ProviderError {
  if (isProviderError(error)) {
    return error;
  }

  const message =
    error instanceof Error ? error.message : `${providerName} run failed`;

  if (message.includes('timed out')) {
    return createProviderError(
      'PROVIDER_TIMEOUT',
      `${providerName} run timed out after ${timeoutMs}ms`,
      true,
      1_000,
    );
  }

  if (message.toLowerCase().includes('cancelled')) {
    return createProviderError(
      'PROVIDER_CANCELLED',
      message,
      false,
      0,
    );
  }

  if (message.startsWith('Codex Error [')) {
    return createProviderError(
      'PROVIDER_PROTOCOL_ERROR',
      message,
      true,
      1_000,
    );
  }

  return createProviderError(
    'PROVIDER_RUNTIME_ERROR',
    message,
    true,
    1_000,
  );
}

function isProviderError(error: unknown): error is ProviderError {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const candidate = error as Record<string, unknown>;
  return (
    typeof candidate.code === 'string' &&
    typeof candidate.message === 'string' &&
    typeof candidate.retryable === 'boolean' &&
    typeof candidate.retryAfterMs === 'number'
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function appendBoundedText(
  existing: string,
  chunk: string,
  limit = 64 * 1024,
): string {
  const combined = `${existing}${chunk}`;
  if (combined.length <= limit) {
    return combined;
  }
  return combined.slice(combined.length - limit);
}

function awaitResponse<T>(work: () => Promise<T>): Promise<T> {
  return Promise.resolve().then(work);
}
