import { type Action, State } from '@hateoas-ts/resource';
import { useSuspenseInfiniteCollection } from '@hateoas-ts/resource-react';
import { type Signal } from '@preact/signals-react';
import { type Diagram, type DiagramCollection } from '@shared/schema';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  toast,
} from '@shared/ui';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CreateDiagramDialog } from './components/create-diagram-dialog';

interface Props {
  state?: Signal<State<DiagramCollection>>;
}

type FormData = Record<string, unknown>;
type CreateDiagramCapability =
  | { canCreateDiagram: false }
  | { canCreateDiagram: true; createDiagramAction: Action<Diagram> };
type DiagramRow = {
  id: string;
  title: string;
  type: Diagram['data']['type'];
  status: Diagram['data']['status'];
  selfHref: string;
  state: State<Diagram>;
};

const getTitle = (data: FormData): string =>
  typeof data.title === 'string' ? data.title.trim() : '';

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
  diagramCollectionState: State<DiagramCollection>;
}) {
  const navigate = useNavigate();
  const { diagramCollectionState } = props;
  const [isCreating, setIsCreating] = useState(false);
  const [deletingDiagramIds, setDeletingDiagramIds] = useState<string[]>([]);
  const [pendingDeleteDiagram, setPendingDeleteDiagram] = useState<DiagramRow | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [createFormData, setCreateFormData] = useState<FormData>({ title: '' });
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

  const diagrams = useMemo<DiagramRow[]>(
    () =>
      diagramCollection.map((diagramState) => ({
        id: diagramState.data.id,
        title: diagramState.data.title,
        type: diagramState.data.type,
        status: diagramState.data.status,
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        selfHref: diagramState.getLink('self')!.href,
        state: diagramState,
      })),
    [diagramCollection],
  );

  const visibleDiagrams = useMemo(
    () =>
      diagrams.filter(
        (diagram) => !deletingDiagramIds.includes(diagram.id),
      ),
    [deletingDiagramIds, diagrams],
  );

  const createDiagramCapability = useMemo<CreateDiagramCapability>(() => {
    if (!diagramCollectionState.hasLink('create-diagram')) {
      return { canCreateDiagram: false };
    }
    return {
      canCreateDiagram: true,
      createDiagramAction: diagramCollectionState.action('create-diagram'),
    };
  }, [diagramCollectionState]);

  const { canCreateDiagram } = createDiagramCapability;

  const handleCreateDiagram = async (formData: FormData) => {
    const title = getTitle(formData);
    if (!canCreateDiagram || isCreating || title.length === 0) {
      return;
    }
    const { createDiagramAction } = createDiagramCapability;
    setIsCreating(true);
    try {
      const createdDiagram = await createDiagramAction.submit({
        ...formData,
        title,
      });
      const selfHref = createdDiagram.getLink('self')?.href;
      setIsCreateDialogOpen(false);
      setCreateFormData({ title: '' });
      if (selfHref) {
        navigate(selfHref);
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to create diagram',
      );
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteDiagram = async (diagram: DiagramRow) => {
    if (deletingDiagramIds.includes(diagram.id)) {
      return;
    }

    setDeletingDiagramIds((ids) => [...ids, diagram.id]);
    try {
      await diagram.state.follow('self').delete();
      setPendingDeleteDiagram((current) =>
        current?.id === diagram.id ? null : current,
      );
      toast.success('Diagram deleted');
    } catch (error) {
      setDeletingDiagramIds((ids) => ids.filter((id) => id !== diagram.id));
      toast.error(
        error instanceof Error ? error.message : 'Failed to delete diagram',
      );
    }
  };

  return (
    <div className="h-full overflow-auto p-4 md:p-6">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold">Project Diagrams</h2>
          <p className="text-sm text-muted-foreground">
            {visibleDiagrams.length} diagram{visibleDiagrams.length === 1 ? '' : 's'}
          </p>
        </div>
        {canCreateDiagram ? (
          <CreateDiagramDialog
            open={isCreateDialogOpen}
            onOpenChange={(open) => {
              setIsCreateDialogOpen(open);
              if (!open && !isCreating) {
                setCreateFormData({ title: '' });
              }
            }}
            isCreating={isCreating}
            formData={createFormData}
            onFormDataChange={setCreateFormData}
            onSubmit={handleCreateDiagram}
            createDiagramAction={createDiagramCapability.createDiagramAction}
          />
        ) : (
          <Button size="sm" disabled>
            Create Diagram
          </Button>
        )}
      </div>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleDiagrams.length === 0 && !isLoadingMore ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="h-24 text-center text-muted-foreground"
                >
                  No diagrams found.
                </TableCell>
              </TableRow>
            ) : null}

            {visibleDiagrams.map((diagram) => (
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
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(event) => {
                        event.stopPropagation();
                        navigate(diagram.selfHref);
                      }}
                    >
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={deletingDiagramIds.includes(diagram.id)}
                      onClick={(event) => {
                        event.stopPropagation();
                        setPendingDeleteDiagram(diagram);
                      }}
                    >
                      {deletingDiagramIds.includes(diagram.id)
                        ? 'Deleting...'
                        : 'Delete'}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}

            {isLoadingMore ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="text-center text-muted-foreground"
                >
                  Loading more diagrams...
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
      <AlertDialog
        open={pendingDeleteDiagram !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingDeleteDiagram(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Diagram</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDeleteDiagram
                ? `Delete diagram "${pendingDeleteDiagram.title}"? This action cannot be undone.`
                : 'This action cannot be undone.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={
                pendingDeleteDiagram
                  ? deletingDiagramIds.includes(pendingDeleteDiagram.id)
                  : false
              }
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button
                variant="destructive"
                disabled={
                  !pendingDeleteDiagram ||
                  deletingDiagramIds.includes(pendingDeleteDiagram.id)
                }
                onClick={() => {
                  if (pendingDeleteDiagram) {
                    void handleDeleteDiagram(pendingDeleteDiagram);
                  }
                }}
              >
                {pendingDeleteDiagram &&
                deletingDiagramIds.includes(pendingDeleteDiagram.id)
                  ? 'Deleting...'
                  : 'Delete'}
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
