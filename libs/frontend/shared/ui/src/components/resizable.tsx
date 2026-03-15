'use client';

import * as React from 'react';
import { GripVerticalIcon } from 'lucide-react';
import {
  Group,
  Panel,
  Separator,
} from 'react-resizable-panels';

import { cn } from '../lib/utils';

function ResizablePanelGroup({
  className,
  orientation = 'horizontal',
  ...props
}: React.ComponentProps<typeof Group>) {
  return (
    <Group
      data-slot="resizable-panel-group"
      className={cn('flex h-full w-full', className)}
      orientation={orientation}
      {...props}
    />
  );
}

const ResizablePanel = Panel;

function ResizableHandle({
  className,
  withHandle = false,
  ...props
}: React.ComponentProps<typeof Separator> & {
  withHandle?: boolean;
}) {
  return (
    <Separator
      data-slot="resizable-handle"
      className={cn(
        'relative flex shrink-0 items-center justify-center bg-border focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1',
        'aria-[orientation=vertical]:h-full aria-[orientation=vertical]:w-px',
        'aria-[orientation=vertical]:after:absolute aria-[orientation=vertical]:after:inset-y-0 aria-[orientation=vertical]:after:left-1/2 aria-[orientation=vertical]:after:w-2 aria-[orientation=vertical]:after:-translate-x-1/2',
        'aria-[orientation=horizontal]:h-px aria-[orientation=horizontal]:w-full',
        'aria-[orientation=horizontal]:after:absolute aria-[orientation=horizontal]:after:inset-x-0 aria-[orientation=horizontal]:after:top-1/2 aria-[orientation=horizontal]:after:h-2 aria-[orientation=horizontal]:after:-translate-y-1/2',
        'aria-[orientation=horizontal]:[&>div]:rotate-90',
        className,
      )}
      {...props}
    >
      {withHandle ? (
        <div className="z-10 flex h-4 w-3 items-center justify-center rounded-sm border border-border bg-background">
          <GripVerticalIcon className="size-2.5" />
        </div>
      ) : null}
    </Separator>
  );
}

export { ResizableHandle, ResizablePanel, ResizablePanelGroup };
