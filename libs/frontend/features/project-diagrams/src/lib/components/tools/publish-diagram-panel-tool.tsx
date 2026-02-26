import {
  Button,
  Spinner,
  toast,
} from '@shared/ui';
import { type DiagramStore } from '../create-diagram-store';

interface Props {
  diagramStore: DiagramStore;
}

export function PublishDiagramPanelTool({
  diagramStore,
}: Props) {
  const storeState = diagramStore.state.value;
  const isPublishing = storeState.status === 'publishing';
  const canPublish = diagramStore.canPublishDiagram();

  const handlePublish = () => {
    if (!canPublish || isPublishing) {
      return;
    }

    const publishPromise = diagramStore.publishDiagram();
    toast.promise(publishPromise, {
      loading: '发布中...',
      success: '发布成功',
      error: (error) =>
        error instanceof Error ? error.message : '发布图表失败',
    });
    void publishPromise.catch(() => undefined);
  };

  return (
    <Button
      size="sm"
      variant="secondary"
      disabled={!canPublish || isPublishing}
      onClick={() => {
        handlePublish();
      }}
    >
      {isPublishing ? <Spinner className="size-4" /> : null}
      发布
    </Button>
  );
}
