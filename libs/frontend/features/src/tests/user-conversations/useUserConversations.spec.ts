import { beforeEach, describe, expect, Mocked, vi } from 'vitest';
import { UserLegacy } from '@web/domain';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useUserConversations } from '../../lib/user-conversations/useUserConversations';
import { wrapper } from '../Wrapper';

const createMockConversation = (id: string) => ({
  getIdentity: () => `conv_${id}`,
  getDescription: () => ({ title: `title_${id}` }),
});

const page1Items = [createMockConversation('1'), createMockConversation('2')];
const page2Items = [createMockConversation('3')];

const mockPage2 = {
  items: () => page2Items,
  hasNext: () => false,
  fetchNext: vi.fn(),
};

const mockPage1 = {
  items: () => page1Items,
  hasNext: () => true,
  fetchNext: vi.fn().mockResolvedValue(mockPage2),
};

const user = {
  getConversations: () => ({
    findAll: vi.fn().mockResolvedValue(mockPage1),
  }),
  getIdentity: () => '1',
} as unknown as Mocked<UserLegacy>;

describe('useUserConversations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch initial conversations and derive correct state', async () => {
    const { result } = renderHook(() => useUserConversations(user, 'conv_2'), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isPending).toEqual(false));
    expect(result.current.conversationItems).toHaveLength(2);
    expect(result.current.conversationItems[0].label).toEqual('title_1');
    expect(result.current.activeConversation?.getIdentity()).toEqual('conv_2');
    expect(result.current.hasNextPage).toEqual(true);
  });

  it('should fetch the next page and append conversations', async () => {
    const { result } = renderHook(() => useUserConversations(user, 'conv_2'), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isPending).toEqual(false));
    act(() => {
      result.current.fetchNextPage();
    });
    await waitFor(() =>
      expect(result.current.isFetchingNextPage).toBe(false)
    );
    expect(result.current.conversationItems).toHaveLength(3)
    expect(result.current.conversationItems[2].label).toEqual('title_3');
    expect(result.current.hasNextPage).toEqual(false);
  });
});
