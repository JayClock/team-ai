import { useChat } from '@ai-sdk/react';
import { State } from '@hateoas-ts/resource';
import {
  AcpEventEnvelope,
  AcpSession,
} from '@shared/schema';
import { toast } from '@shared/ui';
import type { DynamicToolUIPart, UIMessage } from 'ai';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type SessionTerminalData = {
  args?: string[];
  command?: string | null;
  exitCode?: number | null;
  output: string;
  status: 'completed' | 'failed' | 'running';
  terminalId: string;
};

export type SessionChatMessage = UIMessage<{
  chunkKey?: string;
  emittedAt: string;
  optimistic?: boolean;
  pending?: boolean;
}, {
  terminal: SessionTerminalData;
}>;

type SessionTerminalPart = Extract<
  SessionChatMessage['parts'][number],
  { type: 'data-terminal' }
>;

type PromptSubmitInput = {
  cwd?: string;
  files: unknown[];
  provider?: string;
  text: string;
};

type UseProjectSessionChatOptions = {
  createSession: (input?: {
    cwd?: string;
    provider?: string;
  }) => Promise<State<AcpSession>>;
  history: AcpEventEnvelope[];
  onPendingPromptConsumed?: () => void;
  pendingPrompt?: string | null;
  refreshSessions: () => Promise<void>;
  selectedSession?: State<AcpSession>;
  submitPrompt: (input: { prompt: string; sessionId: string }) => Promise<void>;
};

function asText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function summarizeSessionEvent(event: AcpEventEnvelope): string | null {
  switch (event.update.eventType) {
    case 'session_info_update': {
      const title = event.update.sessionInfo?.title;
      if (title) {
        return `会话标题已更新为 ${title}。`;
      }
      return null;
    }
    case 'turn_complete':
      return null;
    case 'error':
      return (
        event.update.error?.message ??
        event.error?.message ??
        '执行过程中发生错误。'
      );
    default:
      return null;
  }
}

function resolveToolName(event: AcpEventEnvelope): string {
  const kind = asText(event.update.toolCall?.kind);
  if (kind) {
    return kind;
  }

  const title = asText(event.update.toolCall?.title);
  if (title) {
    return title;
  }

  return 'tool';
}

function resolveToolInput(event: AcpEventEnvelope): unknown {
  const toolCall = event.update.toolCall;
  if (!toolCall) {
    return null;
  }

  if (toolCall.input !== undefined) {
    return toolCall.input;
  }

  if (toolCall.content.length > 0) {
    return toolCall.content;
  }

  return null;
}

function resolveToolOutput(event: AcpEventEnvelope): unknown {
  const toolCall = event.update.toolCall;
  if (!toolCall) {
    return null;
  }

  if (toolCall.output !== undefined) {
    return toolCall.output;
  }

  if (toolCall.content.length > 0) {
    return toolCall.content;
  }

  return null;
}

function resolveToolErrorText(event: AcpEventEnvelope): string {
  const output = resolveToolOutput(event);

  if (typeof output === 'string' && output.trim()) {
    return output.trim();
  }

  if (output && typeof output === 'object') {
    return JSON.stringify(output, null, 2);
  }

  const title = asText(event.update.toolCall?.title);
  if (title) {
    return `${title} failed`;
  }

  return 'Tool execution failed';
}

function buildToolPart(event: AcpEventEnvelope): DynamicToolUIPart | null {
  if (
    event.update.eventType !== 'tool_call' &&
    event.update.eventType !== 'tool_call_update'
  ) {
    return null;
  }

  const toolCall = event.update.toolCall;
  if (!toolCall) {
    return null;
  }

  const toolCallId = asText(toolCall.toolCallId) ?? event.eventId;
  const toolName = resolveToolName(event);
  const title = asText(toolCall.title) ?? undefined;

  switch (toolCall.status) {
    case 'completed':
      return {
        type: 'dynamic-tool',
        toolCallId,
        toolName,
        title,
        providerExecuted: true,
        state: 'output-available',
        input: resolveToolInput(event),
        output: resolveToolOutput(event),
      };
    case 'failed':
      return {
        type: 'dynamic-tool',
        toolCallId,
        toolName,
        title,
        providerExecuted: true,
        state: 'output-error',
        input: resolveToolInput(event),
        errorText: resolveToolErrorText(event),
      };
    case 'pending':
      return {
        type: 'dynamic-tool',
        toolCallId,
        toolName,
        title,
        providerExecuted: true,
        state: 'input-streaming',
        input: resolveToolInput(event),
      };
    case 'running':
    default:
      return {
        type: 'dynamic-tool',
        toolCallId,
        toolName,
        title,
        providerExecuted: true,
        state: 'input-available',
        input: resolveToolInput(event),
      };
  }
}

