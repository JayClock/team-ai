import { describe, expect, it } from 'vitest';
import type { AcpEventEnvelope } from '@shared/schema';
import {
  buildToolPart,
  isAssistantProgressEvent,
  shouldClearPendingAssistant,
} from './use-project-session-chat';

function buildEvent(
  eventType: AcpEventEnvelope['update']['eventType'],
  emittedAt: string,
): AcpEventEnvelope {
  return {
    emittedAt,
    error: null,
    eventId: `${eventType}-${emittedAt}`,
    sessionId: 'session-1',
    update: {
      eventType,
      provider: 'codex',
      rawNotification: null,
      sessionId: 'session-1',
      timestamp: emittedAt,
    },
  } as AcpEventEnvelope;
}

describe('useProjectSessionChat helpers', () => {
  it('recognizes assistant progress events that should clear pending state', () => {
    expect(
      isAssistantProgressEvent(
        buildEvent('agent_message', '2026-03-18T00:00:01.000Z'),
      ),
    ).toBe(true);
    expect(
      isAssistantProgressEvent(
        buildEvent('turn_complete', '2026-03-18T00:00:02.000Z'),
      ),
    ).toBe(true);
    expect(
      isAssistantProgressEvent(
        buildEvent('available_commands_update', '2026-03-18T00:00:03.000Z'),
      ),
    ).toBe(false);
  });

  it('only clears pending assistant placeholders after newer server progress', () => {
    expect(
      shouldClearPendingAssistant('2026-03-18T00:00:05.000Z', [
        buildEvent('user_message', '2026-03-18T00:00:06.000Z'),
        buildEvent('available_commands_update', '2026-03-18T00:00:07.000Z'),
      ]),
    ).toBe(false);

    expect(
      shouldClearPendingAssistant('2026-03-18T00:00:05.000Z', [
        buildEvent('agent_message', '2026-03-18T00:00:06.000Z'),
      ]),
    ).toBe(true);

    expect(
      shouldClearPendingAssistant('2026-03-18T00:00:05.000Z', [
        buildEvent('turn_complete', '2026-03-18T00:00:06.000Z'),
      ]),
    ).toBe(true);
  });

  it('builds tool parts from raw notifications when structured tool fields are missing', () => {
    const toolEvent = {
      emittedAt: '2026-03-18T13:54:02.690Z',
      error: null,
      eventId: 'tool-event-1',
      sessionId: 'session-1',
      update: {
        eventType: 'tool_call_update',
        provider: 'codex',
        rawNotification: {
          call_id: 'call_WdZfL1zkvLfhcTjdWX4R9xx1',
          command: [
            '/bin/zsh',
            '-lc',
            "sed -n '1,260p' apps/local-server/src/app/services/task-report-service.ts",
          ],
          cwd: '/tmp/team-ai',
          parsed_cmd: [
            {
              cmd: "sed -n '1,260p' apps/local-server/src/app/services/task-report-service.ts",
              name: 'task-report-service.ts',
              path: 'apps/local-server/src/app/services/task-report-service.ts',
              type: 'read',
            },
          ],
          source: 'agent',
          structuredContent: {
            note: {
              title: 'Explain current ACP management in the project',
            },
          },
          stdout: 'import type { Database } from \'better-sqlite3\';',
        },
        sessionId: 'session-1',
        timestamp: '2026-03-18T13:54:02.690Z',
        toolCall: {
          content: [],
          input: null,
          inputFinalized: true,
          kind: null,
          locations: [],
          output: null,
          status: 'completed',
          title: null,
          toolCallId: 'tool-call-1',
        },
      },
    } as AcpEventEnvelope;

    const part = buildToolPart(toolEvent);

    expect(part).toMatchObject({
      type: 'dynamic-tool',
      toolCallId: 'tool-call-1',
      state: 'output-available',
      output: {
        note: {
          title: 'Explain current ACP management in the project',
        },
      },
    });
    expect(part?.toolName).toContain('sed -n');
    expect(part?.input).toMatchObject({
      command: [
        '/bin/zsh',
        '-lc',
        "sed -n '1,260p' apps/local-server/src/app/services/task-report-service.ts",
      ],
      cwd: '/tmp/team-ai',
      source: 'agent',
    });
  });
});
