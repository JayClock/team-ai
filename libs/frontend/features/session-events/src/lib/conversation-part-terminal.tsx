import {
  Terminal,
  TerminalContent,
  TerminalHeader,
  TerminalStatus,
  TerminalTitle,
} from '@shared/ui';
import type {
  SessionEventChatMessage,
  SessionTerminalPart,
} from './session-events.types';

export function isRenderableTerminalPart(
  part: SessionEventChatMessage['parts'][number],
): part is SessionTerminalPart {
  return part.type === 'data-terminal';
}

export function TerminalPart(props: {
  part: SessionTerminalPart;
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
    <Terminal key={`${messageId}-${index}`} className="mb-4 w-full">
      <TerminalHeader>
        <TerminalTitle command={part.data.command} args={part.data.args} />
        <TerminalStatus status={status} exitCode={part.data.exitCode} />
      </TerminalHeader>
      <TerminalContent output={part.data.output} />
    </Terminal>
  );
}
