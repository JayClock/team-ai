import { beforeEach, describe } from 'vitest';
import {
  HalLinksDescription,
  User,
  UserConversations,
  UserDescription,
} from '../index.js';

class MockUserConversations implements UserConversations {
  addConversation = vi.fn();
}

describe('User', () => {
  let user: User;
  let mockUserDescription: UserDescription & HalLinksDescription;
  let mockUserConversations: MockUserConversations;

  beforeEach(() => {
    mockUserDescription = {
      name: 'JayClock',
      email: 'JayClock@email.com',
      _links: {},
    };
    mockUserConversations = new MockUserConversations();
    user = new User('1', mockUserDescription, mockUserConversations);
  });

  it('should add conversation', async () => {
    await user.addConversation({ title: 'New Conversation' });
    expect(mockUserConversations.addConversation).toHaveBeenCalledWith({
      title: 'New Conversation',
    });
  });
});
