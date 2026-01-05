import { useState } from 'react';
import { Menu } from 'antd';
import { State } from '@hateoas-ts/resource';
import { User, Conversation } from '@shared/schema';
import { UserConversations } from '@features/user-conversations';
import { ConversationMessages } from '@features/conversation-messages';
import { appConfig } from '../config/app.config';
import { apiClient } from '../lib/api-client';

const userResource = apiClient.go<User>(
  `/api/users/${appConfig.auth.defaultUserId}`,
);

export function AppRoutes() {
  const [selectedKey, setSelectedKey] = useState('conversations');
  const [conversationState, setConversationState] =
    useState<State<Conversation>>();

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
      resource={userResource}
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
