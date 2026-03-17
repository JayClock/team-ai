import {
  PromptInput,
  PromptInputAttachment,
  PromptInputAttachments,
  PromptInputBody,
  PromptInputFooter,
  PromptInputHeader,
  PromptInputProvider,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  usePromptInputController,
} from '@shared/ui';
import { ArrowRightIcon, LoaderCircleIcon } from 'lucide-react';
import { type ReactNode } from 'react';
import { useAcpProviderModels } from '../session/use-acp-provider-models';
import {
  ProjectModelPicker,
  type ProjectModelPickerProps,
} from './project-model-picker';
import {
  ProjectProviderPicker,
  type ProjectProviderPickerProps,
} from './project-provider-picker';
import {
  ProjectRepositoryPicker,
  type ProjectRepositoryPickerProps,
} from './project-repository-picker';

export type { ProjectProviderPickerProps } from './project-provider-picker';
export type {
  ProjectModelOption,
  ProjectModelPickerProps,
} from './project-model-picker';
export type {
  ProjectRepositoryOption,
  ProjectRepositoryPickerProps,
  ProjectWorktreeOption,
} from './project-repository-picker';

export type ProjectComposerSubmitInput = {
  cwd?: string;
  files: unknown[];
  model?: string | null;
  provider?: string;
  text: string;
};

export type ProjectComposerInputProps = {
  ariaLabel: string;
  disabled?: boolean;
  footerEnd?: ReactNode;
  footerStart?: ReactNode;
  model?: ProjectComposerModelProps;
  onSubmit: (input: ProjectComposerSubmitInput) => Promise<void> | void;
  placeholder: string;
  project?: ProjectComposerProjectProps;
  provider?: ProjectComposerProviderProps;
  submitPending?: boolean;
};

export type ProjectComposerModelProps = Pick<
  ProjectModelPickerProps,
  'onValueChange' | 'value'
>;

export type ProjectComposerProjectProps = Pick<
  ProjectRepositoryPickerProps,
  | 'cloneEndpoint'
  | 'onCreateWorktree'
  | 'onDeleteWorktree'
  | 'onProjectCloned'
  | 'onValidateWorktree'
  | 'onValueChange'
  | 'projects'
  | 'selectedWorktreeId'
  | 'value'
  | 'worktrees'
  | 'worktreesLoading'
>;

export type ProjectComposerProviderProps = Pick<
  ProjectProviderPickerProps,
  'loading' | 'onValueChange' | 'providers' | 'value'
>;

const DEFAULT_PROJECT_OPTIONS: ProjectRepositoryPickerProps['projects'] = [];
const DEFAULT_PROJECT_WORKTREES: ProjectRepositoryPickerProps['worktrees'] = [];
const EMPTY_PROVIDER_OPTIONS: ProjectProviderPickerProps['providers'] = [];

export function ProjectComposerInput(props: ProjectComposerInputProps) {
  return (
    <PromptInputProvider>
      <ProjectComposerInputContent {...props} />
    </PromptInputProvider>
  );
}

