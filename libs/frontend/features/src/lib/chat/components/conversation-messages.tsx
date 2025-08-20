import { Bubble, Sender, useXAgent, useXChat } from '@ant-design/x';
import { Flex, GetProp } from 'antd';
import { RobotOutlined, UserOutlined } from '@ant-design/icons';
import { useState } from 'react';
import { Conversation } from '@web/domain';
import { useQuery } from '@tanstack/react-query';

const roles: GetProp<typeof Bubble.List, 'roles'> = {
  ai: {
    placement: 'start',
    avatar: { icon: <RobotOutlined />, style: { background: '#fde3cf' } },
  },
  local: {
    placement: 'end',
    avatar: { icon: <UserOutlined />, style: { background: '#87d068' } },
  },
};

export const ConversationMessages = (props: { conversation: Conversation }) => {
  const { conversation } = props;
  const { data: conversationMessages, isPending } = useQuery({
    queryKey: ['conversation-messages', conversation.getIdentity()],
    queryFn: () => conversation.getMessages().fetchFirst(),
  });

  const [content, setContent] = useState('');
  const [agent] = useXAgent<string, { message: string }, string>({
    request: async ({ message }, { onSuccess, onUpdate }) => {
      const fullContent = `Streaming output instead of Bubble typing effect. You typed: ${message}`;
      let currentContent = '';

      const id = setInterval(() => {
        currentContent = fullContent.slice(0, currentContent.length + 2);
        onUpdate(currentContent);
        if (currentContent === fullContent) {
          clearInterval(id);
          onSuccess([fullContent]);
        }
      }, 100);
    },
  });
  const { onRequest, messages } = useXChat({ agent });

  return (
    <Flex vertical gap="middle" flex={1} justify="space-between">
      <Bubble.List
        roles={roles}
        items={messages.map(({ message, status, id }) => ({
          key: id,
          role: status === 'local' ? 'local' : 'ai',
          content: message,
        }))}
      />
      <Sender
        className="w-full"
        loading={agent.isRequesting()}
        value={content}
        onChange={setContent}
        onSubmit={(nextContent) => {
          onRequest(nextContent);
          setContent('');
        }}
      />
    </Flex>
  );
};
