import { describe, expect, it } from 'vitest';
import { ProblemError } from '../errors/problem-error.js';
import {
  buildBootstrapPrompt,
  resolveLocalMcpServers,
  resolveSessionCwd,
} from './session-runtime-context.js';

describe('session-runtime-context', () => {
  it('builds a bootstrap prompt from system and user content', () => {
    expect(
      buildBootstrapPrompt('  You are a specialist.  ', 'Start now'),
    ).toBe('System:\nYou are a specialist.\n\nUser:\nStart now');
  });

  it('requires an absolute cwd', () => {
    expect(() => resolveSessionCwd(null)).toThrow(ProblemError);
    expect(() => resolveSessionCwd('relative/path')).toThrow(ProblemError);
    expect(resolveSessionCwd('/tmp/project')).toBe('/tmp/project');
  });

  it('builds the local MCP server descriptor from env', () => {
    expect(
      resolveLocalMcpServers({
        DESKTOP_SESSION_TOKEN: 'desktop-token',
        HOST: '0.0.0.0',
        PORT: '4310',
      }),
    ).toEqual([
      {
        type: 'http',
        name: 'team_ai_local',
        url: 'http://0.0.0.0:4310/api/mcp',
        headers: [
          {
            name: 'X-TeamAI-MCP-Access-Mode',
            value: 'read-write',
          },
          {
            name: 'Authorization',
            value: 'Bearer desktop-token',
          },
        ],
      },
    ]);
  });

  it('omits the local MCP descriptor when PORT is unavailable', () => {
    expect(resolveLocalMcpServers({ HOST: '127.0.0.1' })).toEqual([]);
  });
});
