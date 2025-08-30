import { Bubble, Sender } from '@ant-design/x';
import { GetProp, Spin } from 'antd';
import { RobotOutlined, UserOutlined } from '@ant-design/icons';
import { Conversation } from '@web/domain';
import { useConversationMessages } from './useConversationMessages';
import { useState } from 'react';

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
  const [content, setContent] = useState('');
  const { messages, sendMessage, agent, isLoadingHistory } =
    useConversationMessages(conversation);

  return (
    <div className="flex flex-col gap-8 flex-1 justify-between h-full">
      {isLoadingHistory ? (
        <Spin />
      ) : (
        <Bubble.List className="flex-1" roles={roles} items={messages} />
      )}
      <Sender
        className="w-full"
        loading={agent.isRequesting()}
        value={content}
        onChange={setContent}
        onSubmit={(nextContent) => {
          sendMessage(nextContent);
          setContent('');
        }}
      />
    </div>
  );
};
