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
import {
  Diagram,
  DiagramEdge,
  DiagramNode,
} from '@shared/schema';
import { Edge, Node } from '@xyflow/react';
import { parse as parseBestEffortJson } from 'best-effort-json-parser';
import { Settings2 } from 'lucide-react';
import { FormEvent, useCallback, useMemo, useState } from 'react';
import {
  buildOptimisticDraftPreview,
  DraftApplyPayload,
  OptimisticDraftPreview,
} from './draft-utils';

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
  isSavingDraft?: boolean;
  onDraftApplyOptimistic?: (payload: DraftApplyPayload) => void;
  onDraftApplyReverted?: () => void;
}

interface UseProposeModelDraftOptions {
  onDraftApplyOptimistic?: (payload: DraftApplyPayload) => void;
  onDraftApplyReverted?: () => void;
}

interface UseProposeModelDraftResult {
  optimisticNodes: Node<CanvasNodeData>[];
  optimisticEdges: Edge[];
  handleDraftApplyOptimistic: (payload: DraftApplyPayload) => void;
  handleDraftApplyReverted: () => void;
}

type CanvasNodeData = Omit<DiagramNode['data'], 'localData'> & {
  localData: Record<string, unknown> | null;
};

type DraftLogicalEntityType =
  DiagramNode['data']['localData']['type'];

type ProposeModelStreamEvent =
  | {
      type: 'chunk';
      content: string;
    }
  | {
      type: 'error';
      message: string;
    }
  | {
      type: 'complete';
    };

type SseEnvelope = {
  event: string | null;
  data: string | null;
};

function parseSseEnvelope(eventBlock: string): SseEnvelope {
  const lines = eventBlock.split('\n');
  let eventName: string | null = null;
  const dataLines = lines
    .filter((line) => !line.startsWith(':'))
    .map((line) => line.trimEnd());

  for (const line of dataLines) {
    if (line.startsWith('event:')) {
      const value = line.slice(6).trim();
      eventName = value.length > 0 ? value : null;
    }
  }

  const payloadLines = dataLines
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trimStart());

  return {
    event: eventName,
    data: payloadLines.length > 0 ? payloadLines.join('\n') : null,
  };
}

function parseStreamEvent(envelope: SseEnvelope): ProposeModelStreamEvent | null {
  const { event, data } = envelope;

  if (!event || event === 'message') {
    if (data == null) {
      return null;
    }
    return { type: 'chunk', content: data };
  }

  if (event === 'error') {
    return { type: 'error', message: data ?? '模型提议失败' };
  }
  if (event === 'complete') {
    return { type: 'complete' };
  }
  return null;
}

function getDefaultDraftNodePosition(index: number): { x: number; y: number } {
  return {
    x: 120 + (index % 3) * 300,
    y: 120 + Math.floor(index / 3) * 180,
  };
}

function normalizeDraftNode(
  entry: unknown,
  index: number,
): DiagramNode['data'] | null {
  if (!entry || typeof entry !== 'object') {
    return null;
  }

  const raw = entry as {
    id?: unknown;
    type?: unknown;
    logicalEntity?: unknown;
    parent?: unknown;
    positionX?: unknown;
    positionY?: unknown;
    width?: unknown;
    height?: unknown;
    localData?: unknown;
  };

  const localData = raw.localData;
  if (!localData || typeof localData !== 'object') {
    return null;
  }

  const localDataRaw = localData as {
    id?: unknown;
    type?: unknown;
    subType?: unknown;
    name?: unknown;
    label?: unknown;
    definition?: unknown;
  };

  const name = localDataRaw.name;
  const label = localDataRaw.label;
  const normalizedType = normalizeDraftLogicalEntityType(localDataRaw.type);
  if (typeof name !== 'string' || typeof label !== 'string' || !normalizedType) {
    return null;
  }

  const position = getDefaultDraftNodePosition(index);
  return {
    id: typeof raw.id === 'string' ? raw.id : `node-${index + 1}`,
    type: typeof raw.type === 'string' ? raw.type : 'fulfillment-node',
    logicalEntity: normalizeRef(raw.logicalEntity),
    parent: normalizeRef(raw.parent),
    positionX: typeof raw.positionX === 'number' ? raw.positionX : position.x,
    positionY: typeof raw.positionY === 'number' ? raw.positionY : position.y,
    width: typeof raw.width === 'number' ? raw.width : 220,
    height: typeof raw.height === 'number' ? raw.height : 120,
    localData: {
      id:
        typeof localDataRaw.id === 'string'
          ? localDataRaw.id
          : `draft-entity-${index + 1}`,
      type: normalizedType,
      subType: normalizeDraftSubType(normalizedType, localDataRaw.subType),
      name,
      label,
      definition: normalizeDraftDefinition(localDataRaw.definition),
    },
  };
}

