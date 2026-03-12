import { existsSync } from 'node:fs';
import type { ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { join } from 'node:path';
import type { App } from 'electron';

const sidecarReadyTimeoutMs = 15_000;

export interface SidecarReadyMessage {
  service: string;
  type: 'sidecar-ready';
}

export async function findAvailablePort(host: string): Promise<number> {
  return await new Promise<number>((resolve, reject) => {
    const probe = createServer();

    probe.on('error', reject);
    probe.listen(0, host, () => {
      const address = probe.address();

      if (!address || typeof address === 'string') {
        probe.close(() =>
          reject(new Error('Unable to determine available sidecar port')),
        );
        return;
      }

      const { port } = address;
      probe.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(port);
      });
    });
  });
}

export function resolveChildExecPath(application: App): string | undefined {
  if (application.isPackaged) {
    return undefined;
  }

  return process.env.npm_node_execpath ?? process.env.NODE ?? 'node';
}

export function resolveSidecarEntry(
  application: App,
  packagedFolder: string,
  developmentFolder: string,
): string {
  const candidates = application.isPackaged
    ? [join(process.resourcesPath, packagedFolder, 'main.js')]
    : [
        join(process.cwd(), developmentFolder, 'main.js'),
        join(application.getAppPath(), developmentFolder, 'main.js'),
        join(__dirname, '..', '..', '..', developmentFolder, 'main.js'),
        join(__dirname, packagedFolder, 'main.js'),
        join(application.getAppPath(), packagedFolder, 'main.js'),
      ];

  const entry = candidates.find((candidate) => existsSync(candidate));

  if (!entry) {
    throw new Error(
      `${packagedFolder} entry not found. Tried: ${candidates.join(', ')}`,
    );
  }

  return entry;
}

export async function waitForSidecarReady(
  child: Pick<ChildProcess, 'once' | 'removeListener'>,
  sidecarName: string,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const readyTimeout = setTimeout(() => {
      cleanup();
      reject(
        new Error(
          `${sidecarName} did not report readiness within ${sidecarReadyTimeoutMs}ms`,
        ),
      );
    }, sidecarReadyTimeoutMs);

    const onError = (error: Error) => {
      cleanup();
      reject(
        new Error(`${sidecarName} failed before reporting readiness: ${error.message}`),
      );
    };

    const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
      cleanup();

      const reason =
        signal !== null
          ? `signal ${signal}`
          : code !== null
            ? `exit code ${code}`
            : 'unknown reason';

      reject(
        new Error(`${sidecarName} exited before reporting readiness (${reason})`),
      );
    };

    const onMessage = (message: unknown) => {
      if (!isSidecarReadyMessage(message)) {
        return;
      }

      cleanup();
      resolve();
    };

    const cleanup = () => {
      clearTimeout(readyTimeout);
      child.removeListener('error', onError);
      child.removeListener('exit', onExit);
      child.removeListener('message', onMessage);
    };

    child.once('error', onError);
    child.once('exit', onExit);
    child.once('message', onMessage);
  });
}

export function sendSidecarReady(service: string): void {
  process.send?.({
    service,
    type: 'sidecar-ready',
  } satisfies SidecarReadyMessage);
}

function isSidecarReadyMessage(message: unknown): message is SidecarReadyMessage {
  if (!message || typeof message !== 'object') {
    return false;
  }

  return (
    'type' in message &&
    message.type === 'sidecar-ready' &&
    'service' in message &&
    typeof message.service === 'string'
  );
}
