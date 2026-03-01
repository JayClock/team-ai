import { Collection, State } from '@hateoas-ts/resource';
import { useSuspenseInfiniteCollection } from '@hateoas-ts/resource-react';
import { type Signal } from '@preact/signals-react';
import { Diagram } from '@shared/schema';
import {
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@shared/ui';
import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

interface Props {
  state?: Signal<State<Collection<Diagram>>>;
}

function formatDiagramType(type: string): string {
  return type.charAt(0).toUpperCase() + type.slice(1);
}

function formatDiagramStatus(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function FeaturesProjectDiagrams(props: Props) {
  const { state } = props;

  if (!state?.value) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
        No project selected.
      </div>
    );
  }

  return <ProjectDiagramsContent diagramCollectionState={state.value} />;
}

function ProjectDiagramsContent(props: {
  diagramCollectionState: State<Collection<Diagram>>;
}) {
  const navigate = useNavigate();
  const { diagramCollectionState } = props;
  const diagramsResource = useMemo(
    () => diagramCollectionState.follow('self'),
    [diagramCollectionState],
  );

  const {
    items: diagramCollection,
    hasNextPage,
    loadNextPage,
    isLoadingMore,
    error,
  } = useSuspenseInfiniteCollection(diagramsResource);

  useEffect(() => {
    if (hasNextPage && !isLoadingMore) {
      void loadNextPage();
    }
  }, [hasNextPage, isLoadingMore, loadNextPage]);

  const diagrams = useMemo(
    () =>
      diagramCollection.map((diagramState) => ({
        id: diagramState.data.id,
        title: diagramState.data.title,
        type: diagramState.data.type,
        status: diagramState.data.status,
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        selfHref: diagramState.getLink('self')!.href,
      })),
    [diagramCollection],
  );

  return (
    <div className="h-full overflow-auto p-4 md:p-6">
      <div className="mb-4 flex flex-col gap-1">
        <h2 className="text-lg font-semibold">Project Diagrams</h2>
        <p className="text-sm text-muted-foreground">
          {diagrams.length} diagram{diagrams.length === 1 ? '' : 's'}
        </p>
      </div>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {diagrams.length === 0 && !isLoadingMore ? (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="h-24 text-center text-muted-foreground"
                >
                  No diagrams found.
                </TableCell>
              </TableRow>
            ) : null}

            {diagrams.map((diagram) => (
              <TableRow
                key={diagram.id}
                onClick={() => navigate(diagram.selfHref)}
              >
                <TableCell className="font-mono text-xs">
                  {diagram.id}
                </TableCell>
                <TableCell className="font-medium">{diagram.title}</TableCell>
                <TableCell>{formatDiagramType(diagram.type)}</TableCell>
                <TableCell>{formatDiagramStatus(diagram.status)}</TableCell>
              </TableRow>
            ))}

            {isLoadingMore ? (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="text-center text-muted-foreground"
                >
                  Loading more diagrams...
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>

      {error ? (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          <span>Failed to load more diagrams: {error.message}</span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              void loadNextPage();
            }}
            disabled={isLoadingMore || !hasNextPage}
          >
            Retry
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export default FeaturesProjectDiagrams;