function normalizeDraftEdge(
  entry: unknown,
  index: number,
): DiagramEdge['data'] | null {
  if (!entry || typeof entry !== 'object') {
    return null;
  }

  const raw = entry as {
    id?: unknown;
    sourceNode?: unknown;
    targetNode?: unknown;
    sourceHandle?: unknown;
    targetHandle?: unknown;
    relationType?: unknown;
    label?: unknown;
    styleProps?: unknown;
  };

  const sourceNode = normalizeRef(raw.sourceNode);
  const targetNode = normalizeRef(raw.targetNode);
  if (!sourceNode || !targetNode) {
    return null;
  }

  return {
    id: typeof raw.id === 'string' ? raw.id : `edge-${index + 1}`,
    sourceNode,
    targetNode,
    sourceHandle: typeof raw.sourceHandle === 'string' ? raw.sourceHandle : null,
    targetHandle: typeof raw.targetHandle === 'string' ? raw.targetHandle : null,
    relationType:
      typeof raw.relationType === 'string'
        ? (raw.relationType as DiagramEdge['data']['relationType'])
        : null,
    label: typeof raw.label === 'string' ? raw.label : null,
    styleProps: normalizeDraftStyleProps(raw.styleProps),
  };
}

function normalizeDraft(
  value: unknown,
): {
  nodes: DiagramNode['data'][];
  edges: DiagramEdge['data'][];
} | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const raw = value as {
    nodes?: unknown;
    edges?: unknown;
  };

  if (!Array.isArray(raw.nodes) && !Array.isArray(raw.edges)) {
    return null;
  }

  const nodes: DiagramNode['data'][] = Array.isArray(raw.nodes)
    ? raw.nodes.flatMap((entry, index) => {
        const node = normalizeDraftNode(entry, index);
        return node ? [node] : [];
      })
    : [];

  const edges: DiagramEdge['data'][] = Array.isArray(raw.edges)
    ? raw.edges.flatMap((entry, index) => {
        const edge = normalizeDraftEdge(entry, index);
        return edge ? [edge] : [];
      })
    : [];

  return { nodes, edges };
}

function tryParseDraft(
  jsonText: string,
): {
  nodes: DiagramNode['data'][];
  edges: DiagramEdge['data'][];
} | null {
  try {
    return normalizeDraft(parseBestEffortJson(jsonText));
  } catch {
    return null;
  }
}

function normalizeDraftLogicalEntityType(
  type: unknown,
): DraftLogicalEntityType | null {
  if (typeof type !== 'string') {
    return null;
  }

  switch (type.trim().toUpperCase()) {
    case 'EVIDENCE':
      return 'EVIDENCE';
    case 'PARTICIPANT':
      return 'PARTICIPANT';
    case 'ROLE':
      return 'ROLE';
    case 'CONTEXT':
      return 'CONTEXT';
    default:
      return null;
  }
}

function normalizeDraftSubType(
  type: DraftLogicalEntityType,
  subType: unknown,
): DiagramNode['data']['localData']['subType'] {
  if (typeof subType === 'string') {
    return subType as DiagramNode['data']['localData']['subType'];
  }
  switch (type) {
    case 'EVIDENCE':
      return 'other_evidence';
    case 'PARTICIPANT':
      return 'party';
    case 'ROLE':
      return 'party_role';
    case 'CONTEXT':
      return 'bounded_context';
  }
}

