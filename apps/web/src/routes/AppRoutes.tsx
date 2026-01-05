import { useState } from 'react';
import { Menu } from 'antd';
import { State } from '@hateoas-ts/resource';
import { Conversation } from '@shared/schema';
import { UserConversations } from '@features/user-conversations';
import { ConversationMessages } from '@features/conversation-messages';
import { rootResource } from '../lib/api-client';
import { useResource } from '@hateoas-ts/resource-react';

export function AppRoutes() {
  const [selectedKey, setSelectedKey] = useState('conversations');
  const [conversationState, setConversationState] =
    useState<State<Conversation>>();

  const { resource } = useResource(rootResource.follow('me'));

  const menuItems = [
    {
      key: 'conversations',
      label: '对话列表',
    },
    {
      key: 'settings',
      label: '设置',
    },
  ];

  const headerContent = (
    <div className="flex items-center">
      <h2 className="m-0 mr-6">Team AI</h2>
      <Menu
        mode="horizontal"
        selectedKeys={[selectedKey]}
        items={menuItems}
        onSelect={({ key }) => setSelectedKey(key)}
      />
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
