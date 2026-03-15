import { MessageResponse, Spinner } from '@shared/ui';
import type { SessionChatMessage } from './use-project-session-chat';

interface TextPartProps {
  part: Extract<SessionChatMessage['parts'][number], { type: 'text' }>;
  isPending: boolean;
  index: number;
  messageId: string;
}

export function TextPart({ part, isPending, index, messageId }: TextPartProps) {
  if (isPending) {
    return (
      <div
        key={`${messageId}-${index}`}
        className="flex items-center gap-2 text-sm text-muted-foreground"
      >
        <Spinner className="size-4" />
        正在等待响应...
      </div>
    );
  }
  return (
    <MessageResponse key={`${messageId}-${index}`}>{part.text}</MessageResponse>
  );
}
