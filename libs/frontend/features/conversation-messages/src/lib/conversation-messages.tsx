import { Conversation } from '@shared/schema';
import { State } from '@hateoas-ts/resource-react';
import { ConversationMessagesInner } from './components';
import {
  ConversationEmptyState,
  Suggestions,
  Suggestion,
  MessageListSkeleton,
} from '@shared/ui';
import { MessageSquareIcon } from 'lucide-react';
import { Suspense } from 'react';

const defaultSuggestions = [
  '帮我写一篇技术文档',
  '解释一下什么是 HATEOAS',
  '如何优化 React 性能？',
  '给我一些代码审查建议',
];

function MessagesLoading() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-hidden">
        <MessageListSkeleton count={4} />
      </div>
      <div className="border-t bg-background p-4">
        <div className="h-24 rounded-lg bg-muted animate-pulse" />
      </div>
    </div>
  );
}

export function ConversationMessages(props: {
  conversationState?: State<Conversation>;
}) {
  const { conversationState } = props;

  if (!conversationState) {
    return (
      <ConversationEmptyState
        title="欢迎使用 Team AI"
        description="选择一个对话开始聊天，或者从下面的建议开始"
        icon={
          <MessageSquareIcon className="h-12 w-12 text-muted-foreground/50" />
        }
      >
        <div className="flex flex-col items-center gap-6">
          <div className="space-y-1 text-center">
            <h3 className="text-lg font-medium">欢迎使用 Team AI</h3>
            <p className="text-sm text-muted-foreground">
              选择一个对话开始聊天，或者从下面的建议开始
            </p>
          </div>
          <MessageSquareIcon className="h-16 w-16 text-muted-foreground/30" />
          <Suggestions className="justify-center">
            {defaultSuggestions.map((suggestion) => (
              <Suggestion
                key={suggestion}
                suggestion={suggestion}
                onClick={() => {
                  // TODO: Create new conversation with this suggestion
                }}
              />
            ))}
          </Suggestions>
        </div>
      </ConversationEmptyState>
    );
  }

  return (
    <Suspense fallback={<MessagesLoading />}>
      <ConversationMessagesInner conversationState={conversationState} />
    </Suspense>
  );
}

export default ConversationMessages;
