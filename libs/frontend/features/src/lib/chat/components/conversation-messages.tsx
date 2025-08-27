import { Bubble, Sender, useXAgent, useXChat, XStream } from '@ant-design/x';
import { Flex, GetProp } from 'antd';
import { RobotOutlined, UserOutlined } from '@ant-design/icons';
import { useMemo, useState } from 'react';
import { Conversation } from '@web/domain';
import { useQuery } from '@tanstack/react-query';
import { BubbleDataType } from '@ant-design/x/es/bubble/BubbleList';

const roles: GetProp<typeof Bubble.List, 'roles'> = {
  assistant: {
    placement: 'start',
    avatar: { icon: <RobotOutlined />, style: { background: '#fde3cf' } },
  },
  user: {
    placement: 'end',
    avatar: { icon: <UserOutlined />, style: { background: '#87d068' } },
  },
};

export const ConversationMessages = (props: { conversation: Conversation }) => {
  const { conversation } = props;
  const conversationMessages = conversation.getMessages();
  const { data: serverMessages, isPending } = useQuery({
    queryKey: ['conversation-messages', conversation.getIdentity()],
    queryFn: async ({ signal }) => {
      await conversationMessages.fetchFirst(signal);
      return conversationMessages.items();
    },
  });

  const [content, setContent] = useState('');
  const [agent] = useXAgent<string, { message: string }, string>({
    request: async ({ message }, { onSuccess, onUpdate }) => {
      let fullMessage = '';
      const stream = await conversation.sendMessage(message);
      for await (const chunk of XStream({ readableStream: stream })) {
        const newText = chunk.data?.trim() || '';
        fullMessage += newText;
        onUpdate(fullMessage);
      }
      onSuccess([fullMessage]);
    },
  });
  const { onRequest, messages } = useXChat({ agent });

  const allMessages = useMemo<BubbleDataType[]>(() => {
    const historicalMessages =
      serverMessages?.map((item) => ({
        key: item.getIdentity(),
        role: item.getDescription().role,
        content: item.getDescription().content,
      })) ?? [];
    const currentMessages = messages.map(({ message, status, id }) => ({
      key: id,
      role: status === 'local' ? 'user' : 'assistant',
      content: message,
    }));
    return [...historicalMessages, ...currentMessages];
  }, [serverMessages, messages]);

  return (
    <Flex vertical gap="middle" flex={1} justify="space-between">
      <Bubble.List roles={roles} items={allMessages} />
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
