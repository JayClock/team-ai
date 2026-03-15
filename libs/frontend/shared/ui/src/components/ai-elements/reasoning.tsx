'use client';

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '../collapsible';
import { cn } from '../../lib/utils';
import { BrainIcon, ChevronDownIcon } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import {
  createContext,
  memo,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import { Streamdown } from 'streamdown';

interface ReasoningContextValue {
  isOpen: boolean;
  isStreaming: boolean;
  setIsOpen: (open: boolean) => void;
}

const ReasoningContext = createContext<ReasoningContextValue | null>(null);

function useReasoning() {
  const context = useContext(ReasoningContext);

  if (!context) {
    throw new Error('Reasoning components must be used within Reasoning');
  }

  return context;
}

export type ReasoningProps = ComponentProps<typeof Collapsible> & {
  isStreaming?: boolean;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export const Reasoning = memo(
  ({
    className,
    isStreaming = false,
    open,
    defaultOpen = isStreaming,
    onOpenChange,
    children,
    ...props
  }: ReasoningProps) => {
    const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
    const isOpen = open ?? uncontrolledOpen;

    const setIsOpen = useCallback(
      (nextOpen: boolean) => {
        if (open === undefined) {
          setUncontrolledOpen(nextOpen);
        }
        onOpenChange?.(nextOpen);
      },
      [onOpenChange, open],
    );

    const contextValue = useMemo(
      () => ({ isOpen, isStreaming, setIsOpen }),
      [isOpen, isStreaming, setIsOpen],
    );

    return (
      <ReasoningContext.Provider value={contextValue}>
        <Collapsible
          className={cn('not-prose mb-4', className)}
          onOpenChange={setIsOpen}
          open={isOpen}
          {...props}
        >
          {children}
        </Collapsible>
      </ReasoningContext.Provider>
    );
  },
);

export type ReasoningTriggerProps = ComponentProps<
  typeof CollapsibleTrigger
> & {
  getThinkingMessage?: (isStreaming: boolean) => ReactNode;
};

const defaultGetThinkingMessage = (isStreaming: boolean) =>
  isStreaming ? 'Thinking...' : 'Thought process';

export const ReasoningTrigger = memo(
  ({
    className,
    children,
    getThinkingMessage = defaultGetThinkingMessage,
    ...props
  }: ReasoningTriggerProps) => {
    const { isOpen, isStreaming } = useReasoning();

    return (
      <CollapsibleTrigger
        className={cn(
          'flex w-full items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground',
          className,
        )}
        {...props}
      >
        {children ?? (
          <>
            <BrainIcon className="size-4" />
            <span className="flex-1 text-left">
              {getThinkingMessage(isStreaming)}
            </span>
            <ChevronDownIcon
              className={cn(
                'size-4 transition-transform',
                isOpen ? 'rotate-180' : 'rotate-0',
              )}
            />
          </>
        )}
      </CollapsibleTrigger>
    );
  },
);

export type ReasoningContentProps = ComponentProps<
  typeof CollapsibleContent
> & {
  children: string;
};

export const ReasoningContent = memo(
  ({ className, children, ...props }: ReasoningContentProps) => (
    <CollapsibleContent
      className={cn(
        'mt-4 text-sm text-muted-foreground outline-none',
        'data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:slide-in-from-top-2 data-[state=closed]:animate-out data-[state=open]:animate-in',
        className,
      )}
      {...props}
    >
      <Streamdown>{children}</Streamdown>
    </CollapsibleContent>
  ),
);

Reasoning.displayName = 'Reasoning';
ReasoningTrigger.displayName = 'ReasoningTrigger';
ReasoningContent.displayName = 'ReasoningContent';
