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
  onDraftApplied?: () => void;
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

function getCreatedId(data: unknown): string | undefined {
  if (typeof data !== 'object' || data === null) {
    return undefined;
  }
  const id = (data as { id?: unknown }).id;
  return typeof id === 'string' && id.length > 0 ? id : undefined;
}

function toNodeReferenceKeys(
  node: DraftDiagramModel['data']['nodes'][number],
  index: number,
): string[] {
  const keys = new Set<string>();
  keys.add(`node-${index + 1}`);
  keys.add(`node_${index + 1}`);
  keys.add(String(index + 1));
  if (node.localData.name) {
    keys.add(node.localData.name);
  }
  if (node.localData.label) {
    keys.add(node.localData.label);
  }
  return Array.from(keys);
}

export function SettingsTool({ state, onDraftApplied }: Props) {
  const [requirement, setRequirement] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [error, setError] = useState<string>();
  const [latestDraft, setLatestDraft] = useState<DraftDiagramModel['data']>();

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

      setLatestDraft(result.data);
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

  const handleApplyDraft = async () => {
    if (!latestDraft || isApplying) {
      return;
    }

    if (!state.hasLink('project') || !state.hasLink('nodes') || !state.hasLink('edges')) {
      setError('Current diagram is missing required links for draft apply.');
      return;
    }

    setIsApplying(true);
    setError(undefined);

    try {
      const projectState = await state.follow('project').get();
      const nodeIdByDraftRef = new Map<string, string>();
      const createdNodeIds: string[] = [];

      for (let index = 0; index < latestDraft.nodes.length; index += 1) {
        const draftNode = latestDraft.nodes[index];
        const fallbackName = `entity_${index + 1}`;
        const name = draftNode.localData.name?.trim() || fallbackName;
        const label = draftNode.localData.label?.trim() || name;

        const createdLogicalEntity = await projectState
          .follow('logical-entities')
          .post({
            data: {
              type: draftNode.localData.type,
              name,
              label,
            },
          });

        const logicalEntityId = getCreatedId(createdLogicalEntity.data);
        if (!logicalEntityId) {
          throw new Error('Failed to create logical entity for draft node.');
        }

        const column = index % 3;
        const row = Math.floor(index / 3);

        const createdNode = await state.follow('nodes').post({
          data: {
            type: 'fulfillment-node',
            logicalEntityId,
            positionX: 120 + column * 300,
            positionY: 120 + row * 180,
            width: 220,
            height: 120,
          },
        });

        const createdNodeId = getCreatedId(createdNode.data);
        if (!createdNodeId) {
          throw new Error('Failed to create diagram node for draft node.');
        }

        createdNodeIds.push(createdNodeId);
        for (const key of toNodeReferenceKeys(draftNode, index)) {
          nodeIdByDraftRef.set(key, createdNodeId);
        }
      }

      const resolveNodeId = (draftRefId: string): string | undefined => {
        const direct = nodeIdByDraftRef.get(draftRefId);
        if (direct) {
          return direct;
        }

        const match = draftRefId.match(/node[-_]?(\d+)/i);
        if (!match) {
          return undefined;
        }

        const index = Number(match[1]) - 1;
        return index >= 0 ? createdNodeIds[index] : undefined;
      };

      let createdEdges = 0;
      let skippedEdges = 0;

      for (const draftEdge of latestDraft.edges) {
        const sourceNodeId = resolveNodeId(draftEdge.sourceNode.id);
        const targetNodeId = resolveNodeId(draftEdge.targetNode.id);

        if (!sourceNodeId || !targetNodeId) {
          skippedEdges += 1;
          continue;
        }

        await state.follow('edges').post({
          data: {
            sourceNodeId,
            targetNodeId,
          },
        });
        createdEdges += 1;
      }

      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-apply-${Date.now()}`,
          role: 'assistant',
          content: `Applied draft to canvas.\n\n- Created nodes: ${createdNodeIds.length}\n- Created edges: ${createdEdges}\n- Skipped edges: ${skippedEdges}`,
        },
      ]);

      onDraftApplied?.();
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to apply draft';
      setError(message);
      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-apply-error-${Date.now()}`,
          role: 'assistant',
          content: `Apply to canvas failed: ${message}`,
        },
      ]);
    } finally {
      setIsApplying(false);
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
            disabled={isSubmitting || isApplying}
            className="min-h-24 resize-y"
            aria-label="Model requirement"
          />
          {error ? (
            <p className="text-destructive text-sm" role="alert">
              {error}
            </p>
          ) : null}
          <Button type="submit" disabled={!canSubmit || isApplying}>
            {isSubmitting ? <Spinner className="size-4" /> : null}
            Propose Model
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!latestDraft || isSubmitting || isApplying}
            onClick={handleApplyDraft}
          >
            {isApplying ? <Spinner className="size-4" /> : null}
            Apply Draft to Canvas
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
