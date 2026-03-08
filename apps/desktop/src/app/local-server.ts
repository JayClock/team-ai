import { fork, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { join } from 'node:path';
import type { App } from 'electron';
import {
  desktopSessionHeader,
  type DesktopRuntimeConfig,
} from './api/runtime-config';

const localServerHost = '127.0.0.1';
const healthcheckTimeoutMs = 15_000;
const healthcheckIntervalMs = 250;

export class LocalServerManager {
  private static child: ChildProcess | null = null;

  private static runtimeConfig: DesktopRuntimeConfig | null = null;

  static async start(application: App): Promise<DesktopRuntimeConfig> {
    if (LocalServerManager.runtimeConfig) {
      return LocalServerManager.runtimeConfig;
    }

    const port = await LocalServerManager.findAvailablePort();
    const serverEntry = LocalServerManager.resolveServerEntry(application);
    const desktopSessionToken = randomUUID();
    const dataDir = join(application.getPath('userData'), 'local-server');

    LocalServerManager.child = fork(serverEntry, [], {
      env: {
        DESKTOP_SESSION_TOKEN: desktopSessionToken,
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        HOST: localServerHost,
        PORT: String(port),
        TEAMAI_DATA_DIR: dataDir,
      },
      stdio: 'inherit',
    });

    LocalServerManager.child.once('exit', () => {
      LocalServerManager.child = null;
      LocalServerManager.runtimeConfig = null;
    });

    const apiBaseUrl = `http://${localServerHost}:${port}/api`;
    await LocalServerManager.waitForHealthcheck(apiBaseUrl, desktopSessionToken);

    LocalServerManager.runtimeConfig = {
      apiBaseUrl,
      appVersion: application.getVersion(),
      desktopSessionHeader,
      desktopSessionToken,
      platform: process.platform,
    };

    return LocalServerManager.runtimeConfig;
  }

  static getRuntimeConfig(): DesktopRuntimeConfig | null {
    return LocalServerManager.runtimeConfig;
  }

  static async stop(): Promise<void> {
    if (!LocalServerManager.child) {
      LocalServerManager.runtimeConfig = null;
      return;
    }

    const child = LocalServerManager.child;

    await new Promise<void>((resolve) => {
      child.once('exit', () => resolve());
      child.kill();
    });

    LocalServerManager.child = null;
    LocalServerManager.runtimeConfig = null;
  }

  private static async findAvailablePort(): Promise<number> {
    return await new Promise<number>((resolve, reject) => {
      const probe = createServer();

      probe.on('error', reject);
      probe.listen(0, localServerHost, () => {
        const address = probe.address();

        if (!address || typeof address === 'string') {
          probe.close(() => reject(new Error('Unable to determine local server port')));
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

  private static resolveServerEntry(application: App): string {
    if (!application.isPackaged) {
      return join(application.getAppPath(), 'apps', 'local-server', 'dist', 'main.js');
    }

    return join(process.resourcesPath, 'local-server', 'main.js');
  }

  private static async waitForHealthcheck(
    apiBaseUrl: string,
    desktopSessionToken: string,
  ): Promise<void> {
    const deadline = Date.now() + healthcheckTimeoutMs;
    const healthUrl = `${apiBaseUrl}/health`;

    while (Date.now() < deadline) {
      try {
        const response = await fetch(healthUrl, {
          headers: {
            [desktopSessionHeader]: desktopSessionToken,
          },
        });

        if (response.ok) {
          return;
        }
      } catch {}

      await new Promise((resolve) => setTimeout(resolve, healthcheckIntervalMs));
    }

    throw new Error(`Local server did not become healthy: ${healthUrl}`);
  }
}
