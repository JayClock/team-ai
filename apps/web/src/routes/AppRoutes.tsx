import { useMemo, useState } from 'react';
import { State } from '@hateoas-ts/resource';
import { Conversation } from '@shared/schema';
import { UserConversations } from '@features/user-conversations';
import { ConversationMessages } from '@features/conversation-messages';
import { rootResource } from '../lib/api-client';
import { useSuspenseResource } from '@hateoas-ts/resource-react';
import { Button } from '@shared/ui/components/button';
import { PlusIcon, MessageSquareIcon } from 'lucide-react';

export function AppRoutes() {
  const [conversationState, setConversationState] =
    useState<State<Conversation>>();

  // 使用 useMemo 缓存 ResourceRelation 引用，确保在 Suspense 期间引用稳定
  const meRelation = useMemo(() => rootResource.follow('me'), []);

  const { resource } = useSuspenseResource(meRelation);

  const sidebarHeader = (
    <div className="flex items-center justify-between w-full">
      <div className="flex items-center gap-2">
        <MessageSquareIcon className="h-5 w-5" />
        <span className="font-semibold">Team AI</span>
      </div>
      <Button variant="ghost" size="icon" className="h-8 w-8">
        <PlusIcon className="h-4 w-4" />
        <span className="sr-only">新建对话</span>
      </Button>
    </div>
  );

  const sidebarContent = (
    <UserConversations
      resource={resource}
      onConversationChange={setConversationState}
    />
  );

  const mainContent = (
    <ConversationMessages
      conversationState={conversationState}
      key={conversationState?.data.id}
    />
  );

  const conversationTitle = conversationState?.data.title || '选择一个对话';

  return { sidebarHeader, sidebarContent, mainContent, conversationTitle };
}
