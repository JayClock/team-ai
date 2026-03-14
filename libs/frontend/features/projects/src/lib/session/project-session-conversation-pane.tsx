import { State } from '@hateoas-ts/resource';
import { AcpSession } from '@shared/schema';
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
  Message,
  MessageContent,
  MessageResponse,
  Spinner,
} from '@shared/ui';
import { BotIcon, SparklesIcon } from 'lucide-react';
import {
  formatDateTime,
  formatStatusLabel,
} from './project-session-workbench.shared';
import { SessionChatMessage } from './use-project-session-chat';
import {
  ProjectComposerInput,
  type ProjectProviderPickerProps,
  type ProjectRepositoryPickerProps,
} from '../components/project-composer-input';

export function ProjectSessionConversationPane(props: {
  chatMessages: SessionChatMessage[];
  hasPendingAssistantMessage: boolean;
  onSubmit: (input: {
    cwd?: string;
    files: unknown[];
    provider?: string;
    text: string;
  }) => Promise<void>;
  providerPicker?: ProjectProviderPickerProps;
  projectPicker?: ProjectRepositoryPickerProps;
  selectedSession: State<AcpSession> | null;
}) {
  const {
    chatMessages,
    hasPendingAssistantMessage,
    onSubmit,
    providerPicker,
    projectPicker,
    selectedSession,
  } = props;

  const promptInputProps = {
    ariaLabel: '会话输入框',
    disabled: hasPendingAssistantMessage,
    footerStart: (
      <div className="text-xs text-muted-foreground">
        {selectedSession
          ? formatStatusLabel(selectedSession.data.acpStatus)
          : '发送后将创建新会话'}
      </div>
    ),
    onSubmit,
    placeholder: selectedSession
      ? '继续当前会话...'
      : '发送第一条消息，开始新的会话...',
    projectPicker,
    providerPicker,
    submitPending: hasPendingAssistantMessage,
  };

  return (
    <section className="flex min-h-0 flex-1 flex-col bg-muted/10">
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        <Conversation className="min-h-0 flex-1" resize="instant">
          <ConversationContent className="mx-auto flex w-full max-w-3xl gap-4 px-4 py-6 md:px-5">
            {chatMessages.length === 0 ? (
              <ConversationEmptyState
                icon={<BotIcon className="size-10 text-muted-foreground/60" />}
                title="发送第一条消息"
                description="选择已有会话，或者直接输入内容开始新的对话。"
              />
            ) : (
              <>
                {chatMessages.map((message) => {
                  const isSystem = message.role === 'system';
                  const isThought = message.parts.every(
                    (part) => part.type === 'reasoning',
                  );
                  const hasReasoning = message.parts.some(
                    (part) => part.type === 'reasoning',
                  );
                  const isPending = message.metadata?.pending === true;

                  return (
                    <Message
                      key={message.id}
                      from={message.role === 'user' ? 'user' : 'assistant'}
                      className={
                        isSystem
                          ? 'mx-auto max-w-2xl'
                          : isThought
                            ? 'opacity-85'
                            : undefined
                      }
                    >
                      <MessageContent
                        className={
                          isSystem
                            ? 'mx-auto rounded-full border bg-muted/50 px-3 py-2 text-xs text-muted-foreground'
                            : isThought
                              ? 'rounded-2xl border border-dashed border-border/70 bg-muted/40 px-4 py-3'
                              : undefined
                        }
                      >
                        {isThought ? (
                          <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                            <SparklesIcon className="size-3.5" />
                            <span>助手推理</span>
                          </div>
                        ) : null}
                        {message.parts.map((part, index) => {
                          if (part.type === 'reasoning') {
                            return (
                              <div
                                key={`${message.id}-${index}`}
                                className={
                                  hasReasoning && !isThought
                                    ? 'mb-3 rounded-2xl border border-dashed border-border/70 bg-muted/40 px-4 py-3'
                                    : undefined
                                }
                              >
                                {!isThought ? (
                                  <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                                    <SparklesIcon className="size-3.5" />
                                    <span>助手推理</span>
                                  </div>
                                ) : null}
                                <MessageResponse>{part.text}</MessageResponse>
                              </div>
                            );
                          }

                          if (part.type === 'text') {
                            if (isPending) {
                              return (
                                <div
                                  key={`${message.id}-${index}`}
                                  className="flex items-center gap-2 text-sm text-muted-foreground"
                                >
                                  <Spinner className="size-4" />
                                  正在等待响应...
                                </div>
                              );
                            }
                            return (
                              <MessageResponse key={`${message.id}-${index}`}>
                                {part.text}
                              </MessageResponse>
                            );
                          }

                          return null;
                        })}
                        <div className="mt-2 text-[11px] text-muted-foreground">
                          {formatDateTime(message.metadata?.emittedAt ?? null)}
                        </div>
                      </MessageContent>
                    </Message>
                  );
                })}
              </>
            )}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>

        <div className="shrink-0 border-t border-border/60 bg-background/95">
          <div className="mx-auto w-full max-w-3xl px-4 py-3 md:px-5">
            <ProjectComposerInput {...promptInputProps} />
          </div>
        </div>
      </div>
    </section>
  );
}
