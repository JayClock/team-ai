import { useMemo, useState } from 'react';
import { State } from '@hateoas-ts/resource';
import { Conversation, Project } from '@shared/schema';
import { ProjectConversations } from '@features/project-conversations';
import { ConversationMessages } from '@features/conversation-messages';
import { UserProjects } from '@features/user-projects';
import { rootResource } from '../lib/api-client';
import { useSuspenseResource } from '@hateoas-ts/resource-react';
import { Button } from '@shared/ui/components/button';
import { MessageSquareIcon, PlusIcon, BookOpenIcon } from 'lucide-react';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@shared/ui/components/tabs';
import { signal } from '@preact/signals-react';

export function AppRoutes() {
  const [activeTab, setActiveTab] = useState('chat');
  const conversationState = signal<State<Conversation> | undefined>(undefined);
  const projectState = signal<State<Project> | undefined>(undefined);

  const meRelation = useMemo(() => rootResource.follow('me'), []);

  const { resourceState: userState } = useSuspenseResource(meRelation);

  const sidebarHeader = (
    <div className="flex items-center justify-between w-full">
      <div className="flex items-center gap-2">
        <MessageSquareIcon className="h-5 w-5" aria-hidden="true" />
        <UserProjects
          state={userState}
          onProjectChange={(newProjectState) => {
            projectState.value = newProjectState;
          }}
        />
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 transition-colors duration-200"
        aria-label="新建对话"
      >
        <PlusIcon className="h-4 w-4" />
      </Button>
    </div>
  );

  const sidebarContent = (
    <ProjectConversations
      state={projectState as any}
      onConversationChange={(newConversationState) => {
        conversationState.value = newConversationState;
      }}
    />
  );

  const mainContent = (
    <Tabs
      value={activeTab}
      onValueChange={setActiveTab}
      className="h-full flex flex-col"
    >
      <TabsList className="w-full justify-start mb-4">
        <TabsTrigger value="chat" className="gap-2">
          <MessageSquareIcon className="h-4 w-4" />
          聊天
        </TabsTrigger>
        <TabsTrigger value="knowledge" className="gap-2">
          <BookOpenIcon className="h-4 w-4" />
          知识库
        </TabsTrigger>
      </TabsList>

      <TabsContent
        value="chat"
        className="flex-1 overflow-hidden data-[state=active]:flex data-[state=inactive]:hidden"
      >
        <ConversationMessages
          conversationState={conversationState as any}
          key={conversationState.value?.data.id}
        />
      </TabsContent>

      <TabsContent
        value="knowledge"
        className="flex-1 overflow-hidden data-[state=active]:flex data-[state=inactive]:hidden"
      >
        <div className="flex items-center justify-center h-full text-gray-500">
          知识库功能开发中...
        </div>
      </TabsContent>
    </Tabs>
  );

  const conversationTitle =
    activeTab === 'chat'
      ? conversationState.value?.data.title || '选择一个对话'
      : projectState.value?.data.name
        ? `${projectState.value.data.name} - 知识库`
        : '知识库';

  return { sidebarHeader, sidebarContent, mainContent, conversationTitle };
}
