import { beforeEach, describe } from 'vitest';
import {
  HalLinksDescription,
  UserLegacy,
  UserConversationsLegacy,
  UserDescription,
} from '../index.js';

class MockUserConversations implements UserConversationsLegacy {
  addConversation = vi.fn();
}

describe('User', () => {
  let user: UserLegacy;
  let mockUserDescription: UserDescription & HalLinksDescription;
  let mockUserConversations: MockUserConversations;

  beforeEach(() => {
    mockUserDescription = {
      name: 'JayClock',
      email: 'JayClock@email.com',
      _links: {},
    };
    mockUserConversations = new MockUserConversations();
    user = new UserLegacy('1', mockUserDescription, mockUserConversations);
  });

  it('should add conversation', async () => {
    await user.addConversation({ title: 'New ConversationLegacy' });
    expect(mockUserConversations.addConversation).toHaveBeenCalledWith({
      title: 'New ConversationLegacy',
    });
  });
});
