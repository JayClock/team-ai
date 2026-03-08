import Fastify from 'fastify';
import { app } from './app/app';

const host = process.env.HOST ?? '127.0.0.1';
const port = process.env.PORT ? Number(process.env.PORT) : 4310;

const server = Fastify({
  logger: true,
});

server.register(app, {
  desktopSessionToken: process.env.DESKTOP_SESSION_TOKEN,
});

server.listen({ port, host }, (err) => {
  if (err) {
    server.log.error(err);
    process.exit(1);
  } else {
    console.log(`[ready] http://${host}:${port}`);
  }
});
