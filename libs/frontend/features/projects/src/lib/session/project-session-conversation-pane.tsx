import { State } from '@hateoas-ts/resource';
import {
  ProjectComposerInput,
  type ProjectComposerModelProps,
  type ProjectComposerProjectProps,
  type ProjectComposerProviderProps,
  SessionEvents,
} from '@features/session-events';
import { AcpSession } from '@shared/schema';
import { formatStatusLabel } from './project-session-workbench.shared';

export function ProjectSessionConversationPane(props: {
  hasPendingAssistantMessage: boolean;
  interactionDisabled?: boolean;
  onCancel?: () => Promise<void>;
  onSubmit: (input: {
    cwd?: string;
    files: unknown[];
    model?: string | null;
    provider?: string;
    text: string;
  }) => Promise<void>;
  model?: ProjectComposerModelProps;
  project?: ProjectComposerProjectProps;
  provider?: ProjectComposerProviderProps;
  selectedSession: State<AcpSession> | null;
}) {
  const {
    hasPendingAssistantMessage,
    interactionDisabled,
    model,
    onCancel,
    onSubmit,
    project,
    provider,
    selectedSession,
  } = props;

  const promptInputProps = {
    ariaLabel: '会话输入框',
    disabled: interactionDisabled === true,
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
        {selectedSession ? (
          <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">
            {selectedSession.data.model ?? '未指定 model'}
          </span>
        ) : null}
      </div>
    ),
    model,
    onCancel,
    onSubmit,
    placeholder: selectedSession
      ? '继续当前会话...'
      : '发送第一条消息，开始新的会话...',
    project,
    provider,
    submitPending: hasPendingAssistantMessage,
  };

  return (
    <section className="flex min-h-0 flex-1 flex-col bg-muted/10 h-full">
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        <SessionEvents session={selectedSession} />

        <div className="shrink-0 border-t border-border/60 bg-background/95">
          <div className="mx-auto w-full max-w-3xl px-4 py-3 md:px-5">
            <ProjectComposerInput {...promptInputProps} />
          </div>
        </div>
      </div>
    </section>
  );
}
