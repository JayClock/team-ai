import { State } from '@hateoas-ts/resource';
import { AcpSession } from '@shared/schema';
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
  Spinner,
} from '@shared/ui';
import { BotIcon } from 'lucide-react';
import { useMemo } from 'react';
import { buildChatMessages } from './session-event-message-builder';
import { SessionEventMessage } from './session-event-message';
import { useSessionEventHistory } from './use-session-event-history';

export type SessionEventsProps = {
  historyLimit?: number;
  session: State<AcpSession> | null;
};

export function SessionEvents(props: SessionEventsProps) {
  const { historyLimit = 200, session } = props;
  const { events, loading } = useSessionEventHistory({
    historyLimit,
    session,
  });
  const chatMessages = useMemo(() => buildChatMessages(events), [events]);

  return (
    <Conversation className="min-h-0 flex-1" resize="instant">
      <ConversationContent className="mx-auto flex w-full max-w-3xl gap-4 px-4 py-6 md:px-5">
        {!session ? (
          <ConversationEmptyState
            icon={<BotIcon className="size-10 text-muted-foreground/60" />}
            title="发送第一条消息"
            description="选择已有会话，或者直接输入内容开始新的对话。"
          />
        ) : loading && chatMessages.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner className="size-4" />
            正在加载会话历史...
          </div>
        ) : chatMessages.length === 0 ? (
          <ConversationEmptyState
            icon={<BotIcon className="size-10 text-muted-foreground/60" />}
            title="还没有事件"
            description="当前会话还没有可展示的聊天或工具事件。"
          />
        ) : (
          <>
            {chatMessages.map((message) => {
              return (
                <SessionEventMessage key={message.id} message={message} />
              );
            })}
          </>
        )}
      </ConversationContent>
      <ConversationScrollButton />
    </Conversation>
  );
}

export function FeaturesSessionEvents(props: SessionEventsProps) {
  return <SessionEvents {...props} />;
}

export default SessionEvents;
