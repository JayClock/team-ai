import { Bubble, Sender, useXAgent, useXChat, XStream } from '@ant-design/x';
import { Flex, GetProp } from 'antd';
import { RobotOutlined, UserOutlined } from '@ant-design/icons';
import { useState } from 'react';
import { Conversation } from '@web/domain';
import { useQuery } from '@tanstack/react-query';
import { SSEFields } from '@ant-design/x/es/x-stream';

const roles: GetProp<typeof Bubble.List, 'roles'> = {
  ai: {
    placement: 'start',
    avatar: { icon: <RobotOutlined />, style: { background: '#fde3cf' } },
    typing: { step: 2, interval: 50 },
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
      const chunks: Partial<Record<SSEFields, string>>[] = [];
      const stream = await conversation.sendMessage(message);
      for await (const chunk of XStream({ readableStream: stream })) {
        chunks.push(chunk);
        onUpdate(chunks.map((item) => item.data?.trim()).join(''));
      }
      onSuccess([chunks.map((item) => item.data?.trim()).join('')]);
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
