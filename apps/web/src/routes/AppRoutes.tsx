import { useState } from 'react';
import { State } from '@hateoas-ts/resource';
import { Conversation } from '@shared/schema';
import { UserConversations } from '@features/user-conversations';
import { ConversationMessages } from '@features/conversation-messages';
import { rootResource } from '../lib/api-client';
import { useResource } from '@hateoas-ts/resource-react';
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
} from '@shared/ui/components/navigation-menu';
import { cn } from '@shared/ui/lib/utils';

export function AppRoutes() {
  const [selectedKey, setSelectedKey] = useState('conversations');
  const [conversationState, setConversationState] =
    useState<State<Conversation>>();

  const { resource } = useResource(rootResource.follow('me'));

  const headerContent = (
    <div className="flex items-center gap-8">
      <h2 className="m-0">Team AI</h2>
      <NavigationMenu>
        <NavigationMenuList>
          <NavigationMenuItem>
            <NavigationMenuLink
              className={cn(
                'group inline-flex h-10 w-max items-center justify-center rounded-md bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground focus:outline-none disabled:pointer-events-none disabled:opacity-50',
                selectedKey === 'conversations' && 'bg-accent',
              )}
              onClick={() => setSelectedKey('conversations')}
            >
              对话列表
            </NavigationMenuLink>
          </NavigationMenuItem>
          <NavigationMenuItem>
            <NavigationMenuLink
              className={cn(
                'group inline-flex h-10 w-max items-center justify-center rounded-md bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground focus:outline-none disabled:pointer-events-none disabled:opacity-50',
                selectedKey === 'settings' && 'bg-accent',
              )}
              onClick={() => setSelectedKey('settings')}
            >
              设置
            </NavigationMenuLink>
          </NavigationMenuItem>
        </NavigationMenuList>
      </NavigationMenu>
    </div>
  );

  const mainContent = (
    <UserConversations
      resource={resource}
      onConversationChange={setConversationState}
    />
  );

  const rightContent = (
    <ConversationMessages
      conversationState={conversationState}
      key={conversationState?.data.id}
    />
  );

  return { headerContent, mainContent, rightContent };
}
