import { UIMessage, useChat } from '@ai-sdk/react';
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
  StandardSseChatTransport,
  StandardStructuredDataPayload,
} from '@shared/util-http';
import {
  Diagram,
  DiagramEdge,
  DiagramNode,
} from '@shared/schema';
import { Edge, Node } from '@xyflow/react';
import { Settings2 } from 'lucide-react';
import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  buildOptimisticDraftPreview,
  DraftApplyPayload,
  OptimisticDraftPreview,
} from './draft-utils';

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

type ProposeModelDataTypes = {
  structured: StandardStructuredDataPayload;
};

type ProposeModelChatMessage = UIMessage<unknown, ProposeModelDataTypes>;

type DraftGraphData = {
  nodes: DiagramNode['data'][];
  edges: DiagramEdge['data'][];
};

const API_KEY_STORAGE_KEY = 'api-key';
const MODEL_STORAGE_KEY = 'ai-model';
const API_KEY_HEADER = 'X-Api-Key';
const MODEL_HEADER = 'X-AI-Model';

type StorageLike = {
  getItem(key: string): string | null;
};

function getBrowserStorage(): StorageLike | null {
  const scope = globalThis as { localStorage?: StorageLike };
  return scope.localStorage ?? null;
}

function withAiSettingsAndCredentialsInterceptor(fetcher: typeof fetch = fetch) {
  return async (
    input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1],
  ) => {
    const requestWithHeaders = new Request(input, {
      ...init,
      credentials: 'include',
    });

    const storage = getBrowserStorage();
    const apiKey = storage?.getItem(API_KEY_STORAGE_KEY);
    const model = storage?.getItem(MODEL_STORAGE_KEY);

    if (apiKey) {
      requestWithHeaders.headers.set(API_KEY_HEADER, apiKey);
    }
    if (model) {
      requestWithHeaders.headers.set(MODEL_HEADER, model);
    }

    return fetcher(requestWithHeaders);
  };
}

function getDefaultDraftNodePosition(index: number): { x: number; y: number } {
  return {
    x: 120 + (index % 3) * 300,
    y: 120 + Math.floor(index / 3) * 180,
  };
}

