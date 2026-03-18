import type { AcpEventEnvelope } from '@shared/schema';

export function asText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

export function tryParseJsonString(value: string): unknown | null {
  const trimmed = value.trim();
  if (!(trimmed.startsWith('{') || trimmed.startsWith('['))) {
    return null;
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

export function normalizeToolValue(value: unknown): unknown {
  if (typeof value === 'string') {
    return tryParseJsonString(value) ?? value;
  }

  if (Array.isArray(value)) {
    const textParts = value
      .map((item) => {
        const record = asRecord(item);
        const text = record?.text;
        return typeof text === 'string' && text.trim() ? text : null;
      })
      .filter((item): item is string => item !== null);

    if (textParts.length === value.length && textParts.length > 0) {
      const joined = textParts.join('\n\n');
      return tryParseJsonString(joined) ?? joined;
    }

    return value.map((item) => normalizeToolValue(item));
  }

  return value;
}

export function normalizeErrorText(value: unknown): string | undefined {
  const normalizedValue = normalizeToolValue(value);
  if (normalizedValue == null) {
    return undefined;
  }

  return typeof normalizedValue === 'string'
    ? normalizedValue
    : JSON.stringify(normalizedValue, null, 2);
}

function looksLikeFilePath(title: string): boolean {
  const value = title.trim();
  if (!value) {
    return false;
  }

  return (
    value.startsWith('/') ||
    value.startsWith('./') ||
    value.startsWith('../') ||
    value.startsWith('~/') ||
    /^[A-Za-z]:[\\/]/.test(value) ||
    value.includes('\\') ||
    /\/[^/\s]+\.[A-Za-z0-9]{1,8}$/.test(value) ||
    /\.[A-Za-z0-9]{1,8}$/.test(value)
  );
}

function isGenericToolName(name: string | undefined | null): boolean {
  if (!name) {
    return true;
  }

  return ['other', 'tool', 'unknown', 'function', 'action'].includes(
    name.toLowerCase(),
  );
}

function inferFromInput(rawInput?: Record<string, unknown> | null): string | null {
  if (!rawInput) {
    return null;
  }

  const hasFilePath =
    'file_path' in rawInput || 'path' in rawInput || 'filePath' in rawInput;
  const hasContent = 'content' in rawInput || 'file_content' in rawInput;
  const hasCommand = 'command' in rawInput;
  const hasInfoRequest = 'information_request' in rawInput;
  const hasQuery = 'query' in rawInput;
  const hasPattern = 'pattern' in rawInput || 'glob_pattern' in rawInput;
  const hasUrl = 'url' in rawInput;
  const hasOldStr = 'old_str' in rawInput || 'old_str_1' in rawInput;
  const hasTerminalId = 'terminal_id' in rawInput;
  const hasInsertLine =
    'insert_line' in rawInput || 'insert_line_1' in rawInput;
  const hasViewRange = 'view_range' in rawInput;

  if (hasInfoRequest) return 'codebase-retrieval';
  if (hasOldStr && hasFilePath) return 'str-replace-editor';
  if (hasInsertLine && hasFilePath) return 'str-replace-editor';
  if (hasViewRange && hasFilePath) return 'view';
  if (hasFilePath && hasContent) return 'write-file';
  if (hasFilePath && !hasContent) return 'read-file';
  if (hasTerminalId && hasCommand) return 'launch-process';
  if (hasTerminalId) return 'terminal';
  if (hasCommand) return 'shell';
  if (hasUrl && hasQuery) return 'web-search';
  if (hasUrl) return 'web-fetch';
  if (hasPattern) return 'glob';
  if (hasQuery) return 'search';

  return null;
}

function extractProviderToolName(title: string | undefined | null): string | undefined {
  if (!title) {
    return undefined;
  }

  return title.match(/^Tool:\s+[^/]+\/([^/\s]+)$/)?.[1];
}

export function inferToolDisplayName(
  title: string | undefined | null,
  kind: string | undefined | null,
  rawInput?: Record<string, unknown> | null,
): string {
  const providerToolName = extractProviderToolName(title);
  if (providerToolName) {
    return providerToolName;
  }

  const inferredFromInput = inferFromInput(rawInput);

  if (title && looksLikeFilePath(title)) {
    return inferredFromInput ?? kind ?? 'read-file';
  }

  if (isGenericToolName(title)) {
    if (inferredFromInput) {
      return inferredFromInput;
    }
    if (!isGenericToolName(kind)) {
      return kind as string;
    }
    return 'tool';
  }

  return title ?? inferredFromInput ?? kind ?? 'tool';
}

function looksLikeOpaqueCallId(value: string | null): boolean {
  if (!value) {
    return false;
  }

  return (
    /^call[_-][A-Za-z0-9_-]{6,}$/.test(value) ||
    /^[0-9a-f]{8,}$/i.test(value)
  );
}

function summarizeCommand(value: unknown): string | null {
  if (typeof value === 'string') {
    const normalized = value.trim().replace(/\s+/g, ' ');
    if (!normalized) {
      return null;
    }

    return normalized.length > 72
      ? `${normalized.slice(0, 69)}...`
      : normalized;
  }

  if (Array.isArray(value)) {
    const joined = value
      .filter(
        (item): item is string => typeof item === 'string' && item.trim().length > 0,
      )
      .join(' ');
    return summarizeCommand(joined);
  }

  return null;
}

export function extractCommandLabel(
  rawUpdate: Record<string, unknown> | null,
): string | null {
  if (!rawUpdate) {
    return null;
  }

  const directCommand = summarizeCommand(rawUpdate.command);
  if (directCommand) {
    return directCommand;
  }

  const rawInput = asRecord(rawUpdate.rawInput);
  const nestedCommand = summarizeCommand(rawInput?.command);
  if (nestedCommand) {
    return nestedCommand;
  }

  const parsedCmd = rawUpdate.parsed_cmd;
  if (Array.isArray(parsedCmd)) {
    for (const entry of parsedCmd) {
      const nested = summarizeCommand(asRecord(entry)?.cmd);
      if (nested) {
        return nested;
      }
    }
  }

  return null;
}

export function getRawUpdateRecord(
  event: Pick<AcpEventEnvelope, 'update'>,
): Record<string, unknown> | null {
  const rawNotification = asRecord(event.update.rawNotification);
  if (!rawNotification) {
    return null;
  }

  const nestedUpdate = asRecord(rawNotification.update);
  return nestedUpdate ?? rawNotification;
}

export function buildSyntheticToolInput(
  rawUpdate: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (!rawUpdate) {
    return null;
  }

  const syntheticInput: Record<string, unknown> = {};
  for (const key of [
    'command',
    'cwd',
    'parsed_cmd',
    'source',
    'structuredContent',
  ]) {
    if (rawUpdate[key] !== undefined && rawUpdate[key] !== null) {
      syntheticInput[key] = rawUpdate[key];
    }
  }

  return Object.keys(syntheticInput).length > 0 ? syntheticInput : null;
}

export function resolveToolEventName(
  rawUpdate: Record<string, unknown> | null,
  options: {
    kind?: string | null;
    title?: string | null;
  },
): string {
  const primaryName =
    asText(rawUpdate?.tool) ??
    asText(rawUpdate?.toolName) ??
    asText(options.title) ??
    asText(rawUpdate?.title);

  if (primaryName && !looksLikeOpaqueCallId(primaryName)) {
    return primaryName;
  }

  return (
    extractCommandLabel(rawUpdate) ??
    asText(options.kind) ??
    asText(rawUpdate?.kind) ??
    primaryName ??
    'tool'
  );
}

export function resolveToolEventInput(
  toolCall: AcpEventEnvelope['update']['toolCall'],
  rawUpdate: Record<string, unknown> | null,
): unknown {
  if (!toolCall) {
    return null;
  }

  if (toolCall.input !== undefined && toolCall.input !== null) {
    return normalizeToolValue(toolCall.input);
  }

  if (rawUpdate?.rawInput !== undefined && rawUpdate.rawInput !== null) {
    return normalizeToolValue(rawUpdate.rawInput);
  }

  const syntheticInput = buildSyntheticToolInput(rawUpdate);
  if (syntheticInput) {
    return normalizeToolValue(syntheticInput);
  }

  if (toolCall.content.length > 0) {
    return normalizeToolValue(toolCall.content);
  }

  return null;
}

export function resolveToolEventOutput(
  toolCall: AcpEventEnvelope['update']['toolCall'],
  rawUpdate: Record<string, unknown> | null,
): unknown {
  if (!toolCall) {
    return null;
  }

  if (toolCall.output !== undefined && toolCall.output !== null) {
    return normalizeToolValue(toolCall.output);
  }

  if (rawUpdate?.rawOutput !== undefined && rawUpdate.rawOutput !== null) {
    return normalizeToolValue(rawUpdate.rawOutput);
  }

  if (
    rawUpdate?.structuredContent !== undefined &&
    rawUpdate.structuredContent !== null
  ) {
    return normalizeToolValue(rawUpdate.structuredContent);
  }

  for (const key of [
    'formatted_output',
    'aggregated_output',
    'stdout',
  ] as const) {
    const value = rawUpdate?.[key];
    if (typeof value === 'string' && value.trim()) {
      return normalizeToolValue(value);
    }
  }

  if (rawUpdate?.content !== undefined && rawUpdate.content !== null) {
    return normalizeToolValue(rawUpdate.content);
  }

  if (toolCall.content.length > 0) {
    return normalizeToolValue(toolCall.content);
  }

  return null;
}
