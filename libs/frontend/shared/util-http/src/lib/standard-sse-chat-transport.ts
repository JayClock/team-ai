import {
  HttpChatTransport,
  HttpChatTransportInitOptions,
  UIMessage,
  UIMessageChunk,
} from 'ai';

type SseEnvelope = {
  event: string | null;
  data: string | null;
};

type SseDataEventParsers = Record<string, (payload: string) => unknown>;

export type StandardStructuredDataPayload = {
  kind: string;
  format: string;
  chunk: string;
};

export interface StandardSseChatTransportInitOptions<
  UI_MESSAGE extends UIMessage,
> extends HttpChatTransportInitOptions<UI_MESSAGE> {
  dataEventParsers?: SseDataEventParsers;
}

export function parseStandardStructuredDataPayload(
  payload: string,
): StandardStructuredDataPayload {
  const parsed = JSON.parse(payload);
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid structured payload.');
  }

  const raw = parsed as {
    kind?: unknown;
    format?: unknown;
    chunk?: unknown;
  };

  if (
    typeof raw.kind !== 'string' ||
    typeof raw.format !== 'string' ||
    typeof raw.chunk !== 'string'
  ) {
    throw new Error('Invalid structured payload shape.');
  }

  return {
    kind: raw.kind,
    format: raw.format,
    chunk: raw.chunk,
  };
}

const DEFAULT_SSE_DATA_EVENT_PARSERS: SseDataEventParsers = {
  structured: parseStandardStructuredDataPayload,
};

function normalizeLineEndings(input: string): string {
  return input.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function parseSseEnvelope(eventBlock: string): SseEnvelope {
  const lines = eventBlock.split('\n');
  let eventName: string | null = null;
  const dataLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith(':')) {
      continue;
    }
    if (line.startsWith('event:')) {
      const value = line.slice(6).trim();
      eventName = value.length > 0 ? value : null;
      continue;
    }
    if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trimStart());
    }
  }

  return {
    event: eventName,
    data: dataLines.length > 0 ? dataLines.join('\n') : null,
  };
}

export class StandardSseChatTransport<
  UI_MESSAGE extends UIMessage,
> extends HttpChatTransport<UI_MESSAGE> {
  private readonly dataEventParsers: SseDataEventParsers;

  constructor(options: StandardSseChatTransportInitOptions<UI_MESSAGE> = {}) {
    const { dataEventParsers = {}, ...transportOptions } = options;
    super(transportOptions);
    this.dataEventParsers = {
      ...DEFAULT_SSE_DATA_EVENT_PARSERS,
      ...dataEventParsers,
    };
  }

  protected processResponseStream(
    stream: ReadableStream<Uint8Array<ArrayBufferLike>>,
  ): ReadableStream<UIMessageChunk> {
    const textPartId = 'text-1';
    const decoder = new TextDecoder();
    let buffer = '';
    let completed = false;

    const processEvent = (
      eventBlock: string,
      controller: TransformStreamDefaultController<UIMessageChunk>,
    ) => {
      const envelope = parseSseEnvelope(eventBlock);

      if (envelope.event === 'error') {
        throw new Error(envelope.data ?? 'Chat stream error');
      }

      if (envelope.event === 'complete') {
        completed = true;
        return;
      }

      if (!envelope.event || envelope.event === 'message') {
        if (envelope.data != null && envelope.data.length > 0) {
          controller.enqueue({
            type: 'text-delta',
            id: textPartId,
            delta: envelope.data,
          });
        }
        return;
      }

      const parser = this.dataEventParsers[envelope.event];
      if (parser && envelope.data != null) {
        controller.enqueue({
          type: `data-${envelope.event}` as `data-${string}`,
          data: parser(envelope.data),
        } as UIMessageChunk);
      }
    };

    return stream.pipeThrough(
      new TransformStream<Uint8Array<ArrayBufferLike>, UIMessageChunk>({
        start(controller) {
          controller.enqueue({ type: 'start' });
          controller.enqueue({ type: 'start-step' });
          controller.enqueue({ type: 'text-start', id: textPartId });
        },
        transform(chunk, controller) {
          if (completed) {
            return;
          }

          buffer += normalizeLineEndings(decoder.decode(chunk, { stream: true }));

          let separatorIndex = buffer.indexOf('\n\n');
          while (separatorIndex >= 0) {
            const eventBlock = buffer.slice(0, separatorIndex).trim();
            buffer = buffer.slice(separatorIndex + 2);

            if (eventBlock.length > 0) {
              processEvent(eventBlock, controller);
            }

            separatorIndex = buffer.indexOf('\n\n');
          }
        },
        flush(controller) {
          const finalChunk = decoder.decode();
          if (!completed && finalChunk.length > 0) {
            buffer += normalizeLineEndings(finalChunk);
          }

          if (!completed) {
            const finalBlock = buffer.trim();
            if (finalBlock.length > 0) {
              processEvent(finalBlock, controller);
            }
          }

          if (!completed) {
            throw new Error('Chat stream interrupted before complete event');
          }

          controller.enqueue({ type: 'text-end', id: textPartId });
          controller.enqueue({ type: 'finish-step' });
          controller.enqueue({ type: 'finish', finishReason: 'stop' });
        },
      }),
    );
  }
}
