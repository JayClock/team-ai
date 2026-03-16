'use client';

import Ansi from 'ansi-to-react';
import { TerminalIcon } from 'lucide-react';
import type { ComponentProps } from 'react';
import { cn } from '../../lib/utils';

export type TerminalProps = ComponentProps<'div'>;

export const Terminal = ({ className, ...props }: TerminalProps) => (
  <div
    className={cn(
      'not-prose overflow-hidden rounded-xl border bg-[#0f172a] text-slate-100 shadow-sm',
      className,
    )}
    {...props}
  />
);

export type TerminalHeaderProps = ComponentProps<'div'>;

export const TerminalHeader = ({
  className,
  ...props
}: TerminalHeaderProps) => (
  <div
    className={cn(
      'flex items-center justify-between gap-3 border-b border-slate-800 bg-slate-950/80 px-3 py-2',
      className,
    )}
    {...props}
  />
);

export type TerminalTitleProps = ComponentProps<'div'> & {
  command?: string | null;
  args?: string[];
};

export const TerminalTitle = ({
  args,
  children,
  className,
  command,
  ...props
}: TerminalTitleProps) => {
  const title =
    typeof children === 'string'
      ? children
      : command
        ? args && args.length > 0
          ? `${command} ${args.join(' ')}`
          : command
        : 'Terminal';

  return (
    <div
      className={cn(
        'flex min-w-0 items-center gap-2 text-xs font-medium text-slate-200',
        className,
      )}
      {...props}
    >
      <TerminalIcon className="size-3.5 shrink-0 text-emerald-400" />
      <span className="truncate font-mono">{title}</span>
    </div>
  );
};

export type TerminalStatusProps = ComponentProps<'div'> & {
  status?: 'running' | 'completed' | 'failed';
  exitCode?: number | null;
};

export const TerminalStatus = ({
  className,
  exitCode,
  status = 'running',
  ...props
}: TerminalStatusProps) => {
  const tone =
    status === 'completed'
      ? 'bg-emerald-400'
      : status === 'failed'
        ? 'bg-rose-400'
        : 'bg-amber-400 animate-pulse';
  const label =
    status === 'completed'
      ? 'completed'
      : status === 'failed'
        ? `failed${typeof exitCode === 'number' ? ` (${exitCode})` : ''}`
        : 'running';

  return (
    <div
      className={cn(
        'flex shrink-0 items-center gap-2 text-[11px] text-slate-400',
        className,
      )}
      {...props}
    >
      <span className={cn('size-2 rounded-full', tone)} />
      <span>{label}</span>
    </div>
  );
};

export type TerminalContentProps = ComponentProps<'div'> & {
  output: string;
};

export const TerminalContent = ({
  className,
  output,
  ...props
}: TerminalContentProps) => (
  <div
    className={cn(
      'max-h-96 overflow-auto bg-[#020617] px-3 py-3 font-mono text-xs leading-5 text-slate-100',
      className,
    )}
    {...props}
  >
    {output.trim().length > 0 ? (
      <Ansi>{output}</Ansi>
    ) : (
      <span className="text-slate-500">(empty)</span>
    )}
  </div>
);
