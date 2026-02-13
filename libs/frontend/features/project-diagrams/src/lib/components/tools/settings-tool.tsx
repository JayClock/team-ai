import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
  Message,
  MessageContent,
  MessageResponse,
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  Button,
  Spinner,
  Textarea,
} from '@shared/ui';
import { State } from '@hateoas-ts/resource';
import { Diagram, DraftDiagramModel } from '@shared/schema';
import { Settings2 } from 'lucide-react';
import { FormEvent, useMemo, useState } from 'react';

type ChatMessage = {
  id: string;
  role: 'assistant' | 'user';
  content: string;
};

type ValueTarget = {
  value?: string;
};

interface Props {
  state: State<Diagram>;
}

function toDraftSummary(draft: DraftDiagramModel['data']): string {
  const nodeLines =
    draft.nodes.length > 0
      ? draft.nodes
          .map(
            (node, index) =>
              `${index + 1}. ${node.localData.label} (${node.localData.name}) [${node.localData.type}]`,
          )
          .join('\n')
      : '- No nodes suggested';

  const edgeLines =
    draft.edges.length > 0
      ? draft.edges
          .map(
            (edge, index) =>
              `${index + 1}. ${edge.sourceNode.id} -> ${edge.targetNode.id}`,
          )
          .join('\n')
      : '- No edges suggested';

  return [
    '### Proposed Diagram Draft',
    `- Nodes: ${draft.nodes.length}`,
    `- Edges: ${draft.edges.length}`,
    '',
    '### Nodes',
    nodeLines,
    '',
    '### Edges',
    edgeLines,
  ].join('\n');
}

export function SettingsTool({ state }: Props) {
  const [requirement, setRequirement] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string>();

  const canSubmit = useMemo(
    () => requirement.trim().length > 0 && !isSubmitting,
    [requirement, isSubmitting],
  );

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedRequirement = requirement.trim();
    if (!trimmedRequirement || isSubmitting) {
      return;
    }

    if (!state.hasLink('propose-model')) {
      setError('Current diagram does not expose propose-model action.');
      return;
    }

    setIsSubmitting(true);
    setError(undefined);
    setRequirement('');

    setMessages((prev) => [
      ...prev,
      {
        id: `user-${Date.now()}`,
        role: 'user',
        content: trimmedRequirement,
      },
    ]);

    try {
      const result = await state
        .action('propose-model')
        .submit({ requirement: trimmedRequirement });

      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: toDraftSummary(result.data),
        },
      ]);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to propose model';
      setError(message);
      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-error-${Date.now()}`,
          role: 'assistant',
          content: `Model proposal failed: ${message}`,
        },
      ]);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon-sm">
          <Settings2 className="size-4" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="gap-0 p-0 sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Model Assistant</SheetTitle>
          <SheetDescription>
            Describe your requirement and generate a draft model proposal.
          </SheetDescription>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col border-t">
          <Conversation className="min-h-0 flex-1">
            <ConversationContent className="gap-4 px-4 py-4">
              {messages.length === 0 ? (
                <ConversationEmptyState
                  title="No model proposal yet"
                  description="Enter a requirement below to propose nodes and edges."
                />
              ) : (
                messages.map((message) => (
                  <Message key={message.id} from={message.role}>
                    <MessageContent>
                      <MessageResponse>{message.content}</MessageResponse>
                    </MessageContent>
                  </Message>
                ))
              )}
            </ConversationContent>
            <ConversationScrollButton />
          </Conversation>
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex shrink-0 flex-col gap-3 border-t p-4"
        >
          <Textarea
            placeholder="Example: Build an order fulfillment context model with customer, order, and shipment."
            value={requirement}
            onChange={(event) => {
              const target = event.target as ValueTarget;
              setRequirement(target.value ?? '');
            }}
            disabled={isSubmitting}
            className="min-h-24 resize-y"
            aria-label="Model requirement"
          />
          {error ? (
            <p className="text-destructive text-sm" role="alert">
              {error}
            </p>
          ) : null}
          <Button type="submit" disabled={!canSubmit}>
            {isSubmitting ? <Spinner className="size-4" /> : null}
            Propose Model
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
