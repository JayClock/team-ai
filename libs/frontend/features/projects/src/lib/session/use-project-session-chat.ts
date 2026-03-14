import { UIMessage, useChat } from '@ai-sdk/react';
import { State } from '@hateoas-ts/resource';
import {
  AcpEventEnvelope,
  AcpSession,
  type AcpErrorEventData,
  type AcpMessageEventData,
  type AcpSessionEventData,
} from '@shared/schema';
import { toast } from '@shared/ui';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export type SessionChatMessage = UIMessage<{
  chunkKey?: string;
  emittedAt: string;
  optimistic?: boolean;
  pending?: boolean;
}>;

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

function formatStatusLabel(status: string | null | undefined): string {
  switch (status) {
    case 'COMPLETED':
    case 'completed':
      return '已完成';
    case 'RUNNING':
    case 'running':
      return '进行中';
    case 'in_progress':
      return '处理中';
    case 'FAILED':
    case 'failed':
      return '失败';
    case 'CANCELLED':
    case 'cancelled':
      return '已取消';
    case 'connected':
      return '已连接';
    case 'connecting':
      return '连接中';
    case 'idle':
      return '空闲';
    case 'error':
    case 'error-stream':
      return '错误';
    default:
      return status?.trim() || '无';
  }
}

function summarizeSessionEvent(event: AcpEventEnvelope): string | null {
  switch (event.type) {
    case 'session': {
      const data = event.data as AcpSessionEventData;
      if (data.title) {
        return `会话标题已更新为 ${data.title}。`;
      }
      if (data.state) {
        return `会话状态已变更为${formatStatusLabel(data.state)}。`;
      }
      return null;
    }
    case 'complete':
      return null;
    case 'error': {
      const data = event.data as AcpErrorEventData;
      return data.message ?? event.error?.message ?? '执行过程中发生错误。';
    }
    default:
      return null;
  }
}

function buildChatMessages(history: AcpEventEnvelope[]): SessionChatMessage[] {
  const messages: SessionChatMessage[] = [];

  for (const event of history) {
    if (event.type === 'message') {
      const data = event.data as AcpMessageEventData;
      const content = asText(data.content);
      if (!content) {
        continue;
      }

      const role =
        data.role === 'user'
          ? 'user'
          : data.role === 'thought'
            ? 'assistant'
            : 'assistant';
      const previous = messages[messages.length - 1];
      const chunkKeyBase = data.role ?? data.kind ?? 'assistant';
      const partType = data.role === 'thought' ? 'reasoning' : 'text';
      const chunkKey = data.messageId
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

      messages.push({
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
      });
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
