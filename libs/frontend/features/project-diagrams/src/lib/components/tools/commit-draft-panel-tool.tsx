import {
  Button,
  Spinner,
  toast,
} from '@shared/ui';
import { type DiagramStore } from '../create-diagram-store';

interface Props {
  diagramStore: DiagramStore;
}

export function CommitDraftPanelTool({ diagramStore }: Props) {
  const storeState = diagramStore.state.value;
  const isSavingDraft = storeState.status === 'saving';
  const canSaveDraft =
    storeState.status === 'ready' || storeState.status === 'save-error';

  const handleSave = () => {
    if (!canSaveDraft || isSavingDraft) {
      return;
    }

    toast.promise(diagramStore.saveDiagram(), {
      loading: '保存中...',
      success: '保存成功',
      error: (error) =>
        error instanceof Error ? error.message : '保存失败',
    });
  };

  return (
    <Button
      size="sm"
      disabled={!canSaveDraft || isSavingDraft}
      onClick={() => {
        handleSave();
      }}
    >
      {isSavingDraft ? <Spinner className="size-4" /> : null}
      保存草稿
    </Button>
  );
}
