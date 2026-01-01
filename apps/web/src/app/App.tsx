import { createClient, State } from '@hateoas-ts/resource';
import { Conversation, User } from '@shared/schema';
import { UserConversations } from '@features/user-conversations';
import { XProvider } from '@ant-design/x';
import { ResourceProvider } from '@hateoas-ts/resource-react';
import { AppLayout } from './Layout';
import { Menu } from 'antd';
import { useState } from 'react';
import { ConversationMessages } from '@features/conversation-messages';

const client = createClient({ baseURL: 'http://localhost:4200' });
const resource = client.go<User>('/api/users/1');

export default function App() {
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
    <div style={{ display: 'flex', alignItems: 'center' }}>
      <h2 style={{ margin: '0 24px 0 0' }}>Team AI</h2>
      <Menu
        mode="horizontal"
        selectedKeys={[selectedKey]}
        items={menuItems}
        onSelect={({ key }) => setSelectedKey(key)}
      />
    </div>
  );

  const mainContent = (
    <ResourceProvider client={client}>
      <UserConversations
        resource={resource}
        onConversationChange={setConversationState}
      />
    </ResourceProvider>
  );

  const rightContent = (
    <ResourceProvider client={client}>
      {conversationState ? (
        <ConversationMessages
          conversationState={conversationState}
          key={conversationState.data.id}
        />
      ) : (
        <div style={{ textAlign: 'center', marginTop: '50px', color: '#999' }}>
          请选择一个对话查看消息
        </div>
      )}
    </ResourceProvider>
  );

  return (
    <XProvider>
      <AppLayout headerContent={headerContent} rightContent={rightContent}>
        {mainContent}
      </AppLayout>
    </XProvider>
  );
}
