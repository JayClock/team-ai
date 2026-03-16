import type { Database } from 'better-sqlite3';
import type {
  AcpEventEnvelopePayload,
  AcpEventToolCallPayload,
  AcpSessionPayload,
} from '../schemas/acp';
import { getAcpSessionById, listAcpSessionHistory } from './acp-service';

export interface ReadAgentConversationInput {
  includeTerminalOutput?: boolean;
  includeThoughts?: boolean;
  lastN?: number;
  limit?: number;
  projectId: string;
  sessionId: string;
  sinceEventId?: string;
}

export interface ReadAgentConversationResult {
  latest: {
    assistantMessage: string | null;
    turnState: string | null;
  };
  projection: {
    messages: Array<{
      content: string | null;
      emittedAt: string;
      eventId: string;
      role: 'assistant' | 'thought' | 'user';
    }>;
    planUpdates: Array<{
      emittedAt: string;
      eventId: string;
      items: Array<{
        description: string;
        priority?: 'high' | 'low' | 'medium';
        status?: 'completed' | 'in_progress' | 'pending';
      }>;
    }>;
    terminalCommands: Array<{
      command: string | null;
      data: string | null;
      emittedAt: string;
      eventId: string;
      exitCode: number | null;
    }>;
    toolCalls: Array<{
      emittedAt: string;
      eventId: string;
      input: unknown;
      output: unknown;
      status: AcpEventToolCallPayload['status'];
      title: string | null;
      toolCallId: string | null;
    }>;
  };
  session: Pick<
    AcpSessionPayload,
    | 'completedAt'
    | 'cwd'
    | 'id'
    | 'lastActivityAt'
    | 'name'
    | 'parentSession'
    | 'project'
    | 'provider'
    | 'specialistId'
    | 'startedAt'
  >;
  totals: {
    eventCount: number;
    messageCount: number;
    planUpdateCount: number;
    terminalCommandCount: number;
    toolCallCount: number;
  };
}

function sliceTail<T>(items: T[], lastN: number | undefined) {
  if (!lastN || lastN <= 0 || items.length <= lastN) {
    return items;
  }

  return items.slice(-lastN);
}

function getAssistantMessage(
  history: AcpEventEnvelopePayload[],
  includeThoughts: boolean,
) {
  for (const event of [...history].reverse()) {
    const message = event.update.message;
    if (!message?.content) {
      continue;
    }
    if (!includeThoughts && message.role === 'thought') {
      continue;
    }
    if (message.role === 'assistant') {
      return message.content;
    }
  }

  return null;
}

function getTurnState(history: AcpEventEnvelopePayload[]) {
  for (const event of [...history].reverse()) {
    const state = event.update.turnComplete?.state;
    if (state) {
      return state;
    }
  }

  return null;
}

export async function readAgentConversation(
  sqlite: Database,
  input: ReadAgentConversationInput,
): Promise<ReadAgentConversationResult> {
  const session = await getAcpSessionById(sqlite, input.sessionId);
  const history = await listAcpSessionHistory(
    sqlite,
    input.projectId,
    input.sessionId,
    input.limit ?? 500,
    input.sinceEventId,
  );
  const messages = history
    .filter((event) => {
      const role = event.update.message?.role;
      if (!role) {
        return false;
      }
      return input.includeThoughts ? true : role !== 'thought';
    })
    .map((event) => ({
      content: event.update.message?.content ?? null,
      emittedAt: event.emittedAt,
      eventId: event.eventId,
      role: event.update.message?.role ?? 'assistant',
    }));
  const toolCalls = history
    .filter((event) => event.update.toolCall)
    .map((event) => ({
      emittedAt: event.emittedAt,
      eventId: event.eventId,
      input: event.update.toolCall?.input,
      output: event.update.toolCall?.output,
      status: event.update.toolCall?.status ?? 'pending',
      title: event.update.toolCall?.title ?? null,
      toolCallId: event.update.toolCall?.toolCallId ?? null,
    }));
  const terminalCommands = history
    .filter((event) => event.update.terminal?.command || input.includeTerminalOutput)
    .map((event) => ({
      command: event.update.terminal?.command ?? null,
      data: input.includeTerminalOutput
        ? (event.update.terminal?.data ?? null)
        : null,
      emittedAt: event.emittedAt,
      eventId: event.eventId,
      exitCode: event.update.terminal?.exitCode ?? null,
    }))
    .filter((event) => event.command || event.data);
  const planUpdates = history
    .filter((event) => (event.update.planItems?.length ?? 0) > 0)
    .map((event) => ({
      emittedAt: event.emittedAt,
      eventId: event.eventId,
      items: event.update.planItems ?? [],
    }));

  const projectedMessages = sliceTail(messages, input.lastN);
  const projectedToolCalls = sliceTail(toolCalls, input.lastN);
  const projectedTerminalCommands = sliceTail(terminalCommands, input.lastN);
  const projectedPlanUpdates = sliceTail(planUpdates, input.lastN);

  return {
    latest: {
      assistantMessage: getAssistantMessage(history, input.includeThoughts ?? false),
      turnState: getTurnState(history),
    },
    projection: {
      messages: projectedMessages,
      planUpdates: projectedPlanUpdates,
      terminalCommands: projectedTerminalCommands,
      toolCalls: projectedToolCalls,
    },
    session: {
      completedAt: session.completedAt,
      cwd: session.cwd,
      id: session.id,
      lastActivityAt: session.lastActivityAt,
      name: session.name,
      parentSession: session.parentSession,
      project: session.project,
      provider: session.provider,
      specialistId: session.specialistId,
      startedAt: session.startedAt,
    },
    totals: {
      eventCount: history.length,
      messageCount: messages.length,
      planUpdateCount: planUpdates.length,
      terminalCommandCount: terminalCommands.length,
      toolCallCount: toolCalls.length,
    },
  };
}
