import type { Database } from 'better-sqlite3';
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { AcpEventUpdatePayload } from '@orchestration/runtime-acp';
import { getDrizzleDb } from '../db/drizzle';
import {
  projectAcpSessionEventsTable,
  projectAgentsTable,
} from '../db/schema';
import { getSessionRow, type AcpSessionRow } from './acp-session-store';

interface SessionHistorySummaryRow {
  error_json: string | null;
  payload_json: string;
  type: AcpEventUpdatePayload['eventType'];
}

const REPLAY_HISTORY_CHAR_LIMIT = 24_000;

export function getSessionAgentPrompt(
  sqlite: Database,
  session: Pick<AcpSessionRow, 'agent_id' | 'project_id'>,
): string | null {
  if (!session.agent_id) {
    return null;
  }

  const row = getDrizzleDb(sqlite)
    .select({
      system_prompt: projectAgentsTable.systemPrompt,
    })
    .from(projectAgentsTable)
    .where(
      and(
        eq(projectAgentsTable.id, session.agent_id),
        eq(projectAgentsTable.projectId, session.project_id),
        isNull(projectAgentsTable.deletedAt),
      ),
    )
    .get() as
    | { system_prompt: string | null }
    | undefined;

  return row?.system_prompt?.trim() || null;
}

export function extractEventText(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function parseEventRecord(
  value: string | null,
): Record<string, unknown> {
  if (!value) {
    return {};
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === 'object'
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export function sessionHasPromptHistory(
  sqlite: Database,
  sessionId: string,
): boolean {
  const row = getDrizzleDb(sqlite)
    .select({
      count: sql<number>`count(*)`,
    })
    .from(projectAcpSessionEventsTable)
    .where(
      and(
        eq(projectAcpSessionEventsTable.sessionId, sessionId),
        inArray(projectAcpSessionEventsTable.type, [
          'user_message',
          'agent_message',
          'agent_thought',
        ]),
      ),
    )
    .get() as { count: number };

  return row.count > 0;
}

export function trimReplayTranscriptSegments(
  segments: string[],
  maxChars: number,
): string {
  if (segments.length === 0) {
    return '';
  }

  const kept: string[] = [];
  let total = 0;

  for (const segment of [...segments].reverse()) {
    const additional = segment.length + (kept.length > 0 ? 2 : 0);
    if (kept.length > 0 && total + additional > maxChars) {
      break;
    }

    if (kept.length === 0 && segment.length > maxChars) {
      kept.unshift(segment.slice(segment.length - maxChars));
      total = maxChars;
      break;
    }

    kept.unshift(segment);
    total += additional;
  }

  const omitted = segments.length - kept.length;
  return omitted > 0
    ? [
        `System note:\n${omitted} earlier transcript entries were omitted to fit the replay window.`,
        ...kept,
      ].join('\n\n')
    : kept.join('\n\n');
}

export function buildAcpSessionReplayPrompt(
  sqlite: Database,
  sessionId: string,
  nextConfig: {
    model: string | null;
    provider: string;
  },
): string | null {
  const session = getSessionRow(sqlite, sessionId);
  const systemPrompt = getSessionAgentPrompt(sqlite, session);
  const rows = getDrizzleDb(sqlite)
    .select({
      error_json: projectAcpSessionEventsTable.errorJson,
      payload_json: projectAcpSessionEventsTable.payloadJson,
      type: projectAcpSessionEventsTable.type,
    })
    .from(projectAcpSessionEventsTable)
    .where(eq(projectAcpSessionEventsTable.sessionId, sessionId))
    .orderBy(asc(projectAcpSessionEventsTable.sequence))
    .all() as SessionHistorySummaryRow[];

  const segments: string[] = [];
  let pendingAssistant: {
    content: string;
    messageId: string | null;
  } | null = null;

  const flushAssistant = () => {
    if (!pendingAssistant) {
      return;
    }

    const content = pendingAssistant.content.trim();
    if (content) {
      segments.push(`Assistant:\n${content}`);
    }
    pendingAssistant = null;
  };

  for (const row of rows) {
    const payload = parseEventRecord(
      row.payload_json,
    ) as unknown as AcpEventUpdatePayload;
    const error = parseEventRecord(row.error_json);

    if (row.type === 'user_message' && payload.message?.role === 'user') {
      flushAssistant();
      const content = extractEventText(payload.message.content);
      if (content) {
        segments.push(`User:\n${content}`);
      }
      continue;
    }

    if (row.type === 'agent_message' && payload.message?.role === 'assistant') {
      const content = extractEventText(payload.message.content);
      if (!content) {
        continue;
      }

      const messageId = extractEventText(payload.message.messageId);
      if (pendingAssistant && pendingAssistant.messageId === messageId) {
        pendingAssistant.content += content;
      } else {
        flushAssistant();
        pendingAssistant = {
          content,
          messageId,
        };
      }
      continue;
    }

    flushAssistant();

    if (
      (row.type === 'tool_call' || row.type === 'tool_call_update') &&
      payload.toolCall?.status === 'completed'
    ) {
      const output = extractEventText(payload.toolCall.output);
      if (output) {
        segments.push(`Tool result:\n${output}`);
      }
      continue;
    }

    if (row.type === 'error') {
      const message =
        extractEventText(payload.error?.message) ??
        extractEventText(error.message);
      if (message) {
        segments.push(`System note:\nPrevious runtime error: ${message}`);
      }
    }
  }

  flushAssistant();

  const transcript = trimReplayTranscriptSegments(
    segments,
    REPLAY_HISTORY_CHAR_LIMIT,
  );
  if (!transcript) {
    return null;
  }

  const metadata = [
    `- provider: ${nextConfig.provider}`,
    `- model: ${nextConfig.model ?? 'provider default'}`,
    `- cwd: ${session.cwd ?? ''}`,
    ...(session.task_id ? [`- taskId: ${session.task_id}`] : []),
  ].join('\n');

  return [
    ...(systemPrompt ? [`System:\n${systemPrompt.trim()}`] : []),
    'Replay context:\nYou are resuming an existing ACP conversation after the runtime was restarted because the provider or model changed.',
    `Session metadata:\n${metadata}`,
    `Conversation history:\n${transcript}`,
    'Instruction:\nTreat the conversation history above as authoritative prior context. Do not call tools, do not continue the task yet, and reply with exactly: ACK',
  ].join('\n\n');
}
