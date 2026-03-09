import { spawn } from 'node:child_process';
import type { ProviderAdapter, ProviderPromptCallbacks, ProviderPromptRequest } from './provider-types.js';

const DEFAULT_CANCEL_GRACE_MS = 3_000;

type ActiveRun = {
  process: ReturnType<typeof spawn>;
  timeout: ReturnType<typeof setTimeout>;
};

export class CodexProviderAdapter implements ProviderAdapter {
  readonly name = 'codex';
  private readonly commandParts: string[];
  private readonly activeRuns = new Map<string, ActiveRun>();

  constructor(command: string) {
    this.commandParts = tokenize(command);
    if (this.commandParts.length === 0) {
      throw new Error('codex command must not be empty');
    }
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

    const [command, ...args] = this.commandParts;
    const childProcess = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false,
      ...(request.cwd ? { cwd: request.cwd } : {}),
      ...(request.env ? { env: { ...process.env, ...request.env } } : {}),
    });

    let stderr = '';
    let settled = false;

    childProcess.stdout.on('data', (chunk: Buffer) => {
      callbacks.onChunk(chunk.toString('utf-8'));
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

function tokenize(command: string): string[] {
  return command
    .trim()
    .split(/\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}
