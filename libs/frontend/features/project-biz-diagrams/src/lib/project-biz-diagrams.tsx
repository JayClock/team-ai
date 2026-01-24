import { useState } from 'react';
import { State } from '@hateoas-ts/resource';
import { BizDiagram } from '@shared/schema';
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from '@shared/ui/components/empty';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@shared/ui/components/dialog';
import { Button } from '@shared/ui/components/button';
import { XIcon } from 'lucide-react';
import { BizDiagramList } from './components/biz-diagram-list';
import { DiagramViewer } from './components/diagram-viewer';
import { Props } from './interface';

export function ProjectBizDiagrams(props: Props) {
  const { state } = props;
  const [selectedDiagramState, setSelectedDiagramState] =
    useState<State<BizDiagram> | null>(null);
  const [isDetailViewOpen, setIsDetailViewOpen] = useState(false);

  const handleDiagramView = (diagramState: State<BizDiagram>) => {
    setSelectedDiagramState(diagramState);
    setIsDetailViewOpen(true);
  };

  const handleCloseDetailView = () => {
    setIsDetailViewOpen(false);
    setSelectedDiagramState(null);
  };

  if (!state) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
            </svg>
          </EmptyMedia>
          <EmptyTitle>No project selected</EmptyTitle>
          <EmptyDescription>
            Select a project to view its business diagrams
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <Dialog open={isDetailViewOpen} onOpenChange={setIsDetailViewOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle>{selectedDiagramState?.data?.name}</DialogTitle>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleCloseDetailView}
              >
                <XIcon className="h-4 w-4" />
              </Button>
            </div>
          </DialogHeader>
          {selectedDiagramState && (
            <div className="space-y-4">
              {selectedDiagramState.data?.description && (
                <div>
                  <p className="text-sm text-muted-foreground">
                    {selectedDiagramState.data.description}
                  </p>
                </div>
              )}
              <DiagramViewer diagramState={selectedDiagramState} />
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span>类型: {selectedDiagramState.data?.diagramType}</span>
                <span>版本: {selectedDiagramState.data?.version}</span>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <div className="flex-1 overflow-y-auto p-6">
        <BizDiagramList
          projectState={state}
          onDiagramView={handleDiagramView}
        />
      </div>
    </div>
  );
}

export default ProjectBizDiagrams;
