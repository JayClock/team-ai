import {
  Terminal,
  TerminalContent,
  TerminalHeader,
  TerminalStatus,
  TerminalTitle,
} from '@shared/ui';
import type { SessionChatMessage } from './use-project-session-chat';

type TerminalPartType = Extract<
  SessionChatMessage['parts'][number],
  { type: 'data-terminal' }
>;

export function isRenderableTerminalPart(
  part: SessionChatMessage['parts'][number],
): part is TerminalPartType {
  return part.type === 'data-terminal';
}

export function TerminalPart(props: {
  part: TerminalPartType;
  index: number;
  messageId: string;
}) {
  const { part, index, messageId } = props;
  const status =
    part.data.status === 'completed'
      ? 'completed'
      : part.data.status === 'failed'
        ? 'failed'
        : 'running';

  return (
    <Terminal
      key={`${messageId}-${index}`}
      className="mb-4 w-full"
    >
      <TerminalHeader>
        <TerminalTitle
          command={part.data.command}
          args={part.data.args}
        />
        <TerminalStatus
          status={status}
          exitCode={part.data.exitCode}
        />
      </TerminalHeader>
      <TerminalContent output={part.data.output} />
    </Terminal>
  );
}
