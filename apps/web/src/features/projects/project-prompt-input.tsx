import { Button, Textarea } from '@shared/ui';
import {
  ArrowRightIcon,
  CornerDownLeftIcon,
  LoaderCircleIcon,
} from 'lucide-react';
import {
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useState,
} from 'react';

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
  submitDisabled?: boolean;
  submitPending?: boolean;
  variant: 'home' | 'session';
};

export function ProjectPromptInput(props: ProjectPromptInputProps) {
  const {
    ariaLabel,
    disabled,
    footerEnd,
    footerStart,
    onSubmit,
    placeholder,
    submitDisabled,
    submitPending,
    variant,
  } = props;
  const [text, setText] = useState('');

  const isSubmitDisabled =
    disabled === true ||
    submitPending === true ||
    submitDisabled === true ||
    text.trim().length === 0;

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      if (isSubmitDisabled) {
        return;
      }

      const submittedText = text;

      try {
        const result = onSubmit({
          files: [],
          text: submittedText,
        });

        void Promise.resolve(result)
          .then(() => {
            setText((current) => (current === submittedText ? '' : current));
          })
          .catch(() => undefined);
      } catch {
        return;
      }
    },
    [isSubmitDisabled, onSubmit, text],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (
        event.key !== 'Enter' ||
        event.shiftKey ||
        event.nativeEvent.isComposing
      ) {
        return;
      }

      event.preventDefault();

      if (isSubmitDisabled) {
        return;
      }

      event.currentTarget.form?.requestSubmit();
    },
    [isSubmitDisabled],
  );

  const submitIcon = submitPending ? (
    <LoaderCircleIcon className="size-4 animate-spin" />
  ) : variant === 'home' ? (
    <ArrowRightIcon className="size-4" />
  ) : (
    <CornerDownLeftIcon className="size-4" />
  );

  if (variant === 'home') {
    return (
      <div className="group relative">
        <div className="pointer-events-none absolute -inset-1 rounded-[28px] bg-gradient-to-r from-amber-500/20 via-orange-500/10 to-amber-500/20 opacity-0 blur-xl transition-opacity duration-500 group-focus-within:opacity-100" />
        <form
          className="relative overflow-visible rounded-[24px] border border-slate-200 bg-white shadow-[0_18px_60px_-28px_rgba(15,23,42,0.35)] transition-colors group-focus-within:border-amber-300/70 dark:border-[#1c1f2e] dark:bg-[#12141c] dark:shadow-none dark:group-focus-within:border-amber-500/30"
          onSubmit={handleSubmit}
        >
          <div className="px-4 pb-2 pt-3 md:px-5 md:pt-4">
            <Textarea
              aria-label={ariaLabel}
              className="max-h-60 min-h-28 w-full resize-none border-0 bg-transparent px-0 py-0 text-sm leading-7 text-slate-900 shadow-none outline-none focus-visible:ring-0 focus-visible:ring-offset-0 dark:text-slate-100 md:text-[15px]"
              disabled={disabled}
              onChange={(event) => setText(event.currentTarget.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              value={text}
            />
          </div>

          <div className="flex items-center gap-2 border-t border-slate-100 px-4 py-3 md:px-5 dark:border-[#1c1f2e]">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              {footerStart}
            </div>

            <div className="ml-auto flex items-center gap-2">
              {footerEnd}

              <Button
                aria-label="发起会话"
                className="size-9 rounded-xl p-0"
                disabled={isSubmitDisabled}
                type="submit"
              >
                {submitIcon}
              </Button>
            </div>
          </div>
        </form>
      </div>
    );
  }

  return (
    <form className="w-full" onSubmit={handleSubmit}>
      <div className="rounded-3xl border border-input bg-background shadow-sm transition-all duration-200 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
        <Textarea
          aria-label={ariaLabel}
          className="min-h-24 w-full resize-none border-0 bg-transparent px-4 py-3 text-sm shadow-none outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
          disabled={disabled}
          onChange={(event) => setText(event.currentTarget.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          value={text}
        />
      </div>

      <div className="mt-2 flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {footerStart}
        </div>

        <div className="flex items-center gap-2">
          {footerEnd}

          <Button
            aria-label="发送消息"
            disabled={isSubmitDisabled}
            size="icon-sm"
            type="submit"
          >
            {submitIcon}
          </Button>
        </div>
      </div>
    </form>
  );
}
