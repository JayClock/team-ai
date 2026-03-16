import type { UIMessage } from 'ai';
import { beforeEach, describe, expect, it } from 'vitest';
import { StandardSseChatTransport } from './standard-sse-chat-transport.js';

type StorageLike = {
  getItem(key: string): string | null;
};

type TestGlobal = typeof globalThis & {
  localStorage?: StorageLike;
};

const testGlobal = globalThis as TestGlobal;

function createSseResponse() {
  return new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('event: complete\n\n'));
        controller.close();
      },
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
      },
    },
  );
}

describe('StandardSseChatTransport', () => {
  beforeEach(() => {
    delete testGlobal.localStorage;
  });

  it('forwards the stored API key without sending the legacy model header', async () => {
    let capturedRequest: Request | undefined;
    testGlobal.localStorage = {
      getItem(key) {
        if (key === 'api-key') {
          return 'test-api-key';
        }
        if (key === 'ai-model') {
          return 'gpt-legacy';
        }
        return null;
      },
    };

    const transport = new StandardSseChatTransport<UIMessage>({
      api: 'http://localhost/api/chat',
      fetch: async (input, init) => {
        capturedRequest =
          input instanceof Request ? input : new Request(input, init);
        return createSseResponse();
      },
    });

    await transport.sendMessages({
      trigger: 'submit-message',
      chatId: 'chat-1',
      messageId: undefined,
      messages: [],
      abortSignal: undefined,
    });

    expect(capturedRequest?.headers.get('X-Api-Key')).toBe('test-api-key');
    expect(capturedRequest?.headers.get('X-AI-Model')).toBeNull();
  });

  it('supports disabling the stored API key header entirely', async () => {
    let capturedRequest: Request | undefined;
    testGlobal.localStorage = {
      getItem() {
        return 'test-api-key';
      },
    };

    const transport = new StandardSseChatTransport<UIMessage>({
      api: 'http://localhost/api/chat',
      includeApiKeyHeader: false,
      fetch: async (input, init) => {
        capturedRequest =
          input instanceof Request ? input : new Request(input, init);
        return createSseResponse();
      },
    });

    await transport.sendMessages({
      trigger: 'submit-message',
      chatId: 'chat-1',
      messageId: undefined,
      messages: [],
      abortSignal: undefined,
    });

    if (!capturedRequest) {
      throw new Error('Expected fetch to capture a request');
    }

    expect(capturedRequest.headers.get('X-Api-Key')).toBeNull();
  });
});
