import { describe, expect, it } from 'vitest';
import { mapProtocolEvent } from './protocol-event-mapper.js';

describe('mapProtocolEvent', () => {
  it('maps acp tool_result payloads to tool events', () => {
    expect(
      mapProtocolEvent({
        protocol: 'acp',
        traceId: 'trace-tool-result',
        payload: {
          type: 'tool_result',
          toolName: 'read_file',
          output: 'README',
        },
      })
    ).toMatchObject({
      type: 'tool',
      traceId: 'trace-tool-result',
      nextState: 'RUNNING',
      data: {
        protocol: 'acp',
        payload: {
          type: 'tool_result',
          toolName: 'read_file',
          output: 'README',
        },
      },
    });
  });

  it('maps acp agent message chunks to delta events with running state', () => {
    expect(
      mapProtocolEvent({
        protocol: 'acp',
        traceId: 'trace-chunk',
        payload: {
          type: 'agent_message_chunk',
          content: 'hello',
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

  it('maps complete payloads without transitioning the gateway session state', () => {
    expect(
      mapProtocolEvent({
        protocol: 'acp',
        traceId: 'trace-complete',
        payload: {
          type: 'complete',
          reason: 'prompt-finished',
        },
      })
    ).toMatchObject({
      type: 'complete',
      traceId: 'trace-complete',
      data: {
        protocol: 'acp',
        payload: {
          type: 'complete',
          reason: 'prompt-finished',
        },
      },
    });
  });
});
