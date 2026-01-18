import { useMemo, useState } from 'react';
import { State } from '@hateoas-ts/resource';
import { Conversation, Project } from '@shared/schema';
import { ProjectConversations } from '@features/project-conversations';
import { ConversationMessages } from '@features/conversation-messages';
import { UserProjects } from '@features/user-projects';
import { rootResource } from '../lib/api-client';
import { useSuspenseResource } from '@hateoas-ts/resource-react';
import { Button } from '@shared/ui/components/button';
import { MessageSquareIcon, PlusIcon } from 'lucide-react';

export function AppRoutes() {
  const [conversationState, setConversationState] =
    useState<State<Conversation>>();

  const [projectState, setProjectState] = useState<State<Project>>();

  const meRelation = useMemo(() => rootResource.follow('me'), []);

  const { resourceState: userState } = useSuspenseResource(meRelation);

  const sidebarHeader = (
    <div className="flex items-center justify-between w-full">
      <div className="flex items-center gap-2">
        <MessageSquareIcon className="h-5 w-5" />
        <UserProjects state={userState} onProjectChange={setProjectState} />
      </div>
      <Button variant="ghost" size="icon" className="h-8 w-8">
        <PlusIcon className="h-4 w-4" />
        <span className="sr-only">新建对话</span>
      </Button>
    </div>
  );

  const sidebarContent = (
    <ProjectConversations
      state={projectState}
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
