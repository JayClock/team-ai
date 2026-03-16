import type { FastifyInstance } from 'fastify';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { LocalMcpToolManager } from './local-mcp-tool-manager';
import type { McpAccessMode } from './contracts';

export interface CreateLocalMcpServerResult {
  server: McpServer;
  toolManager: LocalMcpToolManager;
}

export function createLocalMcpServer(
  fastify: FastifyInstance,
  accessMode: McpAccessMode,
): CreateLocalMcpServerResult {
  const server = new McpServer({
    name: 'team-ai-local-mcp',
    version: 'desktop',
  });

  const toolManager = new LocalMcpToolManager(fastify, accessMode);
  toolManager.registerTools(server);

  return {
    server,
    toolManager,
  };
}
