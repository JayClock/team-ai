import { beforeEach, describe, expect, Mocked } from 'vitest';
import { ConversationMessages } from '../../lib/associations/index.js';
import { Axios } from 'axios';
import { container } from '../../lib/container.js';
import { HalLinks } from '../../lib/archtype/hal-links.js';
import { Factory } from 'inversify';
import { MessageDescription } from '@web/domain';
import { MessageResponse } from '../../lib/responses/message-response.js';

const mockAxios = { request: vi.fn() } as unknown as Mocked<Axios>;
const mockLinks: HalLinks = {
  'save-message': {
    href: 'save-href',
    type: 'POST',
  },
  'send-message': {
    href: 'send-href',
    type: 'GET',
  },
};

describe('ConversationMessages', () => {
  let conversationMessages: ConversationMessages;
  beforeEach(() => {
    container.rebindSync(Axios).toConstantValue(mockAxios);
    const factory = container.get<Factory<ConversationMessages>>(
      'Factory<ConversationMessages>'
    );
    conversationMessages = factory(mockLinks);
  });

  it('should save message', async () => {
    const mockDescription = {} as MessageDescription;
    const mockResponse: MessageResponse = {
      role: 'user',
      content: 'content',
      id: '1',
      _links: {},
    };
    vi.mocked(mockAxios.request).mockResolvedValue({ data: mockResponse });
    const message = await conversationMessages.saveMessage(mockDescription);
    expect(message.getIdentity()).toBe(mockResponse.id);
    expect(message.getDescription().role).toBe(mockResponse.role);
    expect(message.getDescription().content).toBe(mockResponse.content);
  });

  it('should send message and return stream', async () => {
    const mockMessage = 'Hello, World!';
    const mockStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('some message'));
        controller.close();
      },
    });
    global.fetch = vi.fn().mockResolvedValue({
      body: mockStream,
    } as Response);
    const stream = await conversationMessages.sendMessage(mockMessage);
    expect(global.fetch).toHaveBeenCalledWith(
      `send-href?message=${encodeURIComponent(mockMessage)}`,
      {
        headers: {
          Accept: 'text/event-stream',
        },
      }
    );
    expect(stream).toBe(mockStream);
  });

  it('should throw error if send message fails', async () => {
    const mockMessage = 'Hello, World!';
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    } as Response);
    await expect(conversationMessages.sendMessage(mockMessage)).rejects.toThrow(
      'HTTP error! status: 500'
    );
  });

  it('should throw error if response body is null', async () => {
    const mockMessage = 'Hello, World!';
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: null,
    } as Response);
    await expect(conversationMessages.sendMessage(mockMessage)).rejects.toThrow(
      'Response body is null'
    );
  });
});
