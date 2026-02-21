import { useSuspenseInfiniteCollection } from '@hateoas-ts/resource-react';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuSkeleton,
} from '@shared/ui/components/sidebar';
import { MessageSquareIcon } from 'lucide-react';
import { useState, useMemo, useRef, useCallback } from 'react';
import { useInView } from 'react-intersection-observer';
import { Props } from '../../interface';
import { ScrollArea } from '@radix-ui/react-scroll-area';

export default function ConversationList(props: Required<Props>) {
  const { state, onConversationChange } = props;
  const [activeConversationId, setActiveConversationId] = useState<string>();
  const projectState = state.value;

  const conversationsResource = useMemo(
    () => projectState.follow('conversations'),
    [projectState],
  );

  const {
    items: conversationCollection,
    hasNextPage,
    loadNextPage,
    isLoadingMore,
  } = useSuspenseInfiniteCollection(conversationsResource);

  const items = useMemo(
    () =>
      conversationCollection.map((conv) => ({
        id: conv.data.id,
        title: conv.data.title,
      })),
    [conversationCollection],
  );

  const loadingRef = useRef(false);

  const { ref: loadMoreRef } = useInView({
    threshold: 0,
    skip: isLoadingMore,
    rootMargin: '100px',
    onChange: (inView) => {
      if (inView && hasNextPage && !loadingRef.current) {
        loadingRef.current = true;
        loadNextPage().finally(() => {
          loadingRef.current = false;
        });
      }
    },
  });

  const handleConversationClick = useCallback(
    (conversationId: string) => {
      setActiveConversationId(conversationId);
      const res = conversationCollection.find(
        (conv) => conv.data.id === conversationId,
      );
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      onConversationChange(res!);
    },
    [conversationCollection, onConversationChange],
  );

  return (
    <SidebarGroup className="p-0">
      <SidebarGroupContent>
        <SidebarMenu>
          <ScrollArea>
            {items.map((item) => (
              <SidebarMenuItem key={item.id}>
                <SidebarMenuButton
                  isActive={activeConversationId === item.id}
                  onClick={() => handleConversationClick(item.id)}
                  tooltip={item.title}
                  className="px-4 cursor-pointer transition-colors duration-200"
                >
                  <MessageSquareIcon
                    className="h-4 w-4 shrink-0"
                    aria-hidden="true"
                  />
                  <span className="truncate">{item.title}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}

            {/* Sentinel element for intersection observer */}
            <div ref={loadMoreRef} className="h-1" />

            {isLoadingMore && (
              <>
                <SidebarMenuSkeleton showIcon />
                <SidebarMenuSkeleton showIcon />
                <SidebarMenuSkeleton showIcon />
              </>
            )}

            {!hasNextPage && items.length > 0 && (
              <div className="px-4 py-3 text-center text-xs text-muted-foreground">
                没有更多对话了
              </div>
            )}

            {items.length === 0 && (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                暂无对话
              </div>
            )}
          </ScrollArea>
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
