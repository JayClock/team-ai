import { useMemo, useRef } from 'react';
import {
  State,
  useSuspenseInfiniteCollection,
} from '@hateoas-ts/resource-react';
import { useInView } from 'react-intersection-observer';
import { BizDiagramCard } from './biz-diagram-card';
import { BizDiagramUpload } from './biz-diagram-upload';
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from '@shared/ui/components/empty';
import { Spinner } from '@shared/ui/components/spinner';
import { BizDiagram, Project } from '@shared/schema';

interface BizDiagramListProps {
  projectState: State<Project>;
  onDiagramView: (diagramState: State<BizDiagram>) => void;
}

export function BizDiagramList({
  projectState,
  onDiagramView,
}: BizDiagramListProps) {
  const bizDiagramsResource = useMemo(() => {
    return projectState.follow('biz-diagrams');
  }, [projectState]);
  const {
    items: diagramCollection,
    hasNextPage,
    loadNextPage,
    isLoadingMore,
  } = useSuspenseInfiniteCollection(bizDiagramsResource);

  const loadingRef = useRef(false);

  const { ref: loadMoreRef } = useInView({
    threshold: 0,
    skip: isLoadingMore,
    rootMargin: '100px',
    onChange: (inView) => {
      if (inView && hasNextPage && !loadingRef.current) {
        loadingRef.current = true;
        loadNextPage().finally(() => {
          loadingRef.current = false;
        });
      }
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">业务图表</h2>
        {projectState.hasLink('create-biz-diagram') ? (
          <BizDiagramUpload
            action={projectState.action('create-biz-diagram')}
          />
        ) : (
          ''
        )}
      </div>

      {diagramCollection.length === 0 ? (
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
                <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
            </EmptyMedia>
            <EmptyTitle>暂无业务图表</EmptyTitle>
            <EmptyDescription>
              点击右上角的上传按钮，添加您的第一个业务流程图
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {diagramCollection.map((diagramState: State<BizDiagram>) => (
            <BizDiagramCard
              key={diagramState.data.id}
              diagramState={diagramState}
            />
          ))}
        </div>
      )}

      <div ref={loadMoreRef} className="h-1" />

      {isLoadingMore && (
        <div className="flex justify-center py-4">
          <Spinner />
        </div>
      )}

      {!hasNextPage && diagramCollection.length > 0 && (
        <div className="text-center text-sm text-muted-foreground py-4">
          没有更多图表了
        </div>
      )}
    </div>
  );
}
