import { spawn } from 'node:child_process';
import type {
  ProviderAdapter,
  ProviderPromptCallbacks,
  ProviderPromptRequest,
  ProviderProtocolEvent,
} from './provider-types.js';

const DEFAULT_CANCEL_GRACE_MS = 3_000;

type ActiveRun = {
  process: ReturnType<typeof spawn>;
  timeout: ReturnType<typeof setTimeout>;
};

interface CodexMcpServerConfig {
  bearerTokenEnvVar?: string;
  name: string;
  url: string;
}

export class CodexProviderAdapter implements ProviderAdapter {
  readonly name = 'codex';
  private readonly commandParts: string[];
  private readonly jsonMode: boolean;
  private readonly activeRuns = new Map<string, ActiveRun>();

  constructor(command: string) {
    this.commandParts = ensureCodexJsonOutput(tokenize(command));
    if (this.commandParts.length === 0) {
      throw new Error('codex command must not be empty');
    }
    this.jsonMode = this.commandParts.includes('--json');
  }

  prompt(request: ProviderPromptRequest, callbacks: ProviderPromptCallbacks): void {
    if (this.activeRuns.has(request.sessionId)) {
      callbacks.onError({
        code: 'PROVIDER_SESSION_BUSY',
        message: `Session already has an active run: ${request.sessionId}`,
        retryable: false,
        retryAfterMs: 0,
      });
      return;
    }

    const [command, ...args] = buildCommandParts(this.commandParts, request);
    const childProcess = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false,
      ...(request.cwd ? { cwd: request.cwd } : {}),
      ...(request.env ? { env: { ...process.env, ...request.env } } : {}),
    });

    let stderr = '';
    let stdoutBuffer = '';
    let settled = false;

    childProcess.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf-8');
      if (!this.jsonMode) {
        callbacks.onChunk(text);
        return;
      }

      stdoutBuffer += text;
      stdoutBuffer = emitStructuredStdout(stdoutBuffer, callbacks, request.traceId);
    });

    childProcess.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf-8');
    });

    childProcess.on('error', (error: Error) => {
      if (settled) {
        return;
      }
      settled = true;
      this.clearRun(request.sessionId);
      callbacks.onError({
        code: 'PROVIDER_PROCESS_START_FAILED',
        message: `Failed to start codex process: ${error.message}`,
        retryable: true,
        retryAfterMs: 1000,
      });
    });

    childProcess.on('close', (exitCode: number | null, signal: NodeJS.Signals | null) => {
      if (settled) {
        return;
      }
      settled = true;
      this.clearRun(request.sessionId);
      if (this.jsonMode && stdoutBuffer.trim().length > 0) {
        emitStructuredLine(stdoutBuffer, callbacks, request.traceId);
      }

      if (signal === 'SIGTERM' || signal === 'SIGKILL') {
        callbacks.onError({
          code: 'PROVIDER_CANCELLED',
          message: `Codex run cancelled (${signal})`,
          retryable: false,
          retryAfterMs: 0,
        });
        return;
      }

      if (exitCode === 0) {
        callbacks.onComplete();
        return;
      }

      callbacks.onError({
        code: 'PROVIDER_PROCESS_EXITED',
        message: `Codex exited with code ${exitCode ?? -1}: ${stderr.trim()}`,
        retryable: true,
        retryAfterMs: 1000,
      });
    });

    const timeout = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      childProcess.kill('SIGTERM');
      setTimeout(() => {
        if (childProcess.exitCode == null) {
          childProcess.kill('SIGKILL');
        }
      }, DEFAULT_CANCEL_GRACE_MS);
      callbacks.onError({
        code: 'PROVIDER_TIMEOUT',
        message: `Codex run timed out after ${request.timeoutMs}ms`,
        retryable: true,
        retryAfterMs: 1000,
      });
    }, request.timeoutMs);

    this.activeRuns.set(request.sessionId, { process: childProcess, timeout });

    childProcess.stdin.write(request.input);
    childProcess.stdin.end();
  }

  cancel(sessionId: string): boolean {
    const activeRun = this.activeRuns.get(sessionId);
    if (!activeRun) {
      return false;
    }

    activeRun.process.kill('SIGTERM');
    setTimeout(() => {
      if (activeRun.process.exitCode == null) {
        activeRun.process.kill('SIGKILL');
      }
    }, DEFAULT_CANCEL_GRACE_MS);

    return true;
  }

  private clearRun(sessionId: string): void {
    const activeRun = this.activeRuns.get(sessionId);
    if (!activeRun) {
      return;
    }

    clearTimeout(activeRun.timeout);
    this.activeRuns.delete(sessionId);
  }
}

