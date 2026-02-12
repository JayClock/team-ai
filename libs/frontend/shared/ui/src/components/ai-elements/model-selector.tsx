'use client';

import * as React from 'react';
import { cn } from '../../lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../dialog';
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '../command';

export function ModelSelector(props: React.ComponentProps<typeof Dialog>) {
  return <Dialog {...props} />;
}

export function ModelSelectorTrigger(
  props: React.ComponentProps<typeof DialogTrigger>,
) {
  return <DialogTrigger {...props} />;
}

export function ModelSelectorContent({
  title = 'Select Model',
  className,
  children,
  ...props
}: React.ComponentProps<typeof DialogContent> & {
  title?: React.ReactNode;
}) {
  return (
    <DialogContent className={cn('overflow-hidden p-0', className)} {...props}>
      <DialogHeader className="sr-only">
        <DialogTitle>{title}</DialogTitle>
      </DialogHeader>
      <Command className="max-h-[420px] [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group]]:px-2 [&_[cmdk-input-wrapper]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-2">
        {children}
      </Command>
    </DialogContent>
  );
}

export function ModelSelectorDialog(
  props: React.ComponentProps<typeof CommandDialog>,
) {
  return <CommandDialog {...props} />;
}

export function ModelSelectorInput(
  props: React.ComponentProps<typeof CommandInput>,
) {
  return <CommandInput {...props} />;
}

export function ModelSelectorList(
  props: React.ComponentProps<typeof CommandList>,
) {
  return <CommandList {...props} />;
}

export function ModelSelectorEmpty(
  props: React.ComponentProps<typeof CommandEmpty>,
) {
  return <CommandEmpty {...props} />;
}

export function ModelSelectorGroup(
  props: React.ComponentProps<typeof CommandGroup>,
) {
  return <CommandGroup {...props} />;
}

export function ModelSelectorItem(
  props: React.ComponentProps<typeof CommandItem>,
) {
  return <CommandItem {...props} />;
}

export function ModelSelectorShortcut(
  props: React.ComponentProps<typeof CommandShortcut>,
) {
  return <CommandShortcut {...props} />;
}

export function ModelSelectorSeparator(
  props: React.ComponentProps<typeof CommandSeparator>,
) {
  return <CommandSeparator {...props} />;
}

function providerToken(provider: string): string {
  const token = provider
    .split(/[^a-z0-9]/i)
    .filter(Boolean)
    .map((part) => part[0] || '')
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return token || 'AI';
}

export function ModelSelectorLogo({
  provider,
  className,
  ...props
}: Omit<React.ComponentProps<'span'>, 'children'> & {
  provider: string;
}) {
  return (
    <span
      aria-label={provider}
      className={cn(
        'inline-flex size-4 shrink-0 items-center justify-center rounded-[4px] border bg-muted text-[9px] font-semibold uppercase tracking-tight',
        className,
      )}
      title={provider}
      {...props}
    >
      {providerToken(provider)}
    </span>
  );
}

export function ModelSelectorLogoGroup({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  return <div className={cn('ml-auto flex items-center gap-1', className)} {...props} />;
}

export function ModelSelectorName({
  className,
  ...props
}: React.ComponentProps<'span'>) {
  return <span className={cn('truncate', className)} {...props} />;
}
