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
import { Diagram, DiagramEdge, DiagramNode } from '@shared/schema';
import { Edge, Node } from '@xyflow/react';
import { Settings2 } from 'lucide-react';
import {
  FormEvent,
  useCallback,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  buildOptimisticDraftPreview,
  DraftApplyPayload,
  OptimisticDraftPreview,
} from './draft-utils';
import { parse as parseBestEffortJson } from 'best-effort-json-parser';

type ValueTarget = {
  value?: string;
};

interface Props {
  state: State<Diagram>;
  isSavingDraft?: boolean;
  onDraftApplyOptimistic?: (draft: DraftGraphData) => void;
  onDraftApplyReverted?: () => void;
}

interface UseProposeModelDraftOptions {
  onDraftApplyOptimistic?: (payload: DraftApplyPayload) => void;
  onDraftApplyReverted?: () => void;
}

interface UseProposeModelDraftResult {
  optimisticNodes: Node<CanvasNodeData>[];
  optimisticEdges: Edge[];
  handleDraftApplyOptimistic: (draft: DraftGraphData) => void;
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

function extractLatestStructuredDraftJson(
  messages: ProposeModelChatMessage[],
): string {
  for (
    let messageIndex = messages.length - 1;
    messageIndex >= 0;
    messageIndex -= 1
  ) {
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

function parseDraftByBestEffort(jsonText: string): DraftGraphData | null {
  if (!jsonText.trim()) {
    return null;
  }

  try {
    return parseBestEffortJson(jsonText) as DraftGraphData;
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
    (draft: DraftGraphData) => {
      const payload: DraftApplyPayload = {
        draft,
        preview: buildOptimisticDraftPreview(draft),
      };
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
  const messagesRef = useRef<ProposeModelChatMessage[]>([]);

  const proposeModelApi = state.hasLink('propose-model')
    ? state.action('propose-model').uri
    : undefined;

  const { messages, sendMessage } = useChat<ProposeModelChatMessage>({
    transport: new StandardSseChatTransport({
      api: proposeModelApi,
      includeCredentials: true,
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
  messagesRef.current = messages;

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

    if (!proposeModelApi) {
      setError('当前图表未提供 propose-model 操作。');
      return;
    }

    setIsSubmitting(true);
    setError(undefined);
    setRequirement('');
    onDraftApplyReverted?.();

    try {
      await sendMessage({ text: trimmedRequirement });
      const structuredDraftJson = extractLatestStructuredDraftJson(
        messagesRef.current,
      );
      const draft = parseDraftByBestEffort(structuredDraftJson);
      if (!draft) {
        return;
      }

      onDraftApplyOptimistic?.(draft);
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
          <SheetDescription>描述你的需求，生成领域模型草稿。</SheetDescription>
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
