import { fork, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import type { App } from 'electron';
import {
  desktopSessionHeader,
  type DesktopRuntimeConfig,
} from './api/runtime-config';
import {
  findAvailablePort,
  resolveChildExecPath,
  resolveSidecarEntry,
  waitForSidecarReady,
} from './node-sidecar';

const localServerHost = '127.0.0.1';

interface LocalServerStartOptions {
  agentGatewayBaseUrl: string;
}

export class LocalServerManager {
  private static child: ChildProcess | null = null;

  private static runtimeConfig: DesktopRuntimeConfig | null = null;

  static async start(
    application: App,
    options: LocalServerStartOptions,
  ): Promise<DesktopRuntimeConfig> {
    if (LocalServerManager.runtimeConfig) {
      return LocalServerManager.runtimeConfig;
    }

    const port = await findAvailablePort(localServerHost);
    const serverEntry = resolveSidecarEntry(
      application,
      'local-server',
      'apps/local-server/dist',
    );
    const desktopSessionToken = randomUUID();
    const dataDir = join(application.getPath('userData'), 'local-server');

    LocalServerManager.child = fork(serverEntry, [], {
      execPath: resolveChildExecPath(application),
      env: {
        ...process.env,
        AGENT_GATEWAY_BASE_URL: options.agentGatewayBaseUrl,
        DESKTOP_SESSION_TOKEN: desktopSessionToken,
        ELECTRON_RUN_AS_NODE: '1',
        HOST: localServerHost,
        PORT: String(port),
        TEAMAI_DATA_DIR: dataDir,
      },
      stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
    });

    LocalServerManager.child.once('exit', () => {
      LocalServerManager.child = null;
      LocalServerManager.runtimeConfig = null;
    });

    const apiBaseUrl = `http://${localServerHost}:${port}/api`;
    await waitForSidecarReady(LocalServerManager.child, 'local-server sidecar');

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
}