function buildCommandParts(
  commandParts: string[],
  request: ProviderPromptRequest
): string[] {
  const extraArgs = resolveMcpServerConfigArgs(request.metadata);
  if (extraArgs.length === 0) {
    return [...commandParts];
  }

  const [command, ...args] = commandParts;
  const stdinPromptIndex = args.lastIndexOf('-');

  if (stdinPromptIndex >= 0) {
    return [
      command,
      ...args.slice(0, stdinPromptIndex),
      ...extraArgs,
      ...args.slice(stdinPromptIndex),
    ];
  }

  return [command, ...args, ...extraArgs];
}

function tokenize(command: string): string[] {
  return command
    .trim()
    .split(/\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function ensureCodexJsonOutput(commandParts: string[]): string[] {
  if (
    commandParts.length >= 2 &&
    commandParts[0] === 'codex' &&
    commandParts[1] === 'exec' &&
    !commandParts.includes('--json')
  ) {
    return [commandParts[0], commandParts[1], '--json', ...commandParts.slice(2)];
  }

  return commandParts;
}

function resolveMcpServerConfigArgs(
  metadata?: Record<string, unknown>
): string[] {
  const mcpServers = parseMcpServers(metadata?.mcpServers);
  if (mcpServers.length === 0) {
    return [];
  }

  return mcpServers.flatMap((server) => {
    const args = [
      '-c',
      `mcp_servers.${server.name}.url=${toTomlString(server.url)}`,
    ];

    if (server.bearerTokenEnvVar) {
      args.push(
        '-c',
        `mcp_servers.${server.name}.bearer_token_env_var=${toTomlString(server.bearerTokenEnvVar)}`
      );
    }

    return args;
  });
}

function parseMcpServers(value: unknown): CodexMcpServerConfig[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      return [];
    }

    const name =
      typeof (entry as { name?: unknown }).name === 'string'
        ? (entry as { name: string }).name.trim()
        : '';
    const url =
      typeof (entry as { url?: unknown }).url === 'string'
        ? (entry as { url: string }).url.trim()
        : '';
    const bearerTokenEnvVar =
      typeof (entry as { bearerTokenEnvVar?: unknown }).bearerTokenEnvVar ===
      'string'
        ? (entry as { bearerTokenEnvVar: string }).bearerTokenEnvVar.trim()
        : undefined;

    if (!name || !url) {
      return [];
    }

    return [
      {
        name,
        url,
        ...(bearerTokenEnvVar ? { bearerTokenEnvVar } : {}),
      },
    ];
  });
}

function toTomlString(value: string): string {
  return JSON.stringify(value);
}

function emitStructuredStdout(
  buffer: string,
  callbacks: ProviderPromptCallbacks,
  traceId?: string
): string {
  let remainder = buffer;
  let newlineIndex = remainder.indexOf('\n');

  while (newlineIndex >= 0) {
    const line = remainder.slice(0, newlineIndex);
    emitStructuredLine(line, callbacks, traceId);
    remainder = remainder.slice(newlineIndex + 1);
    newlineIndex = remainder.indexOf('\n');
  }

  return remainder;
}

function emitStructuredLine(
  line: string,
  callbacks: ProviderPromptCallbacks,
  traceId?: string
): void {
  const trimmed = line.trim();
  if (!trimmed) {
    return;
  }

  const event = parseProtocolEvent(trimmed, traceId);
  if (event) {
    callbacks.onEvent(event);
    return;
  }

  callbacks.onChunk(trimmed);
}

function parseProtocolEvent(
  line: string,
  traceId?: string
): ProviderProtocolEvent | null {
  try {
    const payload = JSON.parse(line) as unknown;
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return null;
    }

    const protocol =
      typeof (payload as { protocol?: unknown }).protocol === 'string' &&
      isProtocolName((payload as { protocol?: string }).protocol)
        ? ((payload as { protocol: ProviderProtocolEvent['protocol'] }).protocol)
        : 'acp';

    return {
      protocol,
      payload,
      traceId,
    };
  } catch {
    return null;
  }
}

function isProtocolName(value: string | undefined): value is ProviderProtocolEvent['protocol'] {
  return value === 'acp' || value === 'mcp' || value === 'a2a';
}
