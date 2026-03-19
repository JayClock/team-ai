import { State } from '@hateoas-ts/resource';
import { AcpSession } from '@shared/schema';
import { toast } from '@shared/ui';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type PromptSubmitInput = {
  cwd?: string;
  files: unknown[];
  model?: string | null;
  provider?: string;
  text: string;
};

type UseProjectSessionChatOptions = {
  createSession: (input?: {
    cwd?: string;
    model?: string | null;
    provider?: string;
  }) => Promise<State<AcpSession>>;
  onPendingPromptConsumed?: () => void;
  pendingPrompt?: string | null;
  refreshSessions: () => Promise<void>;
  selectedSession?: State<AcpSession>;
  submitPrompt: (input: { prompt: string; sessionId: string }) => Promise<void>;
};

export function useProjectSessionChat(options: UseProjectSessionChatOptions) {
  const {
    selectedSession,
    pendingPrompt,
    onPendingPromptConsumed,
    createSession,
    submitPrompt,
    refreshSessions,
  } = options;
  const [submitPending, setSubmitPending] = useState(false);
  const pendingPromptKeyRef = useRef<string | null>(null);
  const promptRequestInFlightRef = useRef(false);

  const runPrompt = useCallback(
    async (
      text: string,
      provider?: string,
      cwd?: string,
      model?: string | null,
    ) => {
      const trimmed = text.trim();
      if (!trimmed) {
        toast.error('输入内容不能为空');
        return;
      }
      if (promptRequestInFlightRef.current) {
        return;
      }

      promptRequestInFlightRef.current = true;
      setSubmitPending(true);

      try {
        const targetSession =
          selectedSession ?? (await createSession({ cwd, model, provider }));

        await submitPrompt({
          sessionId: targetSession.data.id,
          prompt: trimmed,
        });
        await refreshSessions();
      } catch (error) {
        const message = error instanceof Error ? error.message : '发送消息失败';
        toast.error(message);
      } finally {
        promptRequestInFlightRef.current = false;
        setSubmitPending(false);
      }
    },
    [createSession, refreshSessions, selectedSession, submitPrompt],
  );

  const handlePromptSubmit = useCallback(
    async ({ cwd, model, provider, text }: PromptSubmitInput) => {
      await runPrompt(text, provider, cwd, model);
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
    () => submitPending || selectedSession?.data.acpStatus === 'connecting',
    [selectedSession?.data.acpStatus, submitPending],
  );

  return {
    handlePromptSubmit,
    hasPendingAssistantMessage,
  };
}