function normalizeDraftDefinition(
  definition: unknown,
): DiagramNode['data']['localData']['definition'] {
  if (!definition || typeof definition !== 'object') {
    return {};
  }
  return definition as DiagramNode['data']['localData']['definition'];
}

function normalizeDraftStyleProps(
  styleProps: unknown,
): DiagramEdge['data']['styleProps'] {
  if (!styleProps || typeof styleProps !== 'object') {
    return null;
  }
  const raw = styleProps as {
    lineStyle?: unknown;
    color?: unknown;
    arrowType?: unknown;
    lineWidth?: unknown;
  };
  if (
    typeof raw.lineStyle !== 'string' ||
    typeof raw.color !== 'string' ||
    typeof raw.arrowType !== 'string' ||
    typeof raw.lineWidth !== 'number'
  ) {
    return null;
  }
  return {
    lineStyle: raw.lineStyle,
    color: raw.color,
    arrowType: raw.arrowType,
    lineWidth: raw.lineWidth,
  };
}

function normalizeRef(value: unknown): { id: string } | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const id = (value as { id?: unknown }).id;
  return typeof id === 'string' ? { id } : null;
}

export function useProposeModelDraft({
  onDraftApplyOptimistic,
  onDraftApplyReverted,
}: UseProposeModelDraftOptions): UseProposeModelDraftResult {
  const [optimisticPreview, setOptimisticPreview] =
    useState<OptimisticDraftPreview | null>(null);

  const handleDraftApplyOptimistic = useCallback(
    (payload: DraftApplyPayload) => {
      onDraftApplyOptimistic?.(payload);
      setOptimisticPreview(payload.preview);
    },
    [onDraftApplyOptimistic],
  );

  const handleDraftApplyReverted = useCallback(() => {
    onDraftApplyReverted?.();
    setOptimisticPreview(null);
  }, [onDraftApplyReverted]);

  const optimisticNodes = useMemo<Node<CanvasNodeData>[]>(
    () =>
      optimisticPreview?.nodes.map((node) => ({
        id: node.id,
        type: node.type,
        position: {
          x: node.positionX,
          y: node.positionY,
        },
        data: {
          ...node,
          localData: node.localData as Record<string, unknown> | null,
        },
      })) ?? [],
    [optimisticPreview],
  );

  const optimisticEdges = useMemo<Edge[]>(
    () =>
      optimisticPreview?.edges.map((edge) => ({
        id: edge.id,
        source: edge.sourceNode.id,
        target: edge.targetNode.id,
        animated: true,
      })) ?? [],
    [optimisticPreview],
  );

  return {
    optimisticNodes,
    optimisticEdges,
    handleDraftApplyOptimistic,
    handleDraftApplyReverted,
  };
}

