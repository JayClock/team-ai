import type { AddressInfo } from 'node:net';
import { loadConfig } from './config.js';
import { Logger } from './logger.js';
import { GatewayMetrics } from './observability.js';
import { ProviderRuntime } from './provider-runtime.js';
import { createGatewayServer } from './server.js';
import { SessionStore } from './session-store.js';

function main(): void {
  const config = loadConfig(process.env);
  const logger = new Logger(config.logLevel);
  const sessionStore = new SessionStore();
  const metrics = new GatewayMetrics();
  const providerRuntime = new ProviderRuntime(config);
  const server = createGatewayServer(
    config,
    logger,
    sessionStore,
    providerRuntime,
    metrics,
  );

  server.on('error', (error: Error) => {
    logger.error('agent-gateway failed', { error: error.message });
    process.exitCode = 1;
  });

  server.listen(config.port, config.host, () => {
    const address = server.address() as AddressInfo;
    process.send?.({
      service: 'agent-gateway',
      type: 'sidecar-ready',
    });
    logger.info('agent-gateway started', {
      host: address.address,
      port: address.port,
      protocols: config.protocols,
      providers: config.providers,
    });
  });

  const shutdown = (signal: NodeJS.Signals) => {
    logger.info('agent-gateway shutting down', { signal });
    void providerRuntime.close().finally(() => {
      server.close((error?: Error) => {
        if (error) {
          logger.error('agent-gateway shutdown failed', {
            error: error.message,
          });
          process.exitCode = 1;
        }
        process.exit();
      });
    });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main();
