import { isAbsolute } from 'node:path';
import type { McpServer } from '@agentclientprotocol/sdk';
import { ProblemError } from '../errors/problem-error.js';

export function buildBootstrapPrompt(
  systemPrompt: string,
  userPrompt: string,
): string {
  return [`System:\n${systemPrompt.trim()}`, `User:\n${userPrompt}`].join(
    '\n\n',
  );
}

export function resolveSessionCwd(repoPath: string | null): string {
  const cwd = repoPath?.trim();
  if (!cwd || !isAbsolute(cwd)) {
    throw new ProblemError({
      type: 'https://team-ai.dev/problems/acp-project-workspace-missing',
      title: 'ACP Project Workspace Missing',
      status: 409,
      detail:
        'ACP sessions require project.repoPath to be set to an absolute local path',
    });
  }

  return cwd;
}

export function resolveLocalMcpServers(env: NodeJS.ProcessEnv = process.env): McpServer[] {
  const host = env.HOST?.trim() || '127.0.0.1';
  const port = env.PORT?.trim();

  if (!port) {
    return [];
  }

  const headers = [
    {
      name: 'X-TeamAI-MCP-Access-Mode',
      value: 'read-write',
    },
    ...(env.DESKTOP_SESSION_TOKEN?.trim()
      ? [
          {
            name: 'Authorization',
            value: `Bearer ${env.DESKTOP_SESSION_TOKEN.trim()}`,
          },
        ]
      : []),
  ];

  return [
    {
      type: 'http',
      name: 'team_ai_local',
      url: `http://${host}:${port}/api/mcp`,
      headers,
    },
  ];
}