function normalizeDraftLogicalEntityType(
  type: unknown,
): DiagramNode['data']['localData']['type'] | null {
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
  type: DiagramNode['data']['localData']['type'],
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

function normalizeRef(value: unknown): { id: string } | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const id = (value as { id?: unknown }).id;
  return typeof id === 'string' ? { id } : null;
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

  const nodeId = typeof raw.id === 'string' ? raw.id.trim() : '';
  if (nodeId.length === 0) {
    return null;
  }

  if (!raw.localData || typeof raw.localData !== 'object') {
    return null;
  }

  const localData = raw.localData as {
    id?: unknown;
    type?: unknown;
    subType?: unknown;
    name?: unknown;
    label?: unknown;
    definition?: unknown;
  };

  if (typeof localData.name !== 'string' || typeof localData.label !== 'string') {
    return null;
  }

  const localDataType = normalizeDraftLogicalEntityType(localData.type);
  if (!localDataType) {
    return null;
  }

  const defaultPosition = getDefaultDraftNodePosition(index);
  const definition =
    localData.definition && typeof localData.definition === 'object'
      ? (localData.definition as DiagramNode['data']['localData']['definition'])
      : {};

  return {
    id: nodeId,
    type: typeof raw.type === 'string' ? raw.type : 'fulfillment-node',
    logicalEntity: normalizeRef(raw.logicalEntity),
    parent: normalizeRef(raw.parent),
    positionX: typeof raw.positionX === 'number' ? raw.positionX : defaultPosition.x,
    positionY: typeof raw.positionY === 'number' ? raw.positionY : defaultPosition.y,
    width: typeof raw.width === 'number' ? raw.width : 220,
    height: typeof raw.height === 'number' ? raw.height : 120,
    localData: {
      id:
        typeof localData.id === 'string'
          ? localData.id
          : `draft-entity-${index + 1}`,
      type: localDataType,
      subType: normalizeDraftSubType(localDataType, localData.subType),
      name: localData.name,
      label: localData.label,
      definition,
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

  const rawStyleProps = raw.styleProps;
  const styleProps =
    rawStyleProps && typeof rawStyleProps === 'object'
      ? (rawStyleProps as DiagramEdge['data']['styleProps'])
      : null;

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
    styleProps,
  };
}

function normalizeDraft(value: unknown): DraftGraphData | null {
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

function extractLatestStructuredDraftJson(
  messages: ProposeModelChatMessage[],
): string {
  for (let messageIndex = messages.length - 1; messageIndex >= 0; messageIndex -= 1) {
    const message = messages[messageIndex];
    if (message.role !== 'assistant') {
      continue;
    }

    const chunks: string[] = [];
    for (const part of message.parts) {
      if (part.type !== 'data-structured') {
        continue;
      }
      if (part.data.kind !== 'diagram-model' || part.data.format !== 'json') {
        continue;
      }
      chunks.push(part.data.chunk);
    }

    if (chunks.length > 0) {
      return chunks.join('');
    }
  }

  return '';
}

function tryParseDraft(jsonText: string): DraftGraphData | null {
  if (!jsonText.trim()) {
    return null;
  }

  try {
    return normalizeDraft(JSON.parse(jsonText));
  } catch {
    return null;
  }
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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string>();
  const lastAppliedDraftKeyRef = useRef<string | undefined>(undefined);

  const proposeModelApi = state.hasLink('propose-model')
    ? state.action('propose-model').uri
    : undefined;

  const { messages, sendMessage } = useChat<ProposeModelChatMessage>({
    transport: new StandardSseChatTransport({
      api: proposeModelApi,
      fetch: withAiSettingsAndCredentialsInterceptor(),
      prepareSendMessagesRequest: ({ messages }) => {
        const lastMessage = messages.at(-1);
        let nextRequirement = '';

        for (const part of lastMessage?.parts ?? []) {
          if (part.type === 'text') {
            nextRequirement += part.text;
          }
        }

        return {
          body: {
            requirement: nextRequirement,
          },
        };
      },
    }),
  });

  const canSubmit = useMemo(
    () => requirement.trim().length > 0 && !isSubmitting && !isSavingDraft,
    [requirement, isSubmitting, isSavingDraft],
  );

  useEffect(() => {
    if (!onDraftApplyOptimistic) {
      return;
    }

    const structuredDraftJson = extractLatestStructuredDraftJson(messages);
    const draft = tryParseDraft(structuredDraftJson);
    if (!draft) {
      return;
    }

    const key = JSON.stringify(draft);
    if (lastAppliedDraftKeyRef.current === key) {
      return;
    }

    lastAppliedDraftKeyRef.current = key;
    onDraftApplyOptimistic({
      draft,
      preview: buildOptimisticDraftPreview(draft),
    });
  }, [messages, onDraftApplyOptimistic]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedRequirement = requirement.trim();
    if (!trimmedRequirement || isSubmitting || isSavingDraft) {
      return;
    }

    if (!proposeModelApi) {
      setError('当前图表未提供 propose-model 操作。');
      return;
    }

    setIsSubmitting(true);
    setError(undefined);
    setRequirement('');
    lastAppliedDraftKeyRef.current = undefined;
    onDraftApplyReverted?.();

    try {
      await sendMessage({ text: trimmedRequirement });
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
                    <Message
                      key={message.id}
                      from={message.role === 'assistant' ? 'assistant' : 'user'}
                    >
                      <MessageContent>
                        {message.parts.map((part, index) => {
                          if (part.type !== 'text') {
                            return null;
                          }

                          return (
                            <MessageResponse key={`${message.id}-${index}`}>
                              {part.text}
                            </MessageResponse>
                          );
                        })}
                      </MessageContent>
                    </Message>
                  ))}
                  {isSubmitting ? (
                    <Message key="assistant-loading" from="assistant">
                      <MessageContent>
                        <div className="text-muted-foreground flex items-center gap-2 text-sm">
                          <Spinner className="size-4" />
                          正在读取 AI 输出...
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
