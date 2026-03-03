import type { AddressInfo } from 'node:net';
import { loadConfig } from './config.js';
import { Logger } from './logger.js';
import { createGatewayServer } from './server.js';
import { SessionStore } from './session-store.js';

function main(): void {
  const config = loadConfig(process.env);
  const logger = new Logger(config.logLevel);
  const sessionStore = new SessionStore();
  const server = createGatewayServer(config, logger, sessionStore);

  server.on('error', (error: Error) => {
    logger.error('agent-gateway failed', { error: error.message });
    process.exitCode = 1;
  });

  server.listen(config.port, config.host, () => {
    const address = server.address() as AddressInfo;
    logger.info('agent-gateway started', {
      host: address.address,
      port: address.port,
      protocols: config.protocols,
      providers: config.providers,
    });
  });

  const shutdown = (signal: NodeJS.Signals) => {
    logger.info('agent-gateway shutting down', { signal });
    server.close((error?: Error) => {
      if (error) {
        logger.error('agent-gateway shutdown failed', { error: error.message });
        process.exitCode = 1;
      }
      process.exit();
    });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main();
