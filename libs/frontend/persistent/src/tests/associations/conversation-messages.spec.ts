import { beforeEach, describe, expect, Mocked } from 'vitest';
import { ConversationMessages } from '../../lib/associations/index.js';
import { Axios } from 'axios';
import { container } from '../../lib/container.js';
import { HalLinks } from '../../lib/archtype/hal-links.js';
import { Factory } from 'inversify';
import { Message } from '@web/domain';

const mockAxios = {
  request: vi.fn(),
  get: vi.fn(),
} as unknown as Mocked<Axios>;
const mockLinks: HalLinks = {
  'save-message': {
    href: 'save-href',
    type: 'POST',
  },
  'send-message': {
    href: 'send-href',
    type: 'GET',
  },
  messages: {
    href: 'messages-href',
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

  it('should send message and return stream', async () => {
    const mockMessage = 'Hello, World!';
    const mockStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('some message'));
        controller.close();
      },
    });
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: mockStream,
    } as Response);
    const stream = await conversationMessages.sendMessage(mockMessage);
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

  it('should find paged messages successfully', async () => {
    const mockResponse = {
      data: {
        _embedded: {
          messages: [
            {
              id: '123',
              role: 'role',
              content: 'content',
              _links: { self: { href: 'self-href' } },
            },
          ],
        },
        page: {
          number: 1,
          size: 100,
          totalElements: 200,
          totalPages: 2,
        },
        _links: {
          next: { href: 'next-href' },
        },
      },
    };
    vi.mocked(mockAxios.get).mockResolvedValue(mockResponse);
    const res = await conversationMessages.findAll();
    expect(res.items().length).toBe(1);
    expect(res.items()[0]).toBeInstanceOf(Message);
    expect(res.hasPrev()).toEqual(false);
    expect(res.hasNext()).toEqual(true);
    expect(res.pagination()).toEqual({
      page: 1,
      pageSize: 100,
      total: 200,
    });
  });
});
