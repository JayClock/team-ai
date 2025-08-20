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
});
