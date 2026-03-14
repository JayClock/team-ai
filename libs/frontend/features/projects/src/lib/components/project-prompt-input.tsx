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
import {
  ProjectRepositoryPicker,
  type ProjectRepositoryPickerProps,
} from './project-repository-picker';

export type {
  ProjectRepositoryOption,
  ProjectRepositoryPickerProps,
} from './project-repository-picker';

type ProjectPromptSubmitInput = {
  files: unknown[];
  text: string;
};

export type ProjectPromptInputProps = {
  ariaLabel: string;
  disabled?: boolean;
  footerEnd?: ReactNode;
  footerStart?: ReactNode;
  onSubmit: (input: ProjectPromptSubmitInput) => Promise<void> | void;
  placeholder: string;
  projectPicker?: ProjectRepositoryPickerProps;
  submitDisabled?: boolean;
  submitPending?: boolean;
};

export function ProjectPromptInput(props: ProjectPromptInputProps) {
  return (
    <PromptInputProvider>
      <ProjectPromptInputContent {...props} />
    </PromptInputProvider>
  );
}

function ProjectPromptInputContent(props: ProjectPromptInputProps) {
  const {
    ariaLabel,
    disabled,
    footerEnd,
    footerStart,
    onSubmit,
    placeholder,
    projectPicker,
    submitDisabled,
    submitPending,
  } = props;
  const controller = usePromptInputController();
  const text = controller.textInput.value;
  const hasAttachments = controller.attachments.files.length > 0;

  const isSubmitDisabled =
    disabled === true ||
    submitPending === true ||
    submitDisabled === true ||
    text.trim().length === 0;

  return (
    <div className="group relative">
      <div className="pointer-events-none absolute -inset-1 rounded-[28px] bg-gradient-to-r from-amber-500/20 via-orange-500/10 to-amber-500/20 opacity-0 blur-xl transition-opacity duration-500 group-focus-within:opacity-100" />
      <PromptInput
        className="relative w-full focus-within:[&_[data-slot=input-group]]:border-amber-300/70 [&_[data-slot=input-group]]:overflow-visible [&_[data-slot=input-group]]:rounded-[24px] [&_[data-slot=input-group]]:border-slate-200 [&_[data-slot=input-group]]:bg-white [&_[data-slot=input-group]]:shadow-[0_18px_60px_-28px_rgba(15,23,42,0.35)] dark:[&_[data-slot=input-group]]:border-[#1c1f2e] dark:[&_[data-slot=input-group]]:bg-[#12141c] dark:[&_[data-slot=input-group]]:shadow-none dark:focus-within:[&_[data-slot=input-group]]:border-amber-500/30"
        multiple
        onSubmit={(message) =>
          onSubmit({
            files: message.files,
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
            {projectPicker ? <ProjectRepositoryPicker {...projectPicker} /> : null}
            {footerStart}
          </PromptInputTools>

          <div className="ml-auto flex items-center gap-2">
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