function ProjectComposerInputContent(props: ProjectComposerInputProps) {
  const {
    ariaLabel,
    disabled,
    footerEnd,
    footerStart,
    model,
    onSubmit,
    placeholder,
    project,
    provider,
    submitPending,
  } = props;
  const controller = usePromptInputController();
  const providerValue = provider?.value;
  const resolvedProviderOptions = provider?.providers ?? EMPTY_PROVIDER_OPTIONS;
  const resolvedProjectOptions = project?.projects ?? DEFAULT_PROJECT_OPTIONS;
  const resolvedProjectWorktrees =
    project?.worktrees ?? DEFAULT_PROJECT_WORKTREES;
  const {
    error: modelError,
    loading: modelLoading,
    models: modelOptions,
    providerId: modelProviderId,
  } = useAcpProviderModels(providerValue ?? null);
  const text = controller.textInput.value;
  const hasAttachments = controller.attachments.files.length > 0;

  const isSubmitDisabled =
    disabled === true ||
    submitPending === true ||
    text.trim().length === 0;

  return (
    <div className="group relative">
      <div className="pointer-events-none absolute -inset-1 rounded-[28px] bg-gradient-to-r from-amber-500/20 via-orange-500/10 to-amber-500/20 opacity-0 blur-xl transition-opacity duration-500 group-focus-within:opacity-100" />
      <PromptInput
        className="relative w-full focus-within:[&_[data-slot=input-group]]:border-amber-300/70 [&_[data-slot=input-group]]:overflow-visible [&_[data-slot=input-group]]:rounded-[24px] [&_[data-slot=input-group]]:border-slate-200 [&_[data-slot=input-group]]:bg-white [&_[data-slot=input-group]]:shadow-[0_18px_60px_-28px_rgba(15,23,42,0.35)] dark:[&_[data-slot=input-group]]:border-[#1c1f2e] dark:[&_[data-slot=input-group]]:bg-[#12141c] dark:[&_[data-slot=input-group]]:shadow-none dark:focus-within:[&_[data-slot=input-group]]:border-amber-500/30"
        multiple
        onSubmit={(message) =>
          onSubmit({
            cwd: project?.value?.repoPath ?? undefined,
            files: message.files,
            model: model?.value ?? undefined,
            provider: providerValue ?? undefined,
            text: message.text,
          })
        }
      >
        {hasAttachments ? (
          <PromptInputHeader className="w-full px-4 pt-3 md:px-5 md:pt-4">
            <PromptInputAttachments className="w-full gap-2 px-0 py-0">
              {(attachment) => <PromptInputAttachment data={attachment} />}
            </PromptInputAttachments>
          </PromptInputHeader>
        ) : null}

        <PromptInputBody>
          <PromptInputTextarea
            aria-label={ariaLabel}
            className="max-h-60 min-h-28 px-4 py-3 text-sm leading-7 text-slate-900 shadow-none outline-none focus-visible:ring-0 focus-visible:ring-offset-0 dark:text-slate-100 md:px-5 md:py-4 md:text-[15px]"
            disabled={disabled}
            placeholder={placeholder}
          />
        </PromptInputBody>

        <PromptInputFooter className="w-full items-center gap-2 border-t border-slate-100 px-4 py-3 md:px-5 dark:border-[#1c1f2e]">
          <PromptInputTools className="min-w-0 flex-1 flex-wrap items-center gap-2">
            <ProjectRepositoryPicker
              cloneEndpoint={project?.cloneEndpoint}
              disabled={disabled === true || submitPending === true}
              onCreateWorktree={project?.onCreateWorktree}
              onDeleteWorktree={project?.onDeleteWorktree}
              onProjectCloned={project?.onProjectCloned}
              onValidateWorktree={project?.onValidateWorktree}
              onValueChange={project?.onValueChange}
              projects={resolvedProjectOptions}
              selectedWorktreeId={project?.selectedWorktreeId}
              value={project?.value}
              worktrees={resolvedProjectWorktrees}
              worktreesLoading={project?.worktreesLoading}
            />
            {footerStart}
          </PromptInputTools>

          <div className="ml-auto flex items-center gap-2">
            <ProjectProviderPicker
              disabled={disabled === true || submitPending === true}
              loading={provider?.loading}
              onValueChange={provider?.onValueChange}
              providers={resolvedProviderOptions}
              value={providerValue}
            />
            <ProjectModelPicker
              disabled={disabled === true || submitPending === true}
              error={modelError}
              loading={modelLoading}
              models={modelOptions}
              onValueChange={model?.onValueChange}
              providerId={modelProviderId}
              value={model?.value}
            />
            {footerEnd}

            <PromptInputSubmit
              aria-label="发起会话"
              className="size-9 rounded-xl p-0"
              disabled={isSubmitDisabled}
            >
              {submitPending ? (
                <LoaderCircleIcon className="size-4 animate-spin" />
              ) : (
                <ArrowRightIcon className="size-4" />
              )}
            </PromptInputSubmit>
          </div>
        </PromptInputFooter>
      </PromptInput>
    </div>
  );
}
