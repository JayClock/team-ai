import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute } from 'node:path';
import type {
  NormalizedAcpToolCall,
  NormalizedAcpUpdate,
  ProviderAdapter,
  ProviderBehavior,
  ProviderError,
  ProviderPromptCallbacks,
  ProviderPromptRequest,
} from './provider-types.js';
import {
  createNormalizedAcpUpdate,
  flattenAcpContentText,
  hasStructuredValue,
} from './provider-types.js';
import type { ResolvedAcpCliProviderPreset } from './provider-presets.js';

const DEFAULT_CANCEL_GRACE_MS = 3_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;
const DEFAULT_PACKAGE_MANAGER_INIT_TIMEOUT_MS = 120_000;
const DEFAULT_TERMINAL_OUTPUT_LIMIT = 64 * 1024;

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

type LocalTerminal = {
  command: ReturnType<typeof spawn>;
  exitStatus: {
    exitCode?: number | null;
    signal?: string | null;
  } | null;
  output: string;
  outputByteLimit: number;
  released: boolean;
  waitForExit: Promise<{ exitCode: number | null; signal: string | null }>;
};

type ActiveRun = {
  callbacks: ProviderPromptCallbacks;
  settled: boolean;
  traceId?: string;
};

type ActiveSession = {
  buffer: string;
  child: ChildProcessWithoutNullStreams;
  cwd?: string;
  pendingRequests: Map<number, PendingRequest>;
  requestId: number;
  run: ActiveRun | null;
  runtimeSessionId: string;
  sessionId: string;
  stderr: string;
  terminals: Map<string, LocalTerminal>;
};

type McpServer = {
  headers?: Array<{ name: string; value: string }>;
  name: string;
  type: 'http';
  url: string;
};

export class AcpCliProviderAdapter implements ProviderAdapter {
  readonly name: string;

  private readonly baseArgs: string[];
  private readonly command: string;
  private readonly cwdArg?: string;
  private readonly sessions = new Map<string, ActiveSession>();
  private readonly startingSessions = new Map<string, Promise<ActiveSession>>();

  constructor(
    protected readonly preset: ResolvedAcpCliProviderPreset,
    launchCommand: {
      args: string[];
      command: string;
    },
  ) {
    this.name = preset.providerId;
    this.command = launchCommand.command;
    this.baseArgs = [...launchCommand.args];
    this.cwdArg = preset.cwdArg;
  }

  prompt(
    request: ProviderPromptRequest,
    callbacks: ProviderPromptCallbacks,
  ): void {
    void this.runPrompt(request, callbacks);
  }

  cancel(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session?.run) {
      return false;
    }

