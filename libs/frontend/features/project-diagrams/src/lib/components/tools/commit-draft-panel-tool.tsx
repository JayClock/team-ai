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
import { DraftApplyPayload, toNodeReferenceKeys } from './draft-utils';

type BatchNodePayload = {
  type: string;
  'logicalEntity.id'?: string;
  'parent.id'?: string;
  positionX: number;
  positionY: number;
  width: number;
  height: number;
};

type BatchLogicalEntityPayload = {
  type: DiagramNode['data']['localData']['type'];
  name: string;
  label: string;
};

type BatchEdgePayload = {
  'sourceNode.id': string;
  'targetNode.id': string;
};

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
      const draftRefToNodeRef = new Map<string, string>();
      const logicalEntitiesPayload: BatchLogicalEntityPayload[] = [];
      const nodesPayload: BatchNodePayload[] = [];

      for (let index = 0; index < pendingDraft.nodes.length; index += 1) {
        const draftNode = pendingDraft.nodes[index];
        const fallbackName = `entity_${index + 1}`;
        const name = draftNode.localData.name.trim() || fallbackName;
        const label = draftNode.localData.label.trim() || name;
        const logicalEntityRef = `logical-${index + 1}`;
        logicalEntitiesPayload.push({
          type: draftNode.localData.type,
          name,
          label,
        });

        const nodeRef = `node-${index + 1}`;

        const parentId = draftNode.parent?.id;
        const nodePayload: BatchNodePayload = {
          type: draftNode.type,
          'logicalEntity.id': logicalEntityRef,
          positionX: draftNode.positionX,
          positionY: draftNode.positionY,
          width: draftNode.width,
          height: draftNode.height,
        };
        if (parentId) {
          nodePayload['parent.id'] = parentId;
        }
        nodesPayload.push(nodePayload);

        for (const key of toNodeReferenceKeys(draftNode)) {
          draftRefToNodeRef.set(key, nodeRef);
        }
      }

      const resolveNodeId = (draftRefId: string): string | undefined => {
        return draftRefToNodeRef.get(draftRefId);
      };

      const edgesPayload: BatchEdgePayload[] = [];
      for (const draftEdge of pendingDraft.edges) {
        const sourceNodeId = resolveNodeId(draftEdge.sourceNode.id);
        const targetNodeId = resolveNodeId(draftEdge.targetNode.id);
        if (!sourceNodeId || !targetNodeId) {
          continue;
        }

        edgesPayload.push({
          'sourceNode.id': sourceNodeId,
          'targetNode.id': targetNodeId,
        });
      }

      const commitDraftAction = state.action('commit-draft');
      const payload = {
        logicalEntities: logicalEntitiesPayload,
        nodes: nodesPayload,
        edges: edgesPayload,
      };
      await commitDraftAction.submit(payload);
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
