import { Conversation } from '@shared/schema';
import { State, useInfiniteCollection } from '@hateoas-ts/resource-react';
import { useMemo, useState } from 'react';
import { Bubble, Sender } from '@ant-design/x';
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


  const [provider] = useState(
    new CustomChatProvider<CustomMessage, CustomInput, CustomOutput>({
      request: XRequest(conversationState.links.get('send-message')?.href || '', {
        manual: true,
      }),
    }),
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
  return (
    <MessageList
      defaultMessages={defaultMessages}
      provider={provider}
    ></MessageList>
  );
}

export default ConversationMessages;

function MessageList(props: {
  defaultMessages: DefaultMessageInfo<CustomMessage>[];
  provider: CustomChatProvider<CustomMessage, CustomInput, CustomOutput>;
}) {
  const { defaultMessages, provider } = props;

  const [content, setContent] = useState('');

  const { messages, onRequest } = useXChat({
    provider,
    defaultMessages,
  });

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-auto">
        <Bubble.List
          items={messages.map(({ id, message, status }) => ({
            key: id,
            loading: status === 'loading',
            role: message.role,
            content: message.content,
            placement: message.role === 'user' ? 'end' : 'start',
          }))}
          autoScroll={true}
        ></Bubble.List>
      </div>
      <Sender
        value={content}
        onChange={setContent}
        onSubmit={(nextContent) => {
          onRequest({
            content: nextContent,
            role: 'user',
          });
          setContent('');
        }}
      ></Sender>
    </div>
  );
}
