import type { UIMessage } from 'ai';

export type SessionTerminalData = {
  args?: string[];
  command?: string | null;
  exitCode?: number | null;
  output: string;
  status: 'completed' | 'failed' | 'running';
  terminalId: string;
};

export type SessionEventChatMessage = UIMessage<
  {
    chunkKey?: string;
    emittedAt: string;
    pending?: boolean;
  },
  {
    terminal: SessionTerminalData;
  }
>;

export type SessionTerminalPart = Extract<
  SessionEventChatMessage['parts'][number],
  { type: 'data-terminal' }
>;
