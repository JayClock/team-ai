import type { AcpEventEnvelope } from '@shared/schema';
import type { DynamicToolUIPart } from 'ai';
import {
  asText,
  getRawUpdateRecord,
  normalizeErrorText,
  resolveToolEventInput,
  resolveToolEventName,
  resolveToolEventOutput,
} from './tool-data';
import type { SessionTerminalData } from './session-events.types';

function resolveToolName(event: AcpEventEnvelope): string {
  const rawUpdate = getRawUpdateRecord(event);
  return resolveToolEventName(rawUpdate, {
    kind: event.update.toolCall?.kind,
    title: event.update.toolCall?.title,
  });
}

function resolveToolInput(event: AcpEventEnvelope): unknown {
  const rawUpdate = getRawUpdateRecord(event);
  return resolveToolEventInput(event.update.toolCall, rawUpdate);
}

function resolveToolOutput(event: AcpEventEnvelope): unknown {
  const rawUpdate = getRawUpdateRecord(event);
  return resolveToolEventOutput(event.update.toolCall, rawUpdate);
}

function resolveToolErrorText(event: AcpEventEnvelope): string {
  const output = resolveToolOutput(event);
  const normalizedOutput = normalizeErrorText(output);
  if (normalizedOutput) {
    return normalizedOutput;
  }

  const title = asText(event.update.toolCall?.title);
  if (title) {
    return `${title} failed`;
  }

  return 'Tool execution failed';
}

export function buildToolPart(
  event: AcpEventEnvelope,
): DynamicToolUIPart | null {
  if (
    event.update.eventType !== 'tool_call' &&
    event.update.eventType !== 'tool_call_update'
  ) {
    return null;
  }

  const toolCall = event.update.toolCall;
  if (!toolCall) {
    return null;
  }

  const toolCallId = asText(toolCall.toolCallId) ?? event.eventId;
  const input = resolveToolInput(event);
  const output = resolveToolOutput(event);
  const toolName = resolveToolName(event);

  switch (toolCall.status) {
    case 'completed':
      return {
        type: 'dynamic-tool',
        toolCallId,
        toolName,
        title: toolName,
        providerExecuted: true,
        state: 'output-available',
        input,
        output,
      };
    case 'failed':
      return {
        type: 'dynamic-tool',
        toolCallId,
        toolName,
        title: toolName,
        providerExecuted: true,
        state: 'output-error',
        input,
        errorText: resolveToolErrorText(event),
      };
    case 'pending':
      return {
        type: 'dynamic-tool',
        toolCallId,
        toolName,
        title: toolName,
        providerExecuted: true,
        state: 'input-streaming',
        input,
      };
    case 'running':
    default:
      return {
        type: 'dynamic-tool',
        toolCallId,
        toolName,
        title: toolName,
        providerExecuted: true,
        state: 'input-available',
        input,
      };
  }
}

export function buildTerminalPart(
  event: AcpEventEnvelope,
  previous?: SessionTerminalData,
) {
  if (
    event.update.eventType !== 'terminal_created' &&
    event.update.eventType !== 'terminal_output' &&
    event.update.eventType !== 'terminal_exited'
  ) {
    return null;
  }

  const terminal = event.update.terminal;
  const terminalId = asText(terminal?.terminalId);
  if (!terminalId) {
    return null;
  }

  const nextData: SessionTerminalData = {
    terminalId,
    command: terminal?.command ?? previous?.command ?? null,
    args: terminal?.args ?? previous?.args,
    output: previous?.output ?? '',
    status: previous?.status ?? 'running',
    exitCode: previous?.exitCode,
  };

  if (event.update.eventType === 'terminal_output') {
    nextData.output = `${nextData.output}${terminal?.data ?? ''}`;
  }

  if (event.update.eventType === 'terminal_exited') {
    nextData.exitCode = terminal?.exitCode ?? null;
    nextData.status = (terminal?.exitCode ?? 0) === 0 ? 'completed' : 'failed';
  }

  return {
    type: 'data-terminal' as const,
    id: terminalId,
    data: nextData,
  };
}
