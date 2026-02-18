import { State } from '@hateoas-ts/resource';
import { Diagram } from '@shared/schema';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Spinner,
} from '@shared/ui';
import { useCallback, useMemo, useState } from 'react';

interface UsePublishDiagramOptions {
  state: State<Diagram>;
  hasPendingDraft: boolean;
  isSavingDraft: boolean;
}

interface UsePublishDiagramResult {
  canPublish: boolean;
  isPublishing: boolean;
  handlePublish: () => Promise<void>;
}

export function usePublishDiagram({
  state,
  hasPendingDraft,
  isSavingDraft,
}: UsePublishDiagramOptions): UsePublishDiagramResult {
  const [isPublishing, setIsPublishing] = useState(false);

  const canPublish = useMemo(() => {
    if (hasPendingDraft || isSavingDraft || isPublishing) {
      return false;
    }
    if (state.data.status === 'published') {
      return false;
    }
    return state.hasLink('publish-diagram');
  }, [hasPendingDraft, isPublishing, isSavingDraft, state]);

  const handlePublish = useCallback(async () => {
    if (!canPublish) {
      return;
    }

    if (!state.hasLink('publish-diagram')) {
      throw new Error('Current diagram is missing required links for publish.');
    }

    setIsPublishing(true);
    try {
      const publishAction = state.action('publish-diagram');
      await publishAction.submit({});
      await state.follow('self').get();
    } finally {
      setIsPublishing(false);
    }
  }, [canPublish, state]);

  return {
    canPublish,
    isPublishing,
    handlePublish,
  };
}

interface Props {
  canPublish: boolean;
  isPublishing: boolean;
  onPublish: () => void | Promise<void>;
}

export function PublishDiagramPanelTool({
  canPublish,
  isPublishing,
  onPublish,
}: Props) {
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [publishError, setPublishError] = useState<string>();

  const handleConfirmPublish = async () => {
    setPublishError(undefined);
    try {
      await onPublish();
      setIsConfirmOpen(false);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to publish diagram';
      setPublishError(message);
    }
  };

  return (
    <>
      <Button
        size="sm"
        variant="secondary"
        disabled={!canPublish || isPublishing}
        onClick={() => {
          setIsConfirmOpen(true);
        }}
      >
        {isPublishing ? <Spinner className="size-4" /> : null}
        Publish
      </Button>
      <Dialog
        open={isConfirmOpen}
        onOpenChange={(open) => {
          setIsConfirmOpen(open);
          if (!open) {
            setPublishError(undefined);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Publish Diagram</DialogTitle>
            <DialogDescription>
              This will set diagram status to published.
            </DialogDescription>
          </DialogHeader>
          {publishError ? (
            <p className="text-destructive text-sm" role="alert">
              {publishError}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsConfirmOpen(false);
              }}
              disabled={isPublishing}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => {
                void handleConfirmPublish();
              }}
              disabled={isPublishing}
            >
              {isPublishing ? <Spinner className="size-4" /> : null}
              Confirm Publish
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
