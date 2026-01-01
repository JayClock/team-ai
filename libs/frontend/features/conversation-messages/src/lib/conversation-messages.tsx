import { Conversation } from '@shared/schema';
import { State, useInfiniteCollection } from '@hateoas-ts/resource-react';
import { useMemo, useState } from 'react';
import { Bubble } from '@ant-design/x';
import {
  CustomChatProvider,
  CustomInput,
  CustomMessage,
  CustomOutput,
} from './custom-chat-provider';
import { DefaultMessageInfo, useXChat, XRequest } from '@ant-design/x-sdk';

export function ConversationMessages(props: {
  conversationState: State<Conversation>;
}) {
  const { conversationState } = props;

  const { items: messagesCollections, loading } = useInfiniteCollection(
    conversationState.follow('messages'),
  );
  const defaultMessages: DefaultMessageInfo<CustomMessage>[] = useMemo(() => {
    if (!loading) {
      return messagesCollections.map((message) => ({
        id: message.data.id,
        message: { role: message.data.role, content: message.data.content },
        status: 'success',
      }));
    }
    return [];
  }, [loading, messagesCollections]);

  if (loading) {
    return 'loading';
  }
  return <MessageList defaultMessages={defaultMessages}></MessageList>;
}

export default ConversationMessages;

function MessageList(props: {
  defaultMessages: DefaultMessageInfo<CustomMessage>[];
}) {
  const { defaultMessages } = props;
  const [provider] = useState(
    new CustomChatProvider<CustomMessage, CustomInput, CustomOutput>({
      request: XRequest(
        'https://api.x.ant.design/api/custom_chat_provider_stream',
        {
          manual: true,
        },
      ),
    }),
  );

  const { messages } = useXChat({
    provider,
    defaultMessages,
  });

  return (
    <Bubble.List
      items={messages.map(({ id, message, status }) => ({
        key: id,
        loading: status === 'loading',
        role: message.role,
        content: message.content,
      }))}
    ></Bubble.List>
  );
}
