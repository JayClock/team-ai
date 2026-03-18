import { describe, expect, it } from 'vitest';
import type { AcpEventEnvelope } from '@shared/schema';
import {
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
});