function buildTerminalPart(
  event: AcpEventEnvelope,
  previous?: SessionTerminalData,
) {
  if (
    event.update.eventType !== 'terminal_created' &&
    event.update.eventType !== 'terminal_output' &&
    event.update.eventType !== 'terminal_exited'
  ) {
    return null;
  }

  const terminal = event.update.terminal;
  const terminalId = asText(terminal?.terminalId);
  if (!terminalId) {
    return null;
  }

  const nextData: SessionTerminalData = {
    terminalId,
    command: terminal?.command ?? previous?.command ?? null,
    args: terminal?.args ?? previous?.args,
    output: previous?.output ?? '',
    status: previous?.status ?? 'running',
    exitCode: previous?.exitCode,
  };

  if (event.update.eventType === 'terminal_output') {
    nextData.output = `${nextData.output}${terminal?.data ?? ''}`;
  }

  if (event.update.eventType === 'terminal_exited') {
    nextData.exitCode = terminal?.exitCode ?? null;
    nextData.status =
      (terminal?.exitCode ?? 0) === 0 ? 'completed' : 'failed';
  }

  return {
    type: 'data-terminal' as const,
    id: terminalId,
    data: nextData,
  };
}

function buildChatMessages(history: AcpEventEnvelope[]): SessionChatMessage[] {
  const messages: SessionChatMessage[] = [];
  const messagesByChunkKey = new Map<string, SessionChatMessage>();

  for (const event of history) {
    if (
      event.update.eventType === 'agent_message' ||
      event.update.eventType === 'agent_thought' ||
      event.update.eventType === 'user_message'
    ) {
      const data = event.update.message;
      const content = asText(data?.content);
      if (!content) {
        continue;
      }

      const role =
        data?.role === 'user'
          ? 'user'
          : data?.role === 'thought'
            ? 'assistant'
            : 'assistant';
      const previous = messages[messages.length - 1];
      const chunkKeyBase = data?.role ?? event.update.eventType;
      const partType = data?.role === 'thought' ? 'reasoning' : 'text';
      const chunkKey = data?.messageId
        ? `${role}:${data.messageId}`
        : previous &&
            previous.role === role &&
            previous.metadata?.chunkKey?.startsWith(`${role}:${chunkKeyBase}:`)
          ? previous.metadata.chunkKey
          : `${role}:${chunkKeyBase}:${event.eventId}`;

      if (previous && previous.metadata?.chunkKey === chunkKey) {
        const lastPart = previous.parts.at(-1);
        if (
          (lastPart?.type === 'text' || lastPart?.type === 'reasoning') &&
          lastPart.type === partType
        ) {
          lastPart.text += content;
        } else {
          previous.parts.push(
            partType === 'reasoning'
              ? {
                  type: 'reasoning',
                  text: content,
                }
              : {
                  type: 'text',
                  text: content,
                },
          );
        }
        previous.metadata = {
          ...previous.metadata,
          emittedAt: event.emittedAt,
        };
        continue;
      }

      const nextMessage: SessionChatMessage = {
        id: chunkKey,
        role,
        metadata: {
          chunkKey,
          emittedAt: event.emittedAt,
        },
        parts: [
          partType === 'reasoning'
            ? {
                type: 'reasoning',
                text: content,
              }
            : {
                type: 'text',
                text: content,
              },
        ],
      };
      messages.push(nextMessage);
      messagesByChunkKey.set(chunkKey, nextMessage);
      continue;
    }

    if (
      event.update.eventType === 'tool_call' ||
      event.update.eventType === 'tool_call_update'
    ) {
      const toolPart = buildToolPart(event);
      if (!toolPart) {
        continue;
      }

      const chunkKey = `assistant:tool:${toolPart.toolCallId}`;
      const existing = messagesByChunkKey.get(chunkKey);

      if (existing) {
        const partIndex = existing.parts.findIndex(
          (part) =>
            part.type === 'dynamic-tool' &&
            part.toolCallId === toolPart.toolCallId,
        );

        if (partIndex >= 0) {
          existing.parts[partIndex] = toolPart;
        } else {
          existing.parts.push(toolPart);
        }

        existing.metadata = {
          ...existing.metadata,
          emittedAt: event.emittedAt,
        };
        continue;
      }

      const nextMessage: SessionChatMessage = {
        id: chunkKey,
        role: 'assistant',
        metadata: {
          chunkKey,
          emittedAt: event.emittedAt,
        },
        parts: [toolPart],
      };
      messages.push(nextMessage);
      messagesByChunkKey.set(chunkKey, nextMessage);
      continue;
    }

    if (
      event.update.eventType === 'terminal_created' ||
      event.update.eventType === 'terminal_output' ||
      event.update.eventType === 'terminal_exited'
    ) {
      const terminalId = asText(event.update.terminal?.terminalId);
      if (!terminalId) {
        continue;
      }

      const chunkKey = `assistant:terminal:${terminalId}`;
      const existing = messagesByChunkKey.get(chunkKey);
      const previousPart = existing?.parts.find(
        (part): part is SessionTerminalPart => part.type === 'data-terminal',
      );
      const terminalPart = buildTerminalPart(event, previousPart?.data);

      if (!terminalPart) {
        continue;
      }

      if (existing) {
        const partIndex = existing.parts.findIndex(
          (part) => part.type === 'data-terminal' && part.id === terminalId,
        );

        if (partIndex >= 0) {
          existing.parts[partIndex] = terminalPart;
        } else {
          existing.parts.push(terminalPart);
        }

        existing.metadata = {
          ...existing.metadata,
          emittedAt: event.emittedAt,
        };
        continue;
      }

      const nextMessage: SessionChatMessage = {
        id: chunkKey,
        role: 'assistant',
        metadata: {
          chunkKey,
          emittedAt: event.emittedAt,
        },
        parts: [terminalPart],
      };
      messages.push(nextMessage);
      messagesByChunkKey.set(chunkKey, nextMessage);
      continue;
    }

    const summary = summarizeSessionEvent(event);
    if (!summary) {
      continue;
    }

    messages.push({
      id: event.eventId,
      role: 'system',
      metadata: {
        emittedAt: event.emittedAt,
      },
      parts: [
        {
          type: 'text',
          text: summary,
        },
      ],
    });
  }

  return messages;
}