    this.writeMessage(session, {
      jsonrpc: '2.0',
      method: 'session/cancel',
      params: {
        sessionId: session.runtimeSessionId,
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

  getBehavior(): ProviderBehavior {
    return getStandardAcpCliBehavior();
  }

  normalizeNotification(
    sessionId: string,
    traceId: string | undefined,
    notification: unknown,
  ): NormalizedAcpUpdate | null {
    return normalizeSessionUpdate(
      sessionId,
      this.preset.providerId,
      notification,
      traceId,
      this.getBehavior(),
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

      session.run = {
        callbacks,
        settled: false,
        traceId: request.traceId,
      };

      await this.withPromptTimeout(
        session,
        this.sendRequest(
          session,
          'session/prompt',
          {
            sessionId: session.runtimeSessionId,
            prompt: [
              {
                type: 'text',
                text: request.input,
              },
            ],
            _meta: request.traceId
              ? {
                  traceId: request.traceId,
                }
              : undefined,
          },
          Math.max(request.timeoutMs + 1_000, 30_000),
        ),
        request.timeoutMs,
      );

      if (!session.run || session.run.settled) {
        return;
      }

      session.run.settled = true;
      session.run = null;
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
    const child = spawn(
      this.command,
      buildLaunchArgs(
        this.preset.providerId,
        this.baseArgs,
        this.cwdArg,
        request.cwd,
      ),
      {
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: false,
        ...(request.cwd ? { cwd: request.cwd } : {}),
        ...(request.env
          ? { env: { ...process.env, ...request.env } }
          : { env: process.env }),
      },
    );

    const session: ActiveSession = {
      sessionId: request.sessionId,
      child,
      buffer: '',
      cwd: request.cwd,
      pendingRequests: new Map(),
      requestId: 0,
      run: null,
      runtimeSessionId: '',
      stderr: '',
      terminals: new Map(),
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
      protocolVersion: 1,
      clientInfo: {
        name: 'team-ai-agent-gateway',
        version: 'desktop',
      },
      clientCapabilities: {
        fs: {
          readTextFile: true,
          writeTextFile: true,
        },
        terminal: true,
      },
    });

    const created = (await this.sendRequest(session, 'session/new', {
      cwd: request.cwd,
      mcpServers: resolveMcpServers(request.metadata),
      ...(request.model ? { model: request.model } : {}),
    })) as { sessionId?: unknown };

    const runtimeSessionId =
      typeof created.sessionId === 'string' ? created.sessionId.trim() : '';
    if (!runtimeSessionId) {
      await this.disposeSession(session, true);
      throw new Error(
        `${this.preset.name} did not return a runtime session id`,
      );
    }

    session.runtimeSessionId = runtimeSessionId;
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
      if (!session.run?.settled) {
        session.run?.callbacks.onEvent({
          protocol: 'acp',
          update: createNormalizedAcpUpdate(
            session.sessionId,
            this.preset.providerId,
            'agent_message',
            {
              traceId: session.run?.traceId,
              rawNotification: line,
              message: {
                role: 'assistant',
                content: line,
                isChunk: true,
              },
            },
          ),
          traceId: session.run?.traceId,
        });
      }
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
            `ACP Error [${message.error.code}]: ${message.error.message}`,
          ),
        );
        return;
      }

      pending.resolve(message.result);
      return;
    }

    if (message.id !== undefined && message.method) {
      this.handleAgentRequest(session, message);
      return;
    }

