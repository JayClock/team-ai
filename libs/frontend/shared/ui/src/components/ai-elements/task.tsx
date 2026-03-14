'use client';

import { cn } from '../../lib/utils';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../collapsible';
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  ChevronDownIcon,
  CircleDashedIcon,
  LoaderCircleIcon,
} from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';

export type TaskProps = ComponentProps<typeof Collapsible>;

export const Task = ({ className, ...props }: TaskProps) => (
  <Collapsible
    className={cn(
      'overflow-hidden rounded-xl border border-border/60 bg-background/90',
      className,
    )}
    {...props}
  />
);

export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'error';

function taskStatusIcon(status: TaskStatus | undefined) {
  switch (status) {
    case 'completed':
      return <CheckCircle2Icon className="size-4 text-emerald-600" />;
    case 'in_progress':
      return <LoaderCircleIcon className="size-4 animate-spin text-amber-600" />;
    case 'error':
      return <AlertTriangleIcon className="size-4 text-rose-600" />;
    case 'pending':
    default:
      return <CircleDashedIcon className="size-4 text-muted-foreground" />;
  }
}

export type TaskTriggerProps = Omit<
  ComponentProps<typeof CollapsibleTrigger>,
  'children'
> & {
  description?: ReactNode;
  icon?: ReactNode;
  status?: TaskStatus;
  title: ReactNode;
  trailing?: ReactNode;
};

export const TaskTrigger = ({
  className,
  description,
  icon,
  status,
  title,
  trailing,
  ...props
}: TaskTriggerProps) => (
  <CollapsibleTrigger
    className={cn(
      'group flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-muted/30',
      className,
    )}
    {...props}
  >
    <span className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-border/60 bg-muted/30 text-muted-foreground">
      {icon ?? taskStatusIcon(status)}
    </span>
    <span className="min-w-0 flex-1">
      <span className="block truncate text-sm font-medium">{title}</span>
      {description ? (
        <span className="mt-1 block text-xs leading-5 text-muted-foreground">
          {description}
        </span>
      ) : null}
    </span>
    <span className="flex shrink-0 items-center gap-2">
      {trailing ? <span>{trailing}</span> : null}
      <ChevronDownIcon className="size-4 text-muted-foreground transition group-data-[state=open]:rotate-180" />
    </span>
  </CollapsibleTrigger>
);

export type TaskContentProps = ComponentProps<typeof CollapsibleContent>;

export const TaskContent = ({
  className,
  children,
  ...props
}: TaskContentProps) => (
  <CollapsibleContent
    className={cn('border-t border-border/60', className)}
    {...props}
  >
    <div className="space-y-2 p-3">{children}</div>
  </CollapsibleContent>
);

export type TaskItemProps = ComponentProps<'div'> & {
  completed?: boolean;
  icon?: ReactNode;
};

export const TaskItem = ({
  className,
  completed = false,
  icon,
  children,
  ...props
}: TaskItemProps) => (
  <div
    className={cn(
      'flex items-start gap-2 rounded-lg border border-border/50 bg-muted/20 px-3 py-2 text-sm',
      completed && 'opacity-70',
      className,
    )}
    {...props}
  >
    {icon ? (
      <span className="mt-0.5 inline-flex size-4 shrink-0 items-center justify-center text-muted-foreground">
        {icon}
      </span>
    ) : null}
    <div className="min-w-0 flex-1">{children}</div>
  </div>
);

export type TaskItemFileProps = ComponentProps<'span'>;

export const TaskItemFile = ({
  className,
  ...props
}: TaskItemFileProps) => (
  <span
    className={cn(
      'inline-flex items-center gap-1 rounded-md border border-border/60 bg-background px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground',
      className,
    )}
    {...props}
  />
);
