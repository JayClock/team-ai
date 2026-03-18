import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute } from 'node:path';
import { Readable, Writable } from 'node:stream';
import { customAlphabet } from 'nanoid';
import {
  ClientSideConnection,
  ndJsonStream,
  type CancelNotification,
  type CreateTerminalRequest,
  type InitializeResponse,
  type McpServer,
  type PromptResponse,
  type RequestPermissionRequest,
  type RequestPermissionResponse,
  type SessionNotification,
  type TerminalOutputResponse,
  type WaitForTerminalExitResponse,
} from '@agentclientprotocol/sdk';
import { ProblemError } from '../errors/problem-error.js';
import {
  normalizeSessionNotification,
  type NormalizedSessionUpdate,
} from '../services/normalized-session-update.js';
import {
  AcpSessionProcessManager,
  type ManagedAcpSessionSnapshot,
} from './acp-session-process-manager.js';
import {
  getProviderEnvCommandKey,
  normalizeAcpProviderId,
  resolveAcpRuntimeProviderCommand,
  resolveEnvProviderCommand,
} from '../providers/acp-provider-service.js';
import { resolveProviderRuntimeLaunchConfig } from '../providers/acp-provider-definitions.js';

export type { ManagedAcpSessionSnapshot } from './acp-session-process-manager.js';

const terminalIdGenerator = customAlphabet(
  '0123456789abcdefghijklmnopqrstuvwxyz',
  12,
);

export interface AcpRuntimeSessionHooks {
  onClosed(error?: Error): Promise<void> | void;
  onSessionUpdate(update: NormalizedSessionUpdate): Promise<void> | void;
}

export type AcpRuntimeSessionUpdate = NormalizedSessionUpdate;

export interface CreateAcpRuntimeSessionInput {
  cwd: string;
  hooks: AcpRuntimeSessionHooks;
  localSessionId: string;
  mcpServers: McpServer[];
  model?: string | null;
  orchestration?: {
    delegationGroupId?: string | null;
    parentTaskId?: string | null;
    taskId?: string | null;
    waveId?: string | null;
  } | null;
  provider: string;
}

export interface LoadAcpRuntimeSessionInput extends CreateAcpRuntimeSessionInput {
  runtimeSessionId: string;
}

export interface PromptAcpRuntimeSessionInput {
  eventId?: string;
  localSessionId: string;
  prompt: string;
  provider: string;
  timeoutMs?: number;
  traceId?: string;
}

export interface CancelAcpRuntimeSessionInput {
  localSessionId: string;
  reason?: string;
}

export interface AcpRuntimeSessionSnapshot {
  provider: string;
  runtimeSessionId: string;
}

export interface AcpPromptRuntimeResult {
  response: PromptResponse;
  runtimeSessionId: string;
}

export interface ProviderLaunchCommand {
  args: string[];
  command: string;
}

export interface AcpRuntimeClient {
  cancelSession(input: CancelAcpRuntimeSessionInput): Promise<void>;
  close(): Promise<void>;
  createSession(
    input: CreateAcpRuntimeSessionInput,
  ): Promise<AcpRuntimeSessionSnapshot>;
  isConfigured(provider: string): boolean;
  isSessionActive(localSessionId: string): boolean;
  killSession(localSessionId: string): Promise<void>;
  listSessions?(): ManagedAcpSessionSnapshot[];
  loadSession(
    input: LoadAcpRuntimeSessionInput,
  ): Promise<AcpRuntimeSessionSnapshot>;
  promptSession(
    input: PromptAcpRuntimeSessionInput,
  ): Promise<AcpPromptRuntimeResult>;
}

interface LoggerLike {
  debug?(payload: unknown, message?: string): void;
  error?(payload: unknown, message?: string): void;
  info?(payload: unknown, message?: string): void;
  warn?(payload: unknown, message?: string): void;
}

interface CreateAcpRuntimeClientOptions {
  logger?: LoggerLike;
}

const ACP_PROMPT_CANCEL_GRACE_MS = 1_000;
const ACP_REQUEST_TIMEOUT_MS = 30_000;
const ACP_INITIALIZE_TIMEOUT_MS = 10_000;
const ACP_PACKAGE_MANAGER_INITIALIZE_TIMEOUT_MS = 120_000;