export function useProjectSessionChat(options: UseProjectSessionChatOptions) {
  const {
    history,
    selectedSession,
    pendingPrompt,
    onPendingPromptConsumed,
    createSession,
    submitPrompt,
    refreshSessions,
  } = options;
  const [transientMessages, setTransientMessages] = useState<
    Array<{ message: SessionChatMessage; sessionId: string }>
  >([]);
  const [transientSessionKey, setTransientSessionKey] = useState<string | null>(
    null,
  );
  const selectedSessionId = selectedSession?.data.id;
  const optimisticMessageCounterRef = useRef(0);
  const pendingPromptKeyRef = useRef<string | null>(null);
  const promptRequestInFlightRef = useRef(false);
  const activeChatSessionKey = selectedSessionId ?? transientSessionKey;
  const { messages: chatMessages, setMessages: setChatMessages } =
    useChat<SessionChatMessage>({
      id: activeChatSessionKey
        ? `project-session:${activeChatSessionKey}`
        : 'project-session:empty',
    });

  useEffect(() => {
    const serverMessages = buildChatMessages(history);
    const visibleTransientMessages = transientMessages
      .filter((entry) => entry.sessionId === activeChatSessionKey)
      .map((entry) => entry.message);
    setChatMessages([...serverMessages, ...visibleTransientMessages]);
  }, [activeChatSessionKey, history, setChatMessages, transientMessages]);

  useEffect(() => {
    if (!transientSessionKey) {
      return;
    }
    const hasEntries = transientMessages.some(
      (entry) => entry.sessionId === transientSessionKey,
    );
    if (!hasEntries) {
      setTransientSessionKey(null);
    }
  }, [transientMessages, transientSessionKey]);

  const appendOptimisticUserMessage = useCallback(
    (sessionId: string, text: string) => {
      const optimisticId = `optimistic-user-${sessionId}-${optimisticMessageCounterRef.current++}`;
      const message: SessionChatMessage = {
        id: optimisticId,
        role: 'user',
        metadata: {
          emittedAt: new Date().toISOString(),
          optimistic: true,
        },
        parts: [
          {
            type: 'text',
            text,
          },
        ],
      };
      setTransientMessages((current) => [...current, { message, sessionId }]);
      return optimisticId;
    },
    [],
  );

  const appendPendingAssistantMessage = useCallback((sessionId: string) => {
    const pendingId = `pending-assistant-${sessionId}-${optimisticMessageCounterRef.current++}`;
    const message: SessionChatMessage = {
      id: pendingId,
      role: 'assistant',
      metadata: {
        emittedAt: new Date().toISOString(),
        pending: true,
      },
      parts: [
        {
          type: 'text',
          text: '',
        },
      ],
    };
    setTransientMessages((current) => [...current, { message, sessionId }]);
    return pendingId;
  }, []);

  const removeTransientMessage = useCallback((messageId: string) => {
    setTransientMessages((current) =>
      current.filter((entry) => entry.message.id !== messageId),
    );
  }, []);

  const rebindTransientMessages = useCallback(
    (fromSessionId: string, toSessionId: string) => {
      if (fromSessionId === toSessionId) {
        return;
      }
      setTransientMessages((current) =>
        current.map((entry) =>
          entry.sessionId === fromSessionId
            ? { ...entry, sessionId: toSessionId }
            : entry,
        ),
      );
      setTransientSessionKey((current) =>
        current === fromSessionId ? toSessionId : current,
      );
    },
    [],
  );

  const removeTransientPair = useCallback(
    (optimisticId: string | null, pendingAssistantId: string | null) => {
      if (optimisticId) {
        removeTransientMessage(optimisticId);
      }
      if (pendingAssistantId) {
        removeTransientMessage(pendingAssistantId);
      }
    },
    [removeTransientMessage],
  );

  const runPrompt = useCallback(
    async (text: string, provider?: string, cwd?: string) => {
      const trimmed = text.trim();
      if (!trimmed) {
        toast.error('输入内容不能为空');
        return;
      }
      if (promptRequestInFlightRef.current) {
        return;
      }

      promptRequestInFlightRef.current = true;
      let optimisticId: string | null = null;
      let pendingAssistantId: string | null = null;
      let targetSessionKey = selectedSession?.data.id ?? null;

      try {
        if (!targetSessionKey) {
          targetSessionKey = `draft-session-${optimisticMessageCounterRef.current++}`;
          setTransientSessionKey(targetSessionKey);
        }

        optimisticId = appendOptimisticUserMessage(targetSessionKey, trimmed);
        pendingAssistantId = appendPendingAssistantMessage(targetSessionKey);

        const targetSession =
          selectedSession ?? (await createSession({ cwd, provider }));
        rebindTransientMessages(targetSessionKey, targetSession.data.id);
        targetSessionKey = targetSession.data.id;

        await submitPrompt({
          sessionId: targetSessionKey,
          prompt: trimmed,
        });
        await refreshSessions();
        removeTransientPair(optimisticId, pendingAssistantId);
      } catch (error) {
        removeTransientPair(optimisticId, pendingAssistantId);
        const message = error instanceof Error ? error.message : '发送消息失败';
        toast.error(message);
      } finally {
        promptRequestInFlightRef.current = false;
      }
    },
    [
      appendOptimisticUserMessage,
      appendPendingAssistantMessage,
      createSession,
      refreshSessions,
      rebindTransientMessages,
      removeTransientPair,
      selectedSession,
      submitPrompt,
    ],
  );

  const handlePromptSubmit = useCallback(
    async ({ cwd, provider, text }: PromptSubmitInput) => {
      await runPrompt(text, provider, cwd);
    },
    [runPrompt],
  );

  useEffect(() => {
    const text = pendingPrompt?.trim();
    if (!text || !selectedSession) {
      return;
    }
    const promptKey = `${selectedSession.data.id}:${text}`;
    if (
      pendingPromptKeyRef.current === promptKey ||
      promptRequestInFlightRef.current
    ) {
      return;
    }
    pendingPromptKeyRef.current = promptKey;
    onPendingPromptConsumed?.();
    void runPrompt(text);
  }, [onPendingPromptConsumed, pendingPrompt, runPrompt, selectedSession]);

  const hasPendingAssistantMessage = useMemo(
    () =>
      transientMessages.some(
        (entry) =>
          entry.sessionId === activeChatSessionKey &&
          entry.message.metadata?.pending === true,
      ),
    [activeChatSessionKey, transientMessages],
  );

  return {
    chatMessages,
    handlePromptSubmit,
    hasPendingAssistantMessage,
  };
}
