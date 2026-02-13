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
  Panel,
  Spinner,
} from '@shared/ui';
import { useState } from 'react';
import { DraftApplyPayload } from './draft-utils';
import { SettingsTool } from './settings-tool';

interface Props {
  state: State<Diagram>;
  canSaveDraft: boolean;
  isSavingDraft: boolean;
  onSaveDraft: () => void | Promise<void>;
  onDraftApplyOptimistic?: (payload: DraftApplyPayload) => void;
  onDraftApplyReverted?: () => void;
}

export function DiagramTools({
  state,
  canSaveDraft,
  isSavingDraft,
  onSaveDraft,
  onDraftApplyOptimistic,
  onDraftApplyReverted,
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
      <Panel position="center-left">
        <div className="flex gap-1">
          <SettingsTool
            state={state}
            isSavingDraft={isSavingDraft}
            onDraftApplyOptimistic={onDraftApplyOptimistic}
            onDraftApplyReverted={onDraftApplyReverted}
          />
        </div>
      </Panel>
      <Panel position="top-right">
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
      </Panel>
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