interface LocalTerminal {
  command: ReturnType<typeof spawn>;
  exitStatus: {
    exitCode?: number | null;
    signal?: string | null;
  } | null;
  output: string;
  outputByteLimit: number;
  released: boolean;
  sessionId: string;
  waitForExit: Promise<WaitForTerminalExitResponse>;
}

interface ActiveAcpRuntimeSession {
  child: ReturnType<typeof spawn>;
  connection: ClientSideConnection;
  cwd: string;
  hooks: AcpRuntimeSessionHooks;
  initializeResponse: InitializeResponse;
  localSessionId: string;
  provider: string;
  runtimeCommand: string;
  runtimeSessionId: string;
  terminals: Map<string, LocalTerminal>;
}

export function resolveAcpRequestTimeoutMs(
  method: 'initialize' | 'session/load' | 'session/new' | 'session/prompt',
  runtimeCommand: string,
): number {
  if (
    method === 'initialize' ||
    method === 'session/load' ||
    method === 'session/new'
  ) {
    return isPackageManagerRuntime(runtimeCommand)
      ? ACP_PACKAGE_MANAGER_INITIALIZE_TIMEOUT_MS
      : ACP_INITIALIZE_TIMEOUT_MS;
  }

  return ACP_REQUEST_TIMEOUT_MS;
}

export function resolveAcpPromptTransportTimeoutMs(timeoutMs: number): number {
  return Math.max(
    timeoutMs + ACP_PROMPT_CANCEL_GRACE_MS,
    ACP_REQUEST_TIMEOUT_MS,
  );
}

