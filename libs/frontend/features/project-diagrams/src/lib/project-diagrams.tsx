import { State } from '@hateoas-ts/resource';
import { useSuspenseInfiniteCollection } from '@hateoas-ts/resource-react';
import { type Signal } from '@preact/signals-react';
import { DiagramCollection } from '@shared/schema';
import {
  ActionForm,
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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

interface Props {
  state?: Signal<State<DiagramCollection>>;
}

type FormData = Record<string, unknown>;

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

  const createDiagramAction = useMemo(() => {
    if (!diagramCollectionState.hasLink('create-diagram')) {
      return undefined;
    }
    return diagramCollectionState.action('create-diagram');
  }, [diagramCollectionState]);

  const canCreateDiagram = createDiagramAction !== undefined;
  const canSubmitCreate = canCreateDiagram && !isCreating && getTitle(createFormData).length > 0;

  const handleCreateDiagram = async (formData: FormData) => {
    const title = getTitle(formData);
    if (!createDiagramAction || isCreating || title.length === 0) {
      return;
    }
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
      toast.error(error instanceof Error ? error.message : 'Failed to create diagram');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="h-full overflow-auto p-4 md:p-6">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold">Project Diagrams</h2>
          <p className="text-sm text-muted-foreground">
            {diagrams.length} diagram{diagrams.length === 1 ? '' : 's'}
          </p>
        </div>
        <Dialog
          open={isCreateDialogOpen}
          onOpenChange={(open) => {
            setIsCreateDialogOpen(open);
            if (!open && !isCreating) {
              setCreateFormData({ title: '' });
            }
          }}
        >
          <DialogTrigger asChild>
            <Button size="sm" disabled={!canCreateDiagram || isCreating}>
              Create Diagram
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Diagram</DialogTitle>
              <DialogDescription>
                Enter a title for the new diagram.
              </DialogDescription>
            </DialogHeader>
            {createDiagramAction ? (
              <ActionForm
                action={createDiagramAction}
                formData={createFormData}
                onFormDataChange={setCreateFormData}
                onSubmit={handleCreateDiagram}
                uiSchema={{
                  title: {
                    'ui:autofocus': true,
                    'ui:placeholder': 'Diagram title',
                  },
                }}
              >
                <DialogFooter>
                  <DialogClose asChild>
                    <Button type="button" variant="outline" disabled={isCreating}>
                      Cancel
                    </Button>
                  </DialogClose>
                  <Button type="submit" disabled={!canSubmitCreate}>
                    {isCreating ? 'Creating...' : 'Create'}
                  </Button>
                </DialogFooter>
              </ActionForm>
            ) : null}
          </DialogContent>
        </Dialog>
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