export function ProposeModelPanelTool({
  state,
  isSavingDraft = false,
  onDraftApplyOptimistic,
  onDraftApplyReverted,
}: Props) {
  const [requirement, setRequirement] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string>();

  const canSubmit = useMemo(
    () => requirement.trim().length > 0 && !isSubmitting && !isSavingDraft,
    [requirement, isSubmitting, isSavingDraft],
  );

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedRequirement = requirement.trim();
    if (!trimmedRequirement || isSubmitting || isSavingDraft) {
      return;
    }

    if (!state.hasLink('propose-model')) {
      setError('当前图表未提供 propose-model 操作。');
      return;
    }

    const proposeModelAction = state.action('propose-model');
    const payload = { requirement: trimmedRequirement };

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
      const result = await proposeModelAction.submit(payload);

      const stream = result.data;
      if (
        !stream ||
        typeof (stream as { getReader?: unknown }).getReader !== 'function'
      ) {
        throw new Error('模型提议接口未返回流式响应。');
      }

      const reader = stream.getReader();
      const decoder = new TextDecoder();
      let sseBuffer = '';
      let draftJsonBuffer = '';
      let latestDraft: {
        nodes: DiagramNode['data'][];
        edges: DiagramEdge['data'][];
      } | null = null;
      let streamCompleted = false;

      const syncDraftPreview = () => {
        const parsed = tryParseDraft(draftJsonBuffer);
        if (!parsed || parsed.nodes.length === 0) {
          return;
        }
        latestDraft = parsed;
        const preview = buildOptimisticDraftPreview(parsed);
        onDraftApplyOptimistic?.({
          draft: parsed,
          preview,
        });
      };

      const processSseEvent = (eventBlock: string) => {
        const streamEvent = parseStreamEvent(parseSseEnvelope(eventBlock));
        if (!streamEvent) {
          return;
        }

        if (streamEvent.type === 'chunk') {
          draftJsonBuffer += streamEvent.content;
          syncDraftPreview();
          return;
        }

        if (streamEvent.type === 'error') {
          throw new Error(streamEvent.message);
        }

        streamCompleted = true;
      };

      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }

        sseBuffer += decoder
          .decode(value, { stream: true })
          .replace(/\r\n/g, '\n')
          .replace(/\r/g, '\n');

        let eventSeparatorIndex = sseBuffer.indexOf('\n\n');
        while (eventSeparatorIndex >= 0) {
          const eventBlock = sseBuffer.slice(0, eventSeparatorIndex).trim();
          sseBuffer = sseBuffer.slice(eventSeparatorIndex + 2);
          if (eventBlock.length > 0) {
            processSseEvent(eventBlock);
          }
          eventSeparatorIndex = sseBuffer.indexOf('\n\n');
        }
      }

      const finalChunk = decoder.decode().replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      if (finalChunk) {
        sseBuffer += finalChunk;
      }
      if (sseBuffer.trim().length > 0) {
        processSseEvent(sseBuffer.trim());
      }

      if (!latestDraft) {
        const parsed = tryParseDraft(draftJsonBuffer);
        if (parsed) {
          latestDraft = parsed;
        }
      }
      if (!latestDraft) {
        throw new Error('模型响应不是有效的草稿图 JSON。');
      }
      if (!streamCompleted) {
        throw new Error('模型流式响应异常中断。');
      }

      const preview = buildOptimisticDraftPreview(latestDraft);
      onDraftApplyOptimistic?.({
        draft: latestDraft,
        preview,
      });
      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-complete-${Date.now()}`,
          role: 'assistant',
          content: '草稿已生成，画布已更新。',
        },
      ]);
    } catch (e) {
      onDraftApplyReverted?.();
      const message = e instanceof Error ? e.message : '模型提议失败';
      setError(message);
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
          <SheetTitle>模型助手</SheetTitle>
          <SheetDescription>
            描述你的需求，生成领域模型草稿。
          </SheetDescription>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col border-t">
          <Conversation className="min-h-0 flex-1">
            <ConversationContent className="gap-4 px-4 py-4">
              {messages.length === 0 && !isSubmitting ? (
                <ConversationEmptyState
                  title="暂无模型提议"
                  description="在下方输入需求后，可自动提议节点与连线。"
                />
              ) : (
                <>
                  {messages.map((message) => (
                    <Message key={message.id} from={message.role}>
                      <MessageContent>
                        <MessageResponse>{message.content}</MessageResponse>
                      </MessageContent>
                    </Message>
                  ))}
                  {isSubmitting ? (
                    <Message key="assistant-loading" from="assistant">
                      <MessageContent>
                        <div className="text-muted-foreground flex items-center gap-2 text-sm">
                          <Spinner className="size-4" />
                          正在生成草稿并更新画布...
                        </div>
                      </MessageContent>
                    </Message>
                  ) : null}
                </>
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
            placeholder="示例：构建一个包含客户、订单、发货的履约上下文模型。"
            value={requirement}
            onChange={(event) => {
              const target = event.target as ValueTarget;
              setRequirement(target.value ?? '');
            }}
            disabled={isSubmitting || isSavingDraft}
            className="min-h-24 resize-y"
            aria-label="模型需求"
          />
          {error ? (
            <p className="text-destructive text-sm" role="alert">
              {error}
            </p>
          ) : null}
          <Button type="submit" disabled={!canSubmit}>
            {isSubmitting ? <Spinner className="size-4" /> : null}
            生成模型
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
