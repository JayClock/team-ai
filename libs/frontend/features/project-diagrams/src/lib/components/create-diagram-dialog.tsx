import { type Action } from '@hateoas-ts/resource';
import { type Diagram } from '@shared/schema';
import {
  ActionForm,
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@shared/ui';

type FormData = Record<string, unknown>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isCreating: boolean;
  formData: FormData;
  onFormDataChange: (formData: FormData) => void;
  onSubmit: (formData: FormData) => void | Promise<void>;
  createDiagramAction: Action<Diagram>;
}

const getTitle = (data: FormData): string =>
  typeof data.title === 'string' ? data.title.trim() : '';

export function CreateDiagramDialog(props: Props) {
  const {
    open,
    onOpenChange,
    isCreating,
    formData,
    onFormDataChange,
    onSubmit,
    createDiagramAction,
  } = props;
  const canSubmitCreate = !isCreating && getTitle(formData).length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" disabled={isCreating}>
          Create Diagram
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{createDiagramAction.title}</DialogTitle>
        </DialogHeader>
        <ActionForm
          action={createDiagramAction}
          formData={formData}
          onFormDataChange={onFormDataChange}
          onSubmit={onSubmit}
          uiSchema={{
            'ui:submitButtonOptions': {
              norender: true,
            },
            'ui:options': {
              label: false,
            },
            title: {
              'ui:autofocus': true,
            },
          }}
        ></ActionForm>
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
      </DialogContent>
    </Dialog>
  );
}
