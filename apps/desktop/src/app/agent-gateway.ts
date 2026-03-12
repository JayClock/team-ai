import { fork, type ChildProcess } from 'node:child_process';
import type { App } from 'electron';
import {
  findAvailablePort,
  resolveChildExecPath,
  resolveSidecarEntry,
  waitForSidecarReady,
} from './node-sidecar';

const agentGatewayHost = '127.0.0.1';

export interface AgentGatewayRuntime {
  baseUrl: string;
  host: string;
  port: number;
}

export class AgentGatewayManager {
  private static child: ChildProcess | null = null;

  private static runtime: AgentGatewayRuntime | null = null;

  static async start(application: App): Promise<AgentGatewayRuntime> {
    if (AgentGatewayManager.runtime) {
      return AgentGatewayManager.runtime;
    }

    const port = await findAvailablePort(agentGatewayHost);
    const gatewayEntry = resolveSidecarEntry(
      application,
      'agent-gateway',
      'apps/agent-gateway/dist',
    );

    AgentGatewayManager.child = fork(gatewayEntry, [], {
      execPath: resolveChildExecPath(application),
      env: {
        ...process.env,
        AGENT_GATEWAY_HOST: agentGatewayHost,
        AGENT_GATEWAY_PORT: String(port),
        ELECTRON_RUN_AS_NODE: '1',
      },
      stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
    });

    AgentGatewayManager.child.once('exit', () => {
      AgentGatewayManager.child = null;
      AgentGatewayManager.runtime = null;
    });

    const baseUrl = `http://${agentGatewayHost}:${port}`;
    await waitForSidecarReady(AgentGatewayManager.child, 'agent-gateway sidecar');

    AgentGatewayManager.runtime = {
      baseUrl,
      host: agentGatewayHost,
      port,
    };

    return AgentGatewayManager.runtime;
  }

  static getRuntime(): AgentGatewayRuntime | null {
    return AgentGatewayManager.runtime;
  }

  static async stop(): Promise<void> {
    if (!AgentGatewayManager.child) {
      AgentGatewayManager.runtime = null;
      return;
    }

    const child = AgentGatewayManager.child;

    await new Promise<void>((resolve) => {
      child.once('exit', () => resolve());
      child.kill();
    });

    AgentGatewayManager.child = null;
    AgentGatewayManager.runtime = null;
  }
}