export function createAcpRuntimeClient(
  options: CreateAcpRuntimeClientOptions = {},
): AcpRuntimeClient {
  const sessionManager =
    new AcpSessionProcessManager<ActiveAcpRuntimeSession>();

  async function createSession(
    input: CreateAcpRuntimeSessionInput,
  ): Promise<AcpRuntimeSessionSnapshot> {
    const session = await openSessionRuntime(input);
    const created = await withRequestTimeout(
      session.connection.newSession({
        cwd: input.cwd,
        mcpServers: input.mcpServers,
        ...(input.model ? { model: input.model } : {}),
      }),
      resolveAcpRequestTimeoutMs('session/new', session.runtimeCommand),
      'session/new',
    );

    session.runtimeSessionId = created.sessionId;
    await sessionManager.register({
      cleanup: async () => {
        await cleanupSession(session, true);
      },
      cwd: session.cwd,
      localSessionId: session.localSessionId,
      provider: session.provider,
      resource: session,
      runtimeSessionId: session.runtimeSessionId,
    });

    return {
      runtimeSessionId: created.sessionId,
      provider: input.provider,
    };
  }

  async function loadSession(
    input: LoadAcpRuntimeSessionInput,
  ): Promise<AcpRuntimeSessionSnapshot> {
    const existing = sessionManager.get(input.localSessionId)?.resource;
    if (existing) {
      return {
        runtimeSessionId: existing.runtimeSessionId,
        provider: existing.provider,
      };
    }

    const session = await openSessionRuntime(input);
    await withRequestTimeout(
      session.connection.loadSession({
        cwd: input.cwd,
        mcpServers: input.mcpServers,
        sessionId: input.runtimeSessionId,
      }),
      resolveAcpRequestTimeoutMs('session/load', session.runtimeCommand),
      'session/load',
    );

    session.runtimeSessionId = input.runtimeSessionId;
    await sessionManager.register({
      cleanup: async () => {
        await cleanupSession(session, true);
      },
      cwd: session.cwd,
      localSessionId: session.localSessionId,
      provider: session.provider,
      resource: session,
      runtimeSessionId: session.runtimeSessionId,
    });

    return {
      runtimeSessionId: input.runtimeSessionId,
      provider: input.provider,
    };
  }

  async function promptSession(
    input: PromptAcpRuntimeSessionInput,
  ): Promise<AcpPromptRuntimeResult> {
    return sessionManager.withActivity(
      input.localSessionId,
      async ({ resource: session }) => {
        const promptRequest = withRequestTimeout(
          session.connection.prompt({
            sessionId: session.runtimeSessionId,
            prompt: [
              {
                type: 'text',
                text: input.prompt,
              },
            ],
            _meta: input.traceId ? { traceId: input.traceId } : undefined,
          }),
          input.timeoutMs
            ? resolveAcpPromptTransportTimeoutMs(input.timeoutMs)
            : resolveAcpRequestTimeoutMs('session/prompt', session.runtimeCommand),
          'session/prompt',
        );

        const response = input.timeoutMs
          ? await withPromptTimeout(
              promptRequest,
              input.timeoutMs,
              session.connection,
              session.runtimeSessionId,
            )
          : await promptRequest;

        return {
          runtimeSessionId: session.runtimeSessionId,
          response,
        };
      },
    );
  }

  async function cancelSession(
    input: CancelAcpRuntimeSessionInput,
  ): Promise<void> {
    await sessionManager.withActivity(
      input.localSessionId,
      async ({ resource: session }) => {
        const params: CancelNotification = {
          sessionId: session.runtimeSessionId,
          _meta: input.reason ? { reason: input.reason } : undefined,
        };
        await session.connection.cancel(params);
      },
    );
  }

  async function close(): Promise<void> {
    await sessionManager.close();
  }

  function isConfigured(provider: string): boolean {
    return (
      resolveEnvProviderCommand(provider) !== null ||
      normalizeAcpProviderId(provider) === 'codex'
    );
  }

  function isSessionActive(localSessionId: string): boolean {
    return sessionManager.has(localSessionId);
  }

  async function killSession(localSessionId: string): Promise<void> {
    await sessionManager.remove(localSessionId);
  }

  async function openSessionRuntime(
    input: CreateAcpRuntimeSessionInput | LoadAcpRuntimeSessionInput,
  ): Promise<ActiveAcpRuntimeSession> {
    ensureAbsolutePath(input.cwd, 'ACP session cwd');
    const providerCommand = await resolveAcpRuntimeProviderCommand(
      input.provider,
    );

    if (!providerCommand) {
      throw new ProblemError({
        type: 'https://team-ai.dev/problems/acp-provider-not-configured',
        title: 'ACP Provider Not Configured',
        status: 503,
        detail:
          `ACP provider ${input.provider} is not configured. ` +
          `Set ${getProviderEnvCommandKey(input.provider)}.`,
      });
    }

    const launchCommand = buildProviderLaunchCommand(
      input.provider,
      providerCommand,
      input.cwd,
      input.model,
    );

    const child = spawn(launchCommand.command, launchCommand.args, {
      cwd: input.cwd,
      env: process.env,
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const stream = ndJsonStream(
      Writable.toWeb(child.stdin) as WritableStream<Uint8Array>,
      Readable.toWeb(child.stdout) as ReadableStream<Uint8Array>,
    );
    const terminals = new Map<string, LocalTerminal>();

    const connection = new ClientSideConnection(
      () => createClientHandler(input, terminals, options.logger),
      stream,
    );

    child.stderr.on('data', (chunk: Buffer) => {
      const stderr = chunk.toString('utf-8').trim();
      if (!stderr) {
        return;
      }

      options.logger?.warn?.(
        {
          stderr,
          localSessionId: input.localSessionId,
          provider: input.provider,
        },
        'ACP agent stderr',
      );
    });

    const initializeResponse = await initializeAcpConnection(
      connection,
      child,
      input,
      providerCommand.command,
    );

    const session: ActiveAcpRuntimeSession = {
      child,
      connection,
      cwd: input.cwd,
      hooks: input.hooks,
      initializeResponse,
      localSessionId: input.localSessionId,
      provider: input.provider,
      runtimeCommand: providerCommand.command,
      runtimeSessionId:
        'runtimeSessionId' in input
          ? input.runtimeSessionId
          : input.localSessionId,
      terminals,
    };

    void connection.closed
      .then(async () => {
        const active = sessionManager.get(input.localSessionId)?.resource;
        if (active?.connection === connection) {
          sessionManager.take(input.localSessionId);
        }
        await cleanupSession(session, false);
        await input.hooks.onClosed();
      })
      .catch(async (error: unknown) => {
        const active = sessionManager.get(input.localSessionId)?.resource;
        if (active?.connection === connection) {
          sessionManager.take(input.localSessionId);
        }
        await cleanupSession(session, false);
        await input.hooks.onClosed(
          error instanceof Error ? error : new Error('ACP connection closed'),
        );
      });

    return session;
  }

  async function cleanupSession(
    session: ActiveAcpRuntimeSession,
    forceKill: boolean,
  ): Promise<void> {
    await Promise.all(
      [...session.terminals.values()].map((terminal) =>
        releaseTerminal(terminal),
      ),
    );

    if (forceKill && session.child.exitCode == null) {
      session.child.kill('SIGTERM');
    }
  }

  return {
    cancelSession,
    close,
    createSession,
    isConfigured,
    isSessionActive,
    killSession,
    listSessions: () => sessionManager.list(),
    loadSession,
    promptSession,
  };
}

export function buildProviderLaunchCommand(
  provider: string,
  providerCommand: { args: string[]; command: string },
  cwd: string,
  model?: string | null,
): ProviderLaunchCommand {
  const normalizedProvider = normalizeAcpProviderId(provider);
  if (normalizedProvider === 'docker-opencode') {
    return buildDockerOpencodeLaunchCommand(providerCommand, cwd);
  }

  const args = [...providerCommand.args];
  const launchConfig = resolveProviderRuntimeLaunchConfig(normalizedProvider);

  if (
    launchConfig.appendCwd &&
    !args.includes('--cwd') &&
    cwd.trim().length > 0
  ) {
    args.push('--cwd', cwd);
  }

  if (launchConfig.passModelToLaunch && model && model.trim().length > 0) {
    args.push(launchConfig.modelArgFlag, model.trim());
  }

  return {
    command: providerCommand.command,
    args,
  };
}

function buildDockerOpencodeLaunchCommand(
  providerCommand: { args: string[]; command: string },
  cwd: string,
): ProviderLaunchCommand {
  const workspacePath = cwd.trim();
  const args = [...providerCommand.args];

  if (workspacePath.length > 0) {
    args.push('-v', `${workspacePath}:${workspacePath}`, '-w', workspacePath);
  }

  args.push(
    'ghcr.io/sst/opencode:latest',
    'opencode',
    'acp',
    '--cwd',
    workspacePath,
  );

  return {
    command: providerCommand.command,
    args,
  };
}

function createClientHandler(
  input: CreateAcpRuntimeSessionInput | LoadAcpRuntimeSessionInput,
  terminals: Map<string, LocalTerminal>,
  logger: LoggerLike | undefined,
) {
  const emitTerminalUpdate = (update: NormalizedSessionUpdate) => {
    void input.hooks.onSessionUpdate(update);
  };

  return {
    async requestPermission(
      params: RequestPermissionRequest,
    ): Promise<RequestPermissionResponse> {
      const preferred =
        params.options.find((option) => option.kind === 'allow_once') ??
        params.options.find((option) => option.kind === 'allow_always') ??
        params.options[0];

      if (!preferred) {
        return {
          outcome: {
            outcome: 'cancelled',
          },
        };
      }

      return {
        outcome: {
          outcome: 'selected',
          optionId: preferred.optionId,
        },
      };
    },
    async sessionUpdate(notification: SessionNotification) {
      const normalized = normalizeSessionNotification(
        input.localSessionId,
        input.provider,
        notification,
      );
      if (!normalized) {
        return;
      }

      await input.hooks.onSessionUpdate(normalized);
    },
    async readTextFile(params: {
      limit?: number | null;
      line?: number | null;
      path: string;
    }) {
      ensureAbsolutePath(params.path, 'ACP file read path');
      const content = await readFile(params.path, 'utf-8');
      const sliced = sliceFileContent(
        content,
        params.line ?? 1,
        params.limit ?? null,
      );
      return { content: sliced };
    },
    async writeTextFile(params: { content: string; path: string }) {
      ensureAbsolutePath(params.path, 'ACP file write path');
      await mkdir(dirname(params.path), { recursive: true });
      await writeFile(params.path, params.content, 'utf-8');
      return {};
    },
    async createTerminal(params: CreateTerminalRequest) {
      const terminalId = `term_${terminalIdGenerator()}`;
      const terminal = createLocalTerminal(
        terminalId,
        params,
        input.localSessionId,
        input.provider,
        input.cwd,
        logger,
        emitTerminalUpdate,
      );
      terminals.set(terminalId, terminal);
      emitTerminalUpdate(
        createTerminalLifecycleUpdate(
          input.localSessionId,
          input.provider,
          {
            sessionUpdate: 'terminal_created',
            terminalId,
            command: params.command,
            args: params.args ?? [],
            interactive: false,
          },
          {
            terminalId,
            command: params.command,
            args: params.args ?? [],
            interactive: false,
          },
        ),
      );
      return { terminalId };
    },
    async terminalOutput(params: {
      terminalId: string;
    }): Promise<TerminalOutputResponse> {
      const terminal = getTerminal(terminals, params.terminalId);
      return {
        output: terminal.output,
        truncated:
          Buffer.byteLength(terminal.output, 'utf-8') >=
          terminal.outputByteLimit,
        exitStatus: terminal.exitStatus,
      };
    },
    async waitForTerminalExit(params: { terminalId: string }) {
      const terminal = getTerminal(terminals, params.terminalId);
      return await terminal.waitForExit;
    },
    async killTerminal(params: { terminalId: string }) {
      const terminal = getTerminal(terminals, params.terminalId);
      if (terminal.command.exitCode == null) {
        terminal.command.kill('SIGTERM');
      }
      return {};
    },
    async releaseTerminal(params: { terminalId: string }) {
      const terminal = getTerminal(terminals, params.terminalId);
      terminals.delete(params.terminalId);
      await releaseTerminal(terminal);
      return {};
    },
  };
}

function createLocalTerminal(
  terminalId: string,
  params: CreateTerminalRequest,
  localSessionId: string,
  provider: string,
  fallbackCwd: string,
  logger: LoggerLike | undefined,
  emitUpdate: (update: NormalizedSessionUpdate) => void,
): LocalTerminal {
  const cwd = params.cwd?.trim() || fallbackCwd;
  ensureAbsolutePath(cwd, 'ACP terminal cwd');
  const child = spawn(params.command, params.args ?? [], {
    cwd,
    env: mergeTerminalEnv(params.env),
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const outputByteLimit = params.outputByteLimit ?? 64 * 1024;
  const terminal: LocalTerminal = {
    command: child,
    exitStatus: null,
    output: '',
    outputByteLimit,
    released: false,
    sessionId: params.sessionId,
    waitForExit: new Promise((resolve) => {
      child.once('close', (exitCode, signal) => {
        terminal.exitStatus = {
          exitCode,
          signal,
        };
        emitUpdate(
          createTerminalLifecycleUpdate(
            localSessionId,
            provider,
            {
              sessionUpdate: 'terminal_exited',
              terminalId,
              exitCode: exitCode ?? null,
            },
            {
              terminalId,
              exitCode: exitCode ?? null,
            },
          ),
        );
        resolve({
          exitCode,
          signal,
        });
      });
    }),
  };

  const appendOutput = (chunk: Buffer) => {
    const data = chunk.toString('utf-8');
    terminal.output = truncateUtf8(
      `${terminal.output}${data}`,
      terminal.outputByteLimit,
    );
    if (data.length > 0) {
      emitUpdate(
        createTerminalLifecycleUpdate(
          localSessionId,
          provider,
          {
            sessionUpdate: 'terminal_output',
            terminalId,
            data,
          },
          {
            terminalId,
            data,
          },
        ),
      );
    }
  };

  child.stdout?.on('data', appendOutput);
  child.stderr?.on('data', appendOutput);
  child.on('error', (error) => {
    logger?.warn?.(
      {
        err: error,
        terminalId,
        sessionId: params.sessionId,
      },
      'ACP terminal failed',
    );
  });

  return terminal;
}

function createTerminalLifecycleUpdate(
  sessionId: string,
  provider: string,
  rawUpdate: Record<string, unknown>,
  terminal: NonNullable<NormalizedSessionUpdate['terminal']>,
): NormalizedSessionUpdate {
  return {
    eventType: rawUpdate.sessionUpdate as
      | 'terminal_created'
      | 'terminal_output'
      | 'terminal_exited',
    provider,
    rawNotification: {
      sessionId,
      update: rawUpdate,
    } as SessionNotification,
    sessionId,
    terminal,
    timestamp: new Date().toISOString(),
  };
}

function getTerminal(
  terminals: Map<string, LocalTerminal>,
  terminalId: string,
): LocalTerminal {
  const terminal = terminals.get(terminalId);
  if (!terminal) {
    throw new ProblemError({
      type: 'https://team-ai.dev/problems/acp-terminal-not-found',
      title: 'ACP Terminal Not Found',
      status: 404,
      detail: `ACP terminal ${terminalId} was not found`,
    });
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

async function initializeAcpConnection(
  connection: ClientSideConnection,
  child: ReturnType<typeof spawn>,
  input: CreateAcpRuntimeSessionInput | LoadAcpRuntimeSessionInput,
  runtimeCommand: string,
): Promise<InitializeResponse> {
  const initializeTimeoutMs = resolveAcpRequestTimeoutMs(
    'initialize',
    runtimeCommand,
  );
  const initializeRequest = connection.initialize({
    protocolVersion: 1,
    clientInfo: {
      name: 'team-ai-local-server',
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

  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      if (child.exitCode == null) {
        child.kill('SIGTERM');
      }
      reject(
        new ProblemError({
          type: 'https://team-ai.dev/problems/acp-provider-initialize-timeout',
          title: 'ACP Provider Initialize Timeout',
          status: 503,
          detail:
            `ACP provider ${input.provider} did not complete initialize within ` +
            `${initializeTimeoutMs}ms. ` +
            'The configured command is likely not an ACP-compatible agent process.',
        }),
      );
    }, initializeTimeoutMs);
  });

  const exitPromise = new Promise<never>((_, reject) => {
    child.once('exit', (code, signal) => {
      reject(
        new ProblemError({
          type: 'https://team-ai.dev/problems/acp-provider-exited-during-initialize',
          title: 'ACP Provider Exited During Initialize',
          status: 503,
          detail:
            `ACP provider ${input.provider} exited before initialize completed ` +
            `(code=${code ?? 'null'}, signal=${signal ?? 'null'}).`,
        }),
      );
    });
  });

  const errorPromise = new Promise<never>((_, reject) => {
    child.once('error', (error) => {
      reject(
        new ProblemError({
          type: 'https://team-ai.dev/problems/acp-provider-launch-failed',
          title: 'ACP Provider Launch Failed',
          status: 503,
          detail:
            `Failed to launch ACP provider ${input.provider}: ` +
            `${error.message}`,
        }),
      );
    });
  });

  try {
    return await Promise.race([
      initializeRequest,
      timeoutPromise,
      exitPromise,
      errorPromise,
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

function ensureAbsolutePath(path: string, label: string): void {
  if (!isAbsolute(path)) {
    throw new ProblemError({
      type: 'https://team-ai.dev/problems/acp-path-invalid',
      title: 'ACP Path Invalid',
      status: 400,
      detail: `${label} must be an absolute path`,
    });
  }
}

function mergeTerminalEnv(
  env: Array<{ name: string; value: string }> | null | undefined,
): NodeJS.ProcessEnv {
  if (!env || env.length === 0) {
    return process.env;
  }

  return env.reduce<NodeJS.ProcessEnv>(
    (acc, variable) => {
      acc[variable.name] = variable.value;
      return acc;
    },
    { ...process.env },
  );
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

function truncateUtf8(value: string, maxBytes: number): string {
  if (Buffer.byteLength(value, 'utf-8') <= maxBytes) {
    return value;
  }

  let result = value;
  while (Buffer.byteLength(result, 'utf-8') > maxBytes && result.length > 0) {
    result = result.slice(1);
  }
  return result;
}

async function withPromptTimeout(
  request: Promise<PromptResponse>,
  timeoutMs: number,
  connection: ClientSideConnection,
  runtimeSessionId: string,
): Promise<PromptResponse> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  try {
    return await Promise.race([
      request,
      new Promise<PromptResponse>((_, reject) => {
        timeoutId = setTimeout(() => {
          void connection
            .cancel({ sessionId: runtimeSessionId })
            .catch(() => undefined);
          reject(
            new ProblemError({
              type: 'https://team-ai.dev/problems/acp-prompt-timeout',
              title: 'ACP Prompt Timed Out',
              status: 504,
              detail: `ACP prompt exceeded timeout of ${timeoutMs}ms`,
            }),
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

async function withRequestTimeout<T>(
  request: Promise<T>,
  timeoutMs: number,
  method: string,
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  try {
    return await Promise.race([
      request,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(`Timeout waiting for ${method}`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

function isPackageManagerRuntime(runtimeCommand: string): boolean {
  return runtimeCommand === 'npx' || runtimeCommand === 'uvx';
}
