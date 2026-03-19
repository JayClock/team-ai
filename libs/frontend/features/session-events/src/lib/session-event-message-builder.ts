import type { AcpEventEnvelope } from '@shared/schema';
import {
  asText,
} from './tool-data';
import {
  buildTerminalPart,
  buildToolPart,
} from './session-event-part-builders';
import { summarizeSessionEvent } from './session-event-system-summary';
import type {
  SessionEventChatMessage,
  SessionTerminalPart,
} from './session-events.types';

export function buildChatMessages(
  history: AcpEventEnvelope[],
): SessionEventChatMessage[] {
  const messages: SessionEventChatMessage[] = [];
  const messagesByChunkKey = new Map<string, SessionEventChatMessage>();

  for (const event of history) {
    if (
      event.update.eventType === 'agent_message' ||
      event.update.eventType === 'agent_thought' ||
      event.update.eventType === 'user_message'
    ) {
      const data = event.update.message;
      const content = asText(data?.content);
      if (!content) {
        continue;
      }

      const role = data?.role === 'user' ? 'user' : 'assistant';
      const previous = messages[messages.length - 1];
      const chunkKeyBase = data?.role ?? event.update.eventType;
      const partType = data?.role === 'thought' ? 'reasoning' : 'text';
      const chunkKey = data?.messageId
        ? `${role}:${data.messageId}`
        : previous &&
            previous.role === role &&
            previous.metadata?.chunkKey?.startsWith(`${role}:${chunkKeyBase}:`)
          ? previous.metadata.chunkKey
          : `${role}:${chunkKeyBase}:${event.eventId}`;

      if (previous && previous.metadata?.chunkKey === chunkKey) {
        const lastPart = previous.parts.at(-1);
        if (
          (lastPart?.type === 'text' || lastPart?.type === 'reasoning') &&
          lastPart.type === partType
        ) {
          lastPart.text += content;
        } else {
          previous.parts.push(
            partType === 'reasoning'
              ? { type: 'reasoning', text: content }
              : { type: 'text', text: content },
          );
        }
        previous.metadata = {
          ...previous.metadata,
          emittedAt: event.emittedAt,
        };
        continue;
      }

      const nextMessage: SessionEventChatMessage = {
        id: chunkKey,
        role,
        metadata: {
          chunkKey,
          emittedAt: event.emittedAt,
        },
        parts: [
          partType === 'reasoning'
            ? { type: 'reasoning', text: content }
            : { type: 'text', text: content },
        ],
      };
      messages.push(nextMessage);
      messagesByChunkKey.set(chunkKey, nextMessage);
      continue;
    }

    if (
      event.update.eventType === 'tool_call' ||
      event.update.eventType === 'tool_call_update'
    ) {
      const toolPart = buildToolPart(event);
      if (!toolPart) {
        continue;
      }

      const chunkKey = `assistant:tool:${toolPart.toolCallId}`;
      const existing = messagesByChunkKey.get(chunkKey);

      if (existing) {
        const partIndex = existing.parts.findIndex(
          (part) =>
            part.type === 'dynamic-tool' &&
            part.toolCallId === toolPart.toolCallId,
        );

        if (partIndex >= 0) {
          existing.parts[partIndex] = toolPart;
        } else {
          existing.parts.push(toolPart);
        }

        existing.metadata = {
          ...existing.metadata,
          emittedAt: event.emittedAt,
        };
        continue;
      }

      const nextMessage: SessionEventChatMessage = {
        id: chunkKey,
        role: 'assistant',
        metadata: {
          chunkKey,
          emittedAt: event.emittedAt,
        },
        parts: [toolPart],
      };
      messages.push(nextMessage);
      messagesByChunkKey.set(chunkKey, nextMessage);
      continue;
    }

    if (
      event.update.eventType === 'terminal_created' ||
      event.update.eventType === 'terminal_output' ||
      event.update.eventType === 'terminal_exited'
    ) {
      const terminalId = asText(event.update.terminal?.terminalId);
      if (!terminalId) {
        continue;
      }

      const chunkKey = `assistant:terminal:${terminalId}`;
      const existing = messagesByChunkKey.get(chunkKey);
      const previousPart = existing?.parts.find(
        (part): part is SessionTerminalPart => part.type === 'data-terminal',
      );
      const terminalPart = buildTerminalPart(event, previousPart?.data);

      if (!terminalPart) {
        continue;
      }

      if (existing) {
        const partIndex = existing.parts.findIndex(
          (part) => part.type === 'data-terminal' && part.id === terminalId,
        );

        if (partIndex >= 0) {
          existing.parts[partIndex] = terminalPart;
        } else {
          existing.parts.push(terminalPart);
        }

        existing.metadata = {
          ...existing.metadata,
          emittedAt: event.emittedAt,
        };
        continue;
      }

      const nextMessage: SessionEventChatMessage = {
        id: chunkKey,
        role: 'assistant',
        metadata: {
          chunkKey,
          emittedAt: event.emittedAt,
        },
        parts: [terminalPart],
      };
      messages.push(nextMessage);
      messagesByChunkKey.set(chunkKey, nextMessage);
      continue;
    }

    const summary = summarizeSessionEvent(event);
    if (!summary) {
      continue;
    }

    messages.push({
      id: event.eventId,
      role: 'system',
      metadata: {
        emittedAt: event.emittedAt,
      },
      parts: [
        {
          type: 'text',
          text: summary,
        },
      ],
    });
  }

  return messages;
}