    if (message.method === 'session/update') {
      this.handleSessionUpdate(session, message.params);
    }
  }

  private handleSessionUpdate(
    session: ActiveSession,
    params: Record<string, unknown> | undefined,
  ): void {
    if (!session.run || session.run.settled) {
      return;
    }

    const payload = this.normalizeNotification(
      session.sessionId,
      session.run.traceId,
      asRecord(params).update ?? params ?? {},
    );
    if (!payload) {
      return;
    }
    session.run.callbacks.onEvent({
      protocol: 'acp',
      update: payload,
      traceId: session.run.traceId,
    });
  }

  private async handleAgentRequest(
    session: ActiveSession,
    message: JsonRpcMessage,
  ): Promise<void> {
    const id = message.id;
    const method = message.method;
    const params = asRecord(message.params);

    if (id === undefined || !method) {
      return;
    }

    try {
      switch (method) {
        case 'session/request_permission': {
          const options = Array.isArray(params.options) ? params.options : [];
          const preferred =
            options.find((option) => asRecord(option).kind === 'allow_once') ??
            options.find(
              (option) => asRecord(option).kind === 'allow_always',
            ) ??
            options[0];

          this.writeMessage(session, {
            jsonrpc: '2.0',
            id,
            result: preferred
              ? {
                  outcome: {
                    outcome: 'selected',
                    optionId: asRecord(preferred).optionId,
                  },
                }
              : {
                  outcome: {
                    outcome: 'cancelled',
                  },
                },
          });
          return;
        }

        case 'fs/read_text_file': {
          const filePath = asString(params.path);
          if (!filePath || !isAbsolute(filePath)) {
            throw new Error('fs/read_text_file requires an absolute path');
          }

          const content = await readFile(filePath, 'utf-8');
          this.writeMessage(session, {
            jsonrpc: '2.0',
            id,
            result: {
              content: sliceFileContent(
                content,
                asNumber(params.line) ?? 1,
                asNumber(params.limit),
              ),
            },
          });
          return;
        }

        case 'fs/write_text_file': {
          const filePath = asString(params.path);
          const content = asString(params.content);
          if (!filePath || !isAbsolute(filePath)) {
            throw new Error('fs/write_text_file requires an absolute path');
          }
          if (content == null) {
            throw new Error('fs/write_text_file requires string content');
          }

          await mkdir(dirname(filePath), { recursive: true });
          await writeFile(filePath, content, 'utf-8');
          this.writeMessage(session, {
            jsonrpc: '2.0',
            id,
            result: {},
          });
          return;
        }

        case 'terminal/create': {
          const terminalId = `term_${randomUUID()}`;
          const terminal = createLocalTerminal(params, session.cwd);
          session.terminals.set(terminalId, terminal);
          this.writeMessage(session, {
            jsonrpc: '2.0',
            id,
            result: {
              terminalId,
            },
          });
          return;
        }

        case 'terminal/output': {
          const terminal = getTerminal(session, asString(params.terminalId));
          this.writeMessage(session, {
            jsonrpc: '2.0',
            id,
            result: {
              output: terminal.output,
              truncated:
                Buffer.byteLength(terminal.output, 'utf-8') >=
                terminal.outputByteLimit,
              exitStatus: terminal.exitStatus,
            },
          });
          return;
        }

        case 'terminal/wait_for_exit': {
          const terminal = getTerminal(session, asString(params.terminalId));
          this.writeMessage(session, {
            jsonrpc: '2.0',
            id,
            result: await terminal.waitForExit,
          });
          return;
        }

        case 'terminal/kill': {
          const terminal = getTerminal(session, asString(params.terminalId));
          if (terminal.command.exitCode == null) {
            terminal.command.kill('SIGTERM');
          }
          this.writeMessage(session, {
            jsonrpc: '2.0',
            id,
            result: {},
          });
          return;
        }

        case 'terminal/release': {
          const terminalId = asString(params.terminalId);
          const terminal = getTerminal(session, terminalId);
          if (terminalId) {
            session.terminals.delete(terminalId);
          }
          await releaseTerminal(terminal);
          this.writeMessage(session, {
            jsonrpc: '2.0',
            id,
            result: {},
          });
          return;
        }

        default: {
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
    } catch (error) {
      this.writeMessage(session, {
        jsonrpc: '2.0',
        id,
        error: {
          code: -32000,
          message:
            error instanceof Error
              ? error.message
              : 'Provider request handling failed',
        },
      });
    }
  }

  private async withPromptTimeout(
    session: ActiveSession,
    request: Promise<unknown>,
    timeoutMs: number,
  ): Promise<unknown> {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    try {
      return await Promise.race([
        request,
        new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => {
            this.writeMessage(session, {
              jsonrpc: '2.0',
              method: 'session/cancel',
              params: {
                sessionId: session.runtimeSessionId,
              },
            });

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

  private sendRequest(
    session: ActiveSession,
    method: string,
    params: Record<string, unknown>,
    timeoutMs = resolveAcpCliRequestTimeoutMs(method, this.command),
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
    await Promise.all(
      [...session.terminals.values()].map((terminal) =>
        releaseTerminal(terminal),
      ),
    );
    session.terminals.clear();

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

export function resolveAcpCliRequestTimeoutMs(
  method: string,
  runtimeCommand: string,
): number {
  if (method === 'initialize' || method === 'session/new') {
    return runtimeCommand === 'npx' || runtimeCommand === 'uvx'
      ? DEFAULT_PACKAGE_MANAGER_INIT_TIMEOUT_MS
      : DEFAULT_REQUEST_TIMEOUT_MS;
  }

  return DEFAULT_REQUEST_TIMEOUT_MS;
}

export class OpencodeAcpCliProviderAdapter extends AcpCliProviderAdapter {
  override getBehavior(): ProviderBehavior {
    return getOpencodeAcpCliBehavior();
  }
}

function buildLaunchArgs(
  providerId: string,
  args: string[],
  cwdArg: string | undefined,
  cwd: string | undefined,
): string[] {
  if (providerId === 'docker-opencode') {
    return buildDockerOpencodeLaunchArgs(args, cwdArg, cwd);
  }

  const launchArgs = [...args];

  if (cwdArg && cwd && !launchArgs.includes(cwdArg)) {
    launchArgs.push(cwdArg, cwd);
  }

  return launchArgs;
}

function buildDockerOpencodeLaunchArgs(
  args: string[],
  cwdArg: string | undefined,
  cwd: string | undefined,
): string[] {
  const launchArgs = [...args];
  const workspacePath = cwd?.trim();

  if (workspacePath) {
    launchArgs.push(
      '-v',
      `${workspacePath}:${workspacePath}`,
      '-w',
      workspacePath,
    );
  }

  launchArgs.push('ghcr.io/sst/opencode:latest', 'opencode', 'acp');

  if (cwdArg && workspacePath) {
    launchArgs.push(cwdArg, workspacePath);
  }

  return launchArgs;
}

function normalizeSessionUpdate(
  sessionId: string,
  provider: string,
  updateInput: unknown,
  traceId?: string,
  behavior: ProviderBehavior = getStandardAcpCliBehavior(),
): NormalizedAcpUpdate {
  const update = asRecord(updateInput);
  const sessionUpdate = asString(update.sessionUpdate) ?? asString(update.type);

  if (!sessionUpdate) {
    return createNormalizedAcpUpdate(sessionId, provider, 'agent_message', {
      traceId,
      rawNotification: updateInput,
      message: {
        role: 'assistant',
        content: asString(updateInput) ?? '',
        isChunk: true,
      },
    });
  }

  switch (sessionUpdate) {
    case 'user_message':
    case 'user_message_chunk':
    case 'agent_message':
    case 'agent_message_chunk':
    case 'agent_thought':
    case 'agent_thought_chunk':
      return createNormalizedAcpUpdate(
        sessionId,
        provider,
        resolveMessageEventType(sessionUpdate),
        {
          traceId,
          rawNotification: updateInput,
          message: {
            role: resolveMessageRole(sessionUpdate),
            content: flattenAcpContentText(update.content ?? update.text ?? ''),
            contentBlock: normalizeContentBlock(update.content ?? update.text),
            isChunk: sessionUpdate.endsWith('_chunk'),
            messageId: asString(update.messageId),
          },
        },
      );

    case 'tool_call':
      return createNormalizedAcpUpdate(sessionId, provider, 'tool_call', {
        traceId,
        rawNotification: updateInput,
        toolCall: createToolCall(update, false, behavior),
      });

    case 'tool_call_update':
      return createNormalizedAcpUpdate(
        sessionId,
        provider,
        'tool_call_update',
        {
          traceId,
          rawNotification: updateInput,
          toolCall: createToolCall(update, true, behavior),
        },
      );

    case 'plan': {
      const entries = Array.isArray(update.entries) ? update.entries : [];
      return createNormalizedAcpUpdate(sessionId, provider, 'plan_update', {
        traceId,
        rawNotification: updateInput,
        planItems: entries.map((entry) => ({
          description:
            asString(asRecord(entry).content) ??
            asString(asRecord(entry).description) ??
            '',
          ...(normalizePlanPriority(asString(asRecord(entry).priority))
            ? {
                priority: normalizePlanPriority(
                  asString(asRecord(entry).priority),
                ),
              }
            : {}),
          status: normalizePlanStatus(asString(asRecord(entry).status)),
        })),
      });
    }

    case 'turn_complete':
      return createNormalizedAcpUpdate(sessionId, provider, 'turn_complete', {
        traceId,
        rawNotification: updateInput,
        turnComplete: {
          state: normalizeTurnCompleteState(asString(update.state)),
          stopReason: asString(update.stopReason) ?? 'end_turn',
          usage: update.usage ?? null,
          userMessageId: asString(update.userMessageId) ?? null,
        },
      });

    case 'session_info_update':
      return createNormalizedAcpUpdate(
        sessionId,
        provider,
        'session_info_update',
        {
          traceId,
          rawNotification: updateInput,
          sessionInfo: {
            title: asString(update.title) ?? null,
            updatedAt: asString(update.updatedAt) ?? null,
          },
        },
      );

    case 'current_mode_update':
      return createNormalizedAcpUpdate(
        sessionId,
        provider,
        'current_mode_update',
        {
          traceId,
          rawNotification: updateInput,
          mode: {
            ...(asString(update.currentModeId)
              ? { currentModeId: asString(update.currentModeId) ?? undefined }
              : {}),
          },
        },
      );

    case 'config_option_update':
      return createNormalizedAcpUpdate(
        sessionId,
        provider,
        'config_option_update',
        {
          traceId,
          rawNotification: updateInput,
          configOptions: update.configOptions ?? {},
        },
      );

    case 'usage_update':
      return createNormalizedAcpUpdate(sessionId, provider, 'usage_update', {
        traceId,
        rawNotification: updateInput,
        usage: {
          size: asNumber(update.size) ?? 0,
          used: asNumber(update.used) ?? 0,
          cost: update.cost ?? null,
        },
      });

    case 'available_commands_update':
      return createNormalizedAcpUpdate(
        sessionId,
        provider,
        'available_commands_update',
        {
          traceId,
          rawNotification: updateInput,
          availableCommands: Array.isArray(update.availableCommands)
            ? update.availableCommands
            : [],
        },
      );

    case 'error':
      return createNormalizedAcpUpdate(sessionId, provider, 'error', {
        traceId,
        rawNotification: updateInput,
        error: {
          code: asString(update.code) ?? 'PROTOCOL_ERROR',
          message: asString(update.message) ?? 'Unknown protocol error',
        },
      });

    default:
      return createNormalizedAcpUpdate(sessionId, provider, 'agent_message', {
        traceId,
        rawNotification: updateInput,
        message: {
          role: 'assistant',
          content: flattenAcpContentText(update.content ?? update.text ?? ''),
          contentBlock: update.content,
          isChunk: true,
          messageId: asString(update.messageId),
        },
      });
  }
}

function normalizeContentBlock(contentInput: unknown): unknown {
  if (contentInput && typeof contentInput === 'object') {
    return contentInput;
  }

  return {
    type: 'text',
    text: typeof contentInput === 'string' ? contentInput : '',
  };
}

function createToolCall(
  update: Record<string, unknown>,
  allowCompletion: boolean,
  behavior: ProviderBehavior,
): NormalizedAcpToolCall {
  if (behavior.toolInputMode === 'deferred') {
    return createDeferredInputToolCall(update, allowCompletion);
  }

  return createStandardToolCall(update, allowCompletion);
}

function createDeferredInputToolCall(
  update: Record<string, unknown>,
  allowCompletion: boolean,
): NormalizedAcpToolCall {
  return createNormalizedToolCallRecord(update, allowCompletion);
}

function createStandardToolCall(
  update: Record<string, unknown>,
  allowCompletion: boolean,
): NormalizedAcpToolCall {
  return createNormalizedToolCallRecord(update, allowCompletion);
}

function createNormalizedToolCallRecord(
  update: Record<string, unknown>,
  allowCompletion: boolean,
): NormalizedAcpToolCall {
  const input = update.rawInput ?? null;
  const output = update.rawOutput ?? null;
  const completed =
    allowCompletion &&
    (asString(update.status) === 'completed' ||
      asString(update.status) === 'failed' ||
      output !== null);

  return {
    ...(asString(update.toolCallId)
      ? { toolCallId: asString(update.toolCallId) ?? undefined }
      : {}),
    ...(asString(update.title) ? { title: asString(update.title) } : {}),
    ...(asString(update.kind) ? { kind: asString(update.kind) } : {}),
    status: normalizeToolCallStatus(asString(update.status), completed),
    input,
    inputFinalized: hasStructuredValue(input) || completed,
    output,
    locations: Array.isArray(update.locations) ? update.locations : [],
    content: Array.isArray(update.content) ? update.content : [],
  };
}

function getStandardAcpCliBehavior(): ProviderBehavior {
  return {
    immediateToolInput: false,
    protocol: 'acp',
    streaming: true,
    toolInputMode: 'standard',
  };
}

function getOpencodeAcpCliBehavior(): ProviderBehavior {
  return {
    immediateToolInput: false,
    protocol: 'acp',
    streaming: true,
    toolInputMode: 'deferred',
  };
}

function resolveMessageEventType(
  updateType: string,
): 'agent_message' | 'agent_thought' | 'user_message' {
  if (updateType === 'user_message_chunk' || updateType === 'user_message') {
    return 'user_message';
  }

  if (updateType === 'agent_thought_chunk' || updateType === 'agent_thought') {
    return 'agent_thought';
  }

  return 'agent_message';
}

function resolveMessageRole(
  updateType: string,
): 'assistant' | 'thought' | 'user' {
  if (updateType === 'user_message_chunk' || updateType === 'user_message') {
    return 'user';
  }

  if (updateType === 'agent_thought_chunk' || updateType === 'agent_thought') {
    return 'thought';
  }

  return 'assistant';
}

function normalizeToolCallStatus(
  status: string | null,
  completed: boolean,
): 'completed' | 'failed' | 'pending' | 'running' {
  if (status === 'completed' || status === 'failed') {
    return status;
  }

  if (completed) {
    return 'completed';
  }

  if (status === 'in_progress' || status === 'running') {
    return 'running';
  }

  return 'pending';
}

function normalizePlanStatus(
  status: string | null,
): 'completed' | 'in_progress' | 'pending' {
  if (status === 'completed') {
    return 'completed';
  }

  if (status === 'in_progress' || status === 'inProgress') {
    return 'in_progress';
  }

  return 'pending';
}

function normalizePlanPriority(
  priority: string | null,
): 'high' | 'low' | 'medium' | undefined {
  if (priority === 'high' || priority === 'medium' || priority === 'low') {
    return priority;
  }

  return undefined;
}

function normalizeTurnCompleteState(
  state: string | null,
): 'FAILED' | 'CANCELLED' | undefined {
  if (state === 'FAILED' || state === 'CANCELLED') {
    return state;
  }

  return undefined;
}

function resolveMcpServers(
  metadata: Record<string, unknown> | undefined,
): McpServer[] {
  const mcpServers = Array.isArray(metadata?.mcpServers)
    ? metadata.mcpServers
    : [];

  return mcpServers.flatMap((server) => {
    const entry = asRecord(server);
    const name = asString(entry.name)?.trim();
    const url = asString(entry.url)?.trim();
    if (!name || !url) {
      return [];
    }

    const headers = Array.isArray(entry.headers)
      ? entry.headers
          .map((header) => {
            const normalized = asRecord(header);
            const headerName = asString(normalized.name)?.trim();
            const value = asString(normalized.value);
            if (!headerName || value == null) {
              return null;
            }
            return {
              name: headerName,
              value,
            };
          })
          .filter(
            (header): header is { name: string; value: string } =>
              header !== null,
          )
      : [];

    const bearerTokenEnvVar = asString(entry.bearerTokenEnvVar)?.trim();
    if (bearerTokenEnvVar) {
      const token = process.env[bearerTokenEnvVar]?.trim();
      if (token) {
        headers.push({
          name: 'Authorization',
          value: `Bearer ${token}`,
        });
      }
    }

    return [
      {
        type: 'http' as const,
        name,
        url,
        ...(headers.length > 0 ? { headers } : {}),
      },
    ];
  });
}

function createLocalTerminal(
  params: Record<string, unknown>,
  fallbackCwd: string | undefined,
): LocalTerminal {
  const command = asString(params.command)?.trim();
  if (!command) {
    throw new Error('terminal/create requires a command');
  }

  const cwd = asString(params.cwd)?.trim() || fallbackCwd;
  if (!cwd || !isAbsolute(cwd)) {
    throw new Error('terminal/create requires an absolute cwd');
  }

  const args = Array.isArray(params.args)
    ? params.args.flatMap((arg) => (typeof arg === 'string' ? [arg] : []))
    : [];
  const env = Array.isArray(params.env)
    ? params.env.reduce<NodeJS.ProcessEnv>(
        (acc, variable) => {
          const entry = asRecord(variable);
          const name = asString(entry.name);
          const value = asString(entry.value);
          if (name && value != null) {
            acc[name] = value;
          }
          return acc;
        },
        { ...process.env },
      )
    : process.env;

  const child = spawn(command, args, {
    cwd,
    env,
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const outputByteLimit =
    asNumber(params.outputByteLimit) ?? DEFAULT_TERMINAL_OUTPUT_LIMIT;
  const terminal: LocalTerminal = {
    command: child,
    exitStatus: null,
    output: '',
    outputByteLimit,
    released: false,
    waitForExit: new Promise((resolve) => {
      child.once('close', (exitCode, signal) => {
        terminal.exitStatus = {
          exitCode,
          signal,
        };
        resolve({
          exitCode,
          signal,
        });
      });
    }),
  };

  const appendOutput = (chunk: Buffer) => {
    terminal.output = appendBoundedText(
      terminal.output,
      chunk.toString('utf-8'),
      outputByteLimit,
    );
  };

  child.stdout.on('data', appendOutput);
  child.stderr.on('data', appendOutput);

  return terminal;
}

function getTerminal(
  session: ActiveSession,
  terminalId: string | null,
): LocalTerminal {
  if (!terminalId) {
    throw new Error('terminal id is required');
  }

  const terminal = session.terminals.get(terminalId);
  if (!terminal) {
    throw new Error(`Terminal not found: ${terminalId}`);
  }

  return terminal;
}

async function releaseTerminal(terminal: LocalTerminal): Promise<void> {
  if (terminal.released) {
    return;
  }

  terminal.released = true;
  if (terminal.command.exitCode == null) {
    terminal.command.kill('SIGTERM');
    await terminal.waitForExit.catch(() => undefined);
  }
}

function sliceFileContent(
  content: string,
  startLine: number,
  limit: number | null,
): string {
  const lines = content.split('\n');
  const offset = Math.max(startLine - 1, 0);
  const sliced = lines.slice(offset, limit ? offset + limit : undefined);
  return sliced.join('\n');
}

function appendBoundedText(
  current: string,
  chunk: string,
  maxBytes = DEFAULT_TERMINAL_OUTPUT_LIMIT,
): string {
  let value = `${current}${chunk}`;
  while (Buffer.byteLength(value, 'utf-8') > maxBytes && value.length > 0) {
    value = value.slice(1);
  }
  return value;
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

  const message = error instanceof Error ? error.message : String(error);
  if (message.startsWith('ACP Error [')) {
    return createProviderError(
      'PROVIDER_PROMPT_FAILED',
      `${providerName} rejected ACP prompt: ${message}`,
      true,
      1_000,
    );
  }

  if (message.includes('timed out')) {
    return createProviderError(
      'PROVIDER_TIMEOUT',
      `${providerName} run timed out after ${timeoutMs}ms`,
      true,
      1_000,
    );
  }

  return createProviderError(
    'PROVIDER_PROCESS_EXITED',
    `${providerName} failed: ${message}`,
    true,
    1_000,
  );
}

function isProviderError(error: unknown): error is ProviderError {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const record = error as Record<string, unknown>;
  return (
    typeof record.code === 'string' &&
    typeof record.message === 'string' &&
    typeof record.retryable === 'boolean' &&
    typeof record.retryAfterMs === 'number'
  );
}

function asRecord(input: unknown): Record<string, unknown> {
  if (input && typeof input === 'object' && !Array.isArray(input)) {
    return input as Record<string, unknown>;
  }

  return {};
}

function asString(input: unknown): string | null {
  return typeof input === 'string' ? input : null;
}

function asNumber(input: unknown): number | null {
  return typeof input === 'number' && Number.isFinite(input) ? input : null;
}

async function awaitResponse<T>(factory: () => Promise<T>): Promise<T> {
  return await factory();
}
