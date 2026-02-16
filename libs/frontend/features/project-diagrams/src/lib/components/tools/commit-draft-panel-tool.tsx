import { State } from '@hateoas-ts/resource';
import { Diagram, DiagramEdge, DiagramNode } from '@shared/schema';
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
import { useCallback, useState } from 'react';
import { DraftApplyPayload } from './draft-utils';

interface UseCommitDraftOptions {
  state: State<Diagram>;
}

interface UseCommitDraftResult {
  canSaveDraft: boolean;
  isSavingDraft: boolean;
  handleSaveDraft: () => Promise<void>;
  handleDraftApplyOptimistic: (payload: DraftApplyPayload) => void;
  handleDraftApplyReverted: () => void;
}

export function useCommitDraft({
  state,
}: UseCommitDraftOptions): UseCommitDraftResult {
  const [pendingDraft, setPendingDraft] =
    useState<{
      nodes: DiagramNode['data'][];
      edges: DiagramEdge['data'][];
    } | null>(null);
  const [isSavingDraft, setIsSavingDraft] = useState(false);

  const handleDraftApplyOptimistic = useCallback((payload: DraftApplyPayload) => {
    setPendingDraft(payload.draft);
  }, []);

  const handleDraftApplyReverted = useCallback(() => {
    setPendingDraft(null);
  }, []);

  const handleSaveDraft = useCallback(async () => {
    if (!pendingDraft || isSavingDraft) {
      return;
    }

    if (!state.hasLink('commit-draft')) {
      throw new Error('Current diagram is missing required links for draft save.');
    }

    setIsSavingDraft(true);

    try {
      const commitDraftAction = state.action('commit-draft');
      await commitDraftAction.submit(pendingDraft);
    } finally {
      setIsSavingDraft(false);
    }
  }, [isSavingDraft, pendingDraft, state]);

  return {
    canSaveDraft: pendingDraft !== null,
    isSavingDraft,
    handleSaveDraft,
    handleDraftApplyOptimistic,
    handleDraftApplyReverted,
  };
}

interface Props {
  canSaveDraft: boolean;
  isSavingDraft: boolean;
  onSaveDraft: () => void | Promise<void>;
}

export function CommitDraftPanelTool({
  canSaveDraft,
  isSavingDraft,
  onSaveDraft,
}: Props) {
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [saveError, setSaveError] = useState<string>();

  const handleConfirmSave = async () => {
    setSaveError(undefined);
    try {
      await onSaveDraft();
      setIsConfirmOpen(false);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to save draft';
      setSaveError(message);
    }
  };

  return (
    <>
      <Button
        size="sm"
        disabled={!canSaveDraft || isSavingDraft}
        onClick={() => {
          setIsConfirmOpen(true);
        }}
      >
        {isSavingDraft ? <Spinner className="size-4" /> : null}
        Save Draft
      </Button>
      <Dialog
        open={isConfirmOpen}
        onOpenChange={(open) => {
          setIsConfirmOpen(open);
          if (!open) {
            setSaveError(undefined);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save Draft to Canvas</DialogTitle>
            <DialogDescription>
              This will persist the current draft nodes and edges to the diagram.
            </DialogDescription>
          </DialogHeader>
          {saveError ? (
            <p className="text-destructive text-sm" role="alert">
              {saveError}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsConfirmOpen(false);
              }}
              disabled={isSavingDraft}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => {
                void handleConfirmSave();
              }}
              disabled={isSavingDraft}
            >
              {isSavingDraft ? <Spinner className="size-4" /> : null}
              Confirm Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
