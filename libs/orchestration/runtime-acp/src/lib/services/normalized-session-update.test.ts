import { describe, expect, it } from 'vitest';
import type { SessionNotification } from '@agentclientprotocol/sdk';
import type { NormalizedSessionUpdate } from './normalized-session-update.js';
import {
  coerceNormalizedSessionUpdate,
  normalizeSessionNotification,
} from './normalized-session-update.js';
import {
  extractSessionMetadataFromNormalizedUpdate,
  resolveSessionStateFromNormalizedUpdate,
} from './session-update-state.js';

describe('normalized-session-update', () => {
  it('normalizes agent message chunks to canonical agent_message updates', () => {
    const notification = {
      update: {
        sessionUpdate: 'agent_message_chunk',
        messageId: 'msg-1',
        content: {
          type: 'text',
          text: 'hello world',
        },
      },
    } satisfies SessionNotification;

    const normalized = normalizeSessionNotification(
      'session-1',
      'codex',
      notification,
      '2026-03-14T00:00:00.000Z',
      'trace-1',
    );

    expect(normalized).toMatchObject({
      sessionId: 'session-1',
      provider: 'codex',
      eventType: 'agent_message',
      timestamp: '2026-03-14T00:00:00.000Z',
      traceId: 'trace-1',
      message: {
        role: 'assistant',
        messageId: 'msg-1',
        content: 'hello world',
        isChunk: true,
      },
    });
    expect(
      resolveSessionStateFromNormalizedUpdate(normalized!, 'PENDING'),
    ).toBe('RUNNING');
  });

  it('normalizes non-chunk ACP messages without forcing chunk semantics', () => {
    const notification = {
      update: {
        sessionUpdate: 'agent_message',
        messageId: 'msg-2',
        content: {
          type: 'text',
          text: 'complete message',
        },
      },
    } satisfies SessionNotification;

    const normalized = normalizeSessionNotification(
      'session-1b',
      'opencode',
      notification,
    );

    expect(normalized).toMatchObject({
      eventType: 'agent_message',
      message: {
        messageId: 'msg-2',
        content: 'complete message',
        isChunk: false,
      },
    });
  });

  it('normalizes tool call updates and persists completed calls as tool_call events', () => {
    const notification = {
      update: {
        sessionUpdate: 'tool_call_update',
        toolCallId: 'tool-1',
        kind: 'read_file',
        title: 'Read file',
        status: 'completed',
        rawInput: {
          path: 'README.md',
        },
        rawOutput: 'file contents',
        locations: [],
        content: [],
      },
    } satisfies SessionNotification;

    const normalized = normalizeSessionNotification(
      'session-2',
      'opencode',
      notification,
    );

    expect(normalized).toMatchObject({
      eventType: 'tool_call_update',
      toolCall: {
        toolCallId: 'tool-1',
        kind: 'read_file',
        status: 'completed',
        inputFinalized: true,
        input: {
          path: 'README.md',
        },
        output: 'file contents',
      },
    });
    expect(
      resolveSessionStateFromNormalizedUpdate(normalized!, 'RUNNING'),
    ).toBe('RUNNING');
  });

  it('keeps deferred tool input marked as unfinished on tool_call', () => {
    const notification = {
      update: {
        sessionUpdate: 'tool_call',
        toolCallId: 'tool-2',
        kind: 'grep_search',
        title: 'Search code',
        status: 'running',
        rawInput: {},
        rawOutput: null,
        locations: [],
        content: [],
      },
    } satisfies SessionNotification;

    const normalized = normalizeSessionNotification(
      'session-2b',
      'opencode',
      notification,
    );

    expect(normalized).toMatchObject({
      eventType: 'tool_call',
      toolCall: {
        toolCallId: 'tool-2',
        kind: 'grep_search',
        inputFinalized: false,
      },
    });
  });

  it('normalizes terminal lifecycle notifications', () => {
    const created = normalizeSessionNotification(
      'session-term',
      'codex',
      {
        update: {
          sessionUpdate: 'terminal_created',
          terminalId: 'term-1',
          command: 'npm',
          args: ['test'],
          interactive: false,
        },
      } satisfies SessionNotification,
    );
    const output = normalizeSessionNotification(
      'session-term',
      'codex',
      {
        update: {
          sessionUpdate: 'terminal_output',
          terminalId: 'term-1',
          data: 'running tests\n',
        },
      } satisfies SessionNotification,
    );
    const exited = normalizeSessionNotification(
      'session-term',
      'codex',
      {
        update: {
          sessionUpdate: 'terminal_exited',
          terminalId: 'term-1',
          exitCode: 0,
        },
      } satisfies SessionNotification,
    );

    expect(created).toMatchObject({
      eventType: 'terminal_created',
      terminal: {
        terminalId: 'term-1',
        command: 'npm',
        args: ['test'],
        interactive: false,
      },
    });
    expect(output).toMatchObject({
      eventType: 'terminal_output',
      terminal: {
        terminalId: 'term-1',
        data: 'running tests\n',
      },
    });
    expect(exited).toMatchObject({
      eventType: 'terminal_exited',
      terminal: {
        terminalId: 'term-1',
        exitCode: 0,
      },
    });
    expect(
      resolveSessionStateFromNormalizedUpdate(created!, 'PENDING'),
    ).toBe('RUNNING');
  });

  it('normalizes plan entries to description while preserving legacy persisted content', () => {
    const notification = {
      update: {
        sessionUpdate: 'plan',
        entries: [
          {
            content: 'Implement ACP normalization',
            priority: 'high',
            status: 'in_progress',
          },
        ],
      },
    } satisfies SessionNotification;

    const normalized = normalizeSessionNotification(
      'session-plan',
      'codex',
      notification,
    );

    expect(normalized).toMatchObject({
      eventType: 'plan_update',
      planItems: [
        {
          description: 'Implement ACP normalization',
          priority: 'high',
          status: 'in_progress',
        },
      ],
    });
  });

  it('extracts session metadata from canonical session_info updates', () => {
    const notification = {
      update: {
        sessionUpdate: 'session_info_update',
        title: 'Renamed Session',
        updatedAt: '2026-03-14T12:00:00.000Z',
      },
    } satisfies SessionNotification;

    const normalized = normalizeSessionNotification(
      'session-3',
      'codex',
      notification,
    );

    expect(extractSessionMetadataFromNormalizedUpdate(normalized!)).toEqual({
      title: 'Renamed Session',
      updatedAt: '2026-03-14T12:00:00.000Z',
    });
  });

  it('keeps the session running after turn_complete updates', () => {
    const normalized = {
      eventType: 'turn_complete',
      provider: 'codex',
      rawNotification: {
        update: {
          sessionUpdate: 'turn_complete',
          stopReason: 'end_turn',
        },
      } satisfies SessionNotification,
      sessionId: 'session-4',
      timestamp: '2026-03-14T12:00:00.000Z',
      turnComplete: {
        stopReason: 'end_turn',
        usage: null,
        userMessageId: null,
      },
    } as const;

    expect(
      resolveSessionStateFromNormalizedUpdate(normalized, 'RUNNING'),
    ).toBe('RUNNING');
  });

  it('normalizes protocol error updates to canonical error events', () => {
    const notification = {
      update: {
        sessionUpdate: 'error',
        code: 'PROTOCOL_ERROR',
        message: 'bad protocol',
      },
    } satisfies SessionNotification;

    const normalized = normalizeSessionNotification(
      'session-5',
      'codex',
      notification,
    );

    expect(normalized).toMatchObject({
      eventType: 'error',
      error: {
        code: 'PROTOCOL_ERROR',
        message: 'bad protocol',
      },
    });
  });

  it('passes through canonical normalized updates without rehydrating notifications', () => {
    const canonical = {
      eventType: 'agent_message',
      provider: 'codex',
      rawNotification: {
        sessionId: 'session-6',
        update: {
          sessionUpdate: 'agent_message_chunk',
          content: {
            type: 'text',
            text: 'direct canonical update',
          },
        },
      } satisfies SessionNotification,
      sessionId: 'session-6',
      timestamp: '2026-03-15T00:00:00.000Z',
      traceId: 'trace-6',
      message: {
        role: 'assistant' as const,
        content: 'direct canonical update',
        contentBlock: {
          type: 'text' as const,
          text: 'direct canonical update',
        },
        isChunk: true,
        messageId: 'msg-6',
      },
    } satisfies NormalizedSessionUpdate;

    expect(
      coerceNormalizedSessionUpdate('session-6', 'codex', canonical),
    ).toEqual(canonical);
  });
});
