import { State } from '@hateoas-ts/resource';
import { AcpSession } from '@shared/schema';
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
  Message,
  MessageContent,
} from '@shared/ui';
import { BotIcon } from 'lucide-react';
import { formatStatusLabel } from './project-session-workbench.shared';
import { SessionChatMessage } from './use-project-session-chat';
import {
  ProjectComposerInput,
  type ProjectProviderPickerProps,
  type ProjectRepositoryPickerProps,
} from '../components/project-composer-input';
import { ReasoningPart } from './conversation-part-reasoning';
import {
  isRenderableTerminalPart,
  TerminalPart,
} from './conversation-part-terminal';
import { isRenderableToolPart, ToolPart } from './conversation-part-tool';
import { TextPart } from './conversation-part-text';

export function ProjectSessionConversationPane(props: {
  chatMessages: SessionChatMessage[];
  hasPendingAssistantMessage: boolean;
  onSubmit: (input: {
    cwd?: string;
    files: unknown[];
    model?: string | null;
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
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>
          {selectedSession
            ? formatStatusLabel(selectedSession.data.acpStatus)
            : '发送后将创建新会话'}
        </span>
        {selectedSession?.data.codebase ? (
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px]">
            {selectedSession.data.codebase.id}
          </span>
        ) : null}
        {selectedSession?.data.worktree ? (
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px]">
            {selectedSession.data.worktree.id}
          </span>
        ) : null}
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
    <section className="flex min-h-0 flex-1 flex-col bg-muted/10 h-full">
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
                            : undefined
                        }
                      >
                        {message.parts.map((part, index) => {
                          if (part.type === 'reasoning') {
                            return (
                              <ReasoningPart
                                part={part}
                                defaultOpen={isThought}
                                index={index}
                                messageId={message.id}
                              />
                            );
                          }

                          if (isRenderableToolPart(part)) {
                            return (
                              <ToolPart
                                part={part}
                                index={index}
                                messageId={message.id}
                              />
                            );
                          }

                          if (isRenderableTerminalPart(part)) {
                            return (
                              <TerminalPart
                                part={part}
                                index={index}
                                messageId={message.id}
                              />
                            );
                          }

                          if (part.type === 'text') {
                            return (
                              <TextPart
                                part={part}
                                isPending={isPending}
                                index={index}
                                messageId={message.id}
                              />
                            );
                          }

                          return null;
                        })}
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
