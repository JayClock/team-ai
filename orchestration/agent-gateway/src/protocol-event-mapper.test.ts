import { describe, expect, it } from 'vitest';
import { mapProtocolEvent } from './protocol-event-mapper.js';

describe('mapProtocolEvent', () => {
  it('maps canonical acp tool updates to tool events', () => {
    expect(
      mapProtocolEvent({
        protocol: 'acp',
        traceId: 'trace-tool-result',
        update: {
          eventType: 'tool_call_update',
          provider: 'codex',
          sessionId: 'session-1',
          timestamp: '2026-03-14T00:00:00.000Z',
          rawNotification: {},
          toolCall: {
            toolCallId: 'tool-1',
            title: 'read_file',
            status: 'completed',
            inputFinalized: true,
            output: 'README',
            locations: [],
            content: [],
          },
        },
      })
    ).toMatchObject({
      type: 'tool',
      traceId: 'trace-tool-result',
      nextState: 'RUNNING',
      data: {
        protocol: 'acp',
        update: {
          eventType: 'tool_call_update',
          toolCall: {
            output: 'README',
          },
        },
      },
    });
  });

  it('maps canonical acp agent messages to delta events with running state', () => {
    expect(
      mapProtocolEvent({
        protocol: 'acp',
        traceId: 'trace-chunk',
        update: {
          eventType: 'agent_message',
          provider: 'codex',
          sessionId: 'session-1',
          timestamp: '2026-03-14T00:00:00.000Z',
          rawNotification: {},
          message: {
            role: 'assistant',
            content: 'hello',
            isChunk: true,
          },
        },
      })
    ).toMatchObject({
      type: 'delta',
      traceId: 'trace-chunk',
      nextState: 'RUNNING',
      data: {
        protocol: 'acp',
        text: 'hello',
      },
    });
  });

  it('maps canonical turn completion updates to complete events', () => {
    expect(
      mapProtocolEvent({
        protocol: 'acp',
        traceId: 'trace-complete',
        update: {
          eventType: 'turn_complete',
          provider: 'codex',
          sessionId: 'session-1',
          timestamp: '2026-03-14T00:00:00.000Z',
          rawNotification: {},
          turnComplete: {
            stopReason: 'prompt-finished',
            usage: null,
            userMessageId: null,
          },
        },
      })
    ).toMatchObject({
      type: 'complete',
      traceId: 'trace-complete',
      data: {
        protocol: 'acp',
        update: {
          eventType: 'turn_complete',
          turnComplete: {
            stopReason: 'prompt-finished',
          },
        },
      },
    });
  });
});
