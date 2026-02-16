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
import { Diagram, DiagramNode, DraftDiagramModel } from '@shared/schema';
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

function normalizeDraft(value: unknown): DraftDiagramModel['data'] | null {
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

  const nodes: DraftDiagramModel['data']['nodes'] = Array.isArray(raw.nodes)
    ? raw.nodes.flatMap((entry) => {
        if (!entry || typeof entry !== 'object') {
          return [];
        }
        const localData = (entry as { localData?: unknown }).localData;
        if (!localData || typeof localData !== 'object') {
          return [];
        }

        const name = (localData as { name?: unknown }).name;
        const label = (localData as { label?: unknown }).label;
        const type = (localData as { type?: unknown }).type;

        if (
          typeof name !== 'string' ||
          typeof label !== 'string' ||
          typeof type !== 'string'
        ) {
          return [];
        }

        return [
          {
            localData: {
              name,
              label,
              type: type as DraftDiagramModel['data']['nodes'][number]['localData']['type'],
            },
          },
        ];
      })
    : [];

  const edges: DraftDiagramModel['data']['edges'] = Array.isArray(raw.edges)
    ? raw.edges.flatMap((entry) => {
        if (!entry || typeof entry !== 'object') {
          return [];
        }
        const sourceNode = (entry as { sourceNode?: unknown }).sourceNode;
        const targetNode = (entry as { targetNode?: unknown }).targetNode;
        if (
          !sourceNode ||
          typeof sourceNode !== 'object' ||
          !targetNode ||
          typeof targetNode !== 'object'
        ) {
          return [];
        }

        const sourceNodeId = (sourceNode as { id?: unknown }).id;
        const targetNodeId = (targetNode as { id?: unknown }).id;
        if (typeof sourceNodeId !== 'string' || typeof targetNodeId !== 'string') {
          return [];
        }

        return [
          {
            sourceNode: { id: sourceNodeId },
            targetNode: { id: targetNodeId },
          },
        ];
      })
    : [];

  return { nodes, edges };
}

function tryParseDraft(jsonText: string): DraftDiagramModel['data'] | null {
  try {
    return normalizeDraft(parseBestEffortJson(jsonText));
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
        type: 'fulfillment-node',
        position: {
          x: node.positionX,
          y: node.positionY,
        },
        data: {
          id: node.id,
          type: 'fulfillment-node',
          logicalEntity: null,
          parent: null,
          positionX: node.positionX,
          positionY: node.positionY,
          width: 220,
          height: 120,
          localData: node.localData,
        },
      })) ?? [],
    [optimisticPreview],
  );

  const optimisticEdges = useMemo<Edge[]>(
    () =>
      optimisticPreview?.edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
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
      let latestDraft: DraftDiagramModel['data'] | null = null;
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
