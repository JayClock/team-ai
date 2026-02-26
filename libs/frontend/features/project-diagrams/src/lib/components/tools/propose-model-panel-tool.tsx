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
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  Spinner,
} from '@shared/ui';
import { State } from '@hateoas-ts/resource';
import {
  StandardSseChatTransport,
  StandardStructuredDataPayload,
} from '@shared/util-http';
import { Diagram } from '@shared/schema';
import { Settings2 } from 'lucide-react';
import { useSignal } from '@preact/signals-react';
import { parse as parseBestEffortJson } from 'best-effort-json-parser';
import type { DraftDiagramInput } from '../create-diagram-store';

interface Props {
  state: State<Diagram>;
  onDraftGenerated: (draft: DraftDiagramInput) => void;
}

type ProposeModelDataTypes = {
  structured: StandardStructuredDataPayload;
};

type ProposeModelChatMessage = UIMessage<unknown, ProposeModelDataTypes>;

function extractJsonFromMarkdown(input: string): string {
  const match = input.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return match?.[1]?.trim() ?? input;
}

function toDraftDiagramInput(value: unknown): DraftDiagramInput {
  if (!value || typeof value !== 'object') {
    return { nodes: [], edges: [] };
  }

  const candidate = value as { nodes?: unknown; edges?: unknown };
  return {
    nodes: Array.isArray(candidate.nodes) ? candidate.nodes : [],
    edges: Array.isArray(candidate.edges) ? candidate.edges : [],
  };
}

function parseDraftByBestEffort(jsonText: string): DraftDiagramInput {
  const trimmed = jsonText.trim();
  if (!trimmed) {
    return { nodes: [], edges: [] };
  }

  const normalized = extractJsonFromMarkdown(trimmed);

  try {
    return toDraftDiagramInput(JSON.parse(normalized));
  } catch {
    // Fall through to tolerant parsing when model output is not strict JSON.
  }

  try {
    return toDraftDiagramInput(parseBestEffortJson(normalized));
  } catch {
    return { nodes: [], edges: [] };
  }
}

export function ProposeModelPanelTool({
  state,
  onDraftGenerated,
}: Props) {
  const isSubmitting = useSignal(false);
  const error = useSignal<string>();
  const structuredDraftJsonSignal = useSignal('');

  const proposeModelApi = state.hasLink('propose-model')
    ? state.action('propose-model').uri
    : undefined;

  const { messages, sendMessage } = useChat<ProposeModelChatMessage>({
    transport: new StandardSseChatTransport({
      api: proposeModelApi,
      includeCredentials: true,
      prepareSendMessagesRequest: ({ body }) => {
        const nextRequirement =
          typeof body?.['requirement'] === 'string' ? body.requirement : '';
        return {
          body: {
            requirement: nextRequirement,
          },
        };
      },
    }),
    onData: (part) => {
      if (part.type !== 'data-structured') {
        return;
      }
      if (part.data.kind !== 'diagram-model' || part.data.format !== 'json') {
        return;
      }

      structuredDraftJsonSignal.value += part.data.chunk;
    },
    onFinish: () => {
      const draft = parseDraftByBestEffort(structuredDraftJsonSignal.value);
      onDraftGenerated(draft);
    },
  });

  const handleSubmit = async ({ text }: { text: string }) => {
    const trimmedRequirement = text.trim();
    if (!trimmedRequirement || isSubmitting.value) {
      return;
    }

    if (!proposeModelApi) {
      error.value = '当前图表未提供 propose-model 操作。';
      return;
    }

    isSubmitting.value = true;
    error.value = undefined;
    structuredDraftJsonSignal.value = '';

    try {
      await sendMessage(
        { text: trimmedRequirement },
        {
          body: {
            requirement: trimmedRequirement,
          },
        },
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : '模型提议失败';
      error.value = message;
    } finally {
      isSubmitting.value = false;
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
              {messages.length === 0 && !isSubmitting.value ? (
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
                  {isSubmitting.value ? (
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

        <div className="shrink-0 border-t p-4"
        >
          <PromptInput onSubmit={handleSubmit}>
            <PromptInputBody>
              <PromptInputTextarea
                placeholder="示例：构建一个包含客户、订单、发货的履约上下文模型。"
                disabled={isSubmitting.value}
                className="min-h-24 resize-y"
                aria-label="模型需求"
              />
            </PromptInputBody>
            <PromptInputFooter>
              <PromptInputTools />
              <PromptInputSubmit
                status={isSubmitting.value ? 'submitted' : undefined}
                disabled={!proposeModelApi}
              />
            </PromptInputFooter>
          </PromptInput>
          {error.value ? (
            <p className="text-destructive text-sm" role="alert">
              {error.value}
            </p>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
