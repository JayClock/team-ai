import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';
import type { App } from 'electron';

const healthcheckTimeoutMs = 15_000;
const healthcheckIntervalMs = 250;

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

export async function waitForHealthcheck(
  healthUrl: string,
  headers?: Record<string, string>,
): Promise<void> {
  const deadline = Date.now() + healthcheckTimeoutMs;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(healthUrl, {
        headers,
      });

      if (response.ok) {
        return;
      }
    } catch {}

    await new Promise((resolve) => setTimeout(resolve, healthcheckIntervalMs));
  }

  throw new Error(`Sidecar did not become healthy: ${healthUrl}`);
}
