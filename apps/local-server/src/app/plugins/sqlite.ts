import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';
import type { Database } from 'better-sqlite3';
import { initializeDatabase } from '../db/sqlite';
import { ensureDefaultProject } from '../services/project-service';

declare module 'fastify' {
  interface FastifyInstance {
    sqlite: Database;
  }
}

const sqlitePlugin: FastifyPluginAsync = async (fastify) => {
  const sqlite = initializeDatabase();
  await ensureDefaultProject(sqlite);

  fastify.decorate('sqlite', sqlite);
  fastify.addHook('onClose', async () => {
    sqlite.close();
  });
};

export default fp(sqlitePlugin, {
  name: 'sqlite',
});
