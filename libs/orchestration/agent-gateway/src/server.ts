import http from 'node:http';
import { URL } from 'node:url';
import type { GatewayConfig } from './config.js';
import { Logger } from './logger.js';
import {
  classifyErrorCode,
  GatewayMetrics,
  resolveTraceId,
} from './observability.js';
import {
  SessionNotFoundError,
  SessionStateTransitionError,
  SessionStore,
  type GatewayEventEnvelope,
  type ProtocolName,
} from './session-store.js';
import { mapProtocolEvent } from './protocol-event-mapper.js';
import type {
  AcpProviderCatalogPayload,
  AcpProviderDistributionType,
  InstallAcpProviderPayload,
} from './provider-management.js';
import { isProviderManagementError } from './provider-management.js';
import type {
  NormalizedAcpUpdate,
  ProviderPromptRequest,
  ProviderProtocolEvent,
} from './providers/provider-types.js';

const TRACE_ID_HEADER = 'X-Trace-Id';
const TERMINAL_SESSION_STATES = new Set(['FAILED', 'CANCELLED']);

class BadRequestError extends Error {
  readonly code = 'INVALID_REQUEST_BODY';
}

export type ProviderRuntimePort = {
  prompt(
    providerName: string,
    request: ProviderPromptRequest,
    callbacks: {
      onChunk: (chunk: string) => void;
      onEvent: (event: ProviderProtocolEvent) => void;
      onComplete: () => void;
      onError: (error: {
        code: string;
        message: string;
        retryable: boolean;
        retryAfterMs: number;
        timeoutScope?: string;
      }) => void;
    },
  ): void;
  cancel(providerName: string, sessionId: string): boolean;
};

export type ProviderManagementPort = {
  installProvider(input: {
    distributionType?: AcpProviderDistributionType;
    providerId: string;
  }): Promise<InstallAcpProviderPayload>;
  listProviders(options?: {
    includeRegistry?: boolean;
  }): Promise<AcpProviderCatalogPayload>;
};

export function createGatewayServer(
  config: GatewayConfig,
  logger: Logger,
  sessionStore: SessionStore,
  providerRuntime: ProviderRuntimePort,
  providerManagement: ProviderManagementPort,
  metrics: GatewayMetrics,
): http.Server {
  return http.createServer(async (req, res) => {
    const method = req.method ?? 'GET';
    const requestUrl = req.url ?? '/';
    const url = new URL(requestUrl, `http://${config.host}:${config.port}`);
    const traceIdFromHeader = resolveTraceId(readTraceIdHeader(req), undefined);

    logger.debug('incoming request', {
      traceId: traceIdFromHeader,
      method,
      path: url.pathname,
    });

    try {
      if (method === 'GET' && url.pathname === '/version') {
        writeJsonWithTrace(res, 200, traceIdFromHeader, {
          name: 'agent-gateway',
          version: config.version,
          runtime: 'node',
          nodeVersion: process.version,
        });
        return;
      }

      if (method === 'GET' && url.pathname === '/capabilities') {
        writeJsonWithTrace(res, 200, traceIdFromHeader, {
          protocols: config.protocols,
          providers: config.providers,
          defaultProvider: config.defaultProvider,
          limits: {
            timeouts: config.timeouts,
            retryAttempts: config.retryAttempts,
            maxConcurrentSessions: config.maxConcurrentSessions,
          },
        });
        return;
      }

      if (method === 'GET' && url.pathname === '/metrics') {
        writeJsonWithTrace(res, 200, traceIdFromHeader, metrics.snapshot());
        return;
      }

      if (method === 'GET' && url.pathname === '/providers') {
        const registry = parseBooleanQuery(url.searchParams.get('registry'));
        const payload = await providerManagement.listProviders({
          includeRegistry: registry ?? true,
        });
        writeJsonWithTrace(res, 200, traceIdFromHeader, payload);
        return;
      }

      if (method === 'POST' && url.pathname === '/providers/install') {
        const body = await readJsonBody(req);
        const providerId = asOptionalString(body.providerId);
        if (!providerId) {
          writeError(
            res,
            400,
            traceIdFromHeader,
            'INVALID_PROVIDER_ID',
            'providerId must be a non-empty string',
            false,
            0,
          );
          return;
        }

        const distributionType = asDistributionType(body.distributionType);
        if (body.distributionType !== undefined && distributionType === null) {
          writeError(
            res,
            400,
            traceIdFromHeader,
            'INVALID_DISTRIBUTION_TYPE',
            'distributionType must be one of npx|uvx|binary',
            false,
            0,
          );
          return;
        }

        const payload = await providerManagement.installProvider({
          providerId,
          ...(distributionType ? { distributionType } : {}),
        });
        writeJsonWithTrace(res, 200, traceIdFromHeader, payload);
        return;
      }

      if (method === 'POST' && url.pathname === '/sessions') {
        const body = await readJsonBody(req);
        const traceId = resolveTraceId(
          traceIdFromHeader,
          asOptionalString(body.traceId),
        );
        const provider =
          asOptionalString(body.provider) ?? config.defaultProvider;
        const model = asOptionalString(body.model);
        const metadata = {
          ...(asRecord(body.metadata) ?? {}),
          ...(model ? { model } : {}),
        };
        metrics.sessionCreateStarted();
        const session = sessionStore.createSession(provider, traceId, metadata);
        metrics.sessionCreateSucceeded();
        writeJsonWithTrace(res, 201, traceId, {
          session,
        });
        return;
      }

      const promptRoute = matchRoute(
        url.pathname,
        /^\/sessions\/([^/]+)\/prompt$/,
      );
      if (promptRoute && method === 'POST') {
        const body = await readJsonBody(req);
        const traceId = resolveTraceId(
          traceIdFromHeader,
          asOptionalString(body.traceId),
        );
        const input = asOptionalString(body.input);
        if (!input) {
          writeError(
            res,
            400,
            traceId,
            'INVALID_PROMPT',
            'input must be a non-empty string',
            false,
            0,
          );
          return;
        }

        const timeoutMs =
          asPositiveNumber(body.timeoutMs) ?? config.timeouts.promptTimeoutMs;
        const session = sessionStore.getSession(promptRoute.param);
        const cwd = asOptionalString(body.cwd);
        const env = asStringRecord(body.env);
        const metadata = asRecord(body.metadata);
        const model = asOptionalString(session.metadata.model);
        const request: ProviderPromptRequest = {
          sessionId: promptRoute.param,
          input,
          ...(model ? { model } : {}),
          timeoutMs,
          traceId,
          ...(cwd ? { cwd } : {}),
          ...(env ? { env } : {}),
          ...(metadata ? { metadata } : {}),
        };
        metrics.promptStarted(promptRoute.param);
        let sawCanonicalTurnComplete = false;
        let canonicalTurnTerminalState: 'CANCELLED' | 'FAILED' | undefined;

        sessionStore.appendEvent(promptRoute.param, {
          type: 'status',
          traceId,
          data: {
            state: 'RUNNING',
            reason: 'prompt-started',
            provider: session.provider,
            ...(request.cwd ? { cwd: request.cwd } : {}),
            ...(request.metadata ? { metadata: request.metadata } : {}),
          },
          nextState: 'RUNNING',
        });

        providerRuntime.prompt(session.provider, request, {
          onEvent: (event) => {
            if (
              event.protocol === 'acp' &&
              event.update.eventType === 'turn_complete'
            ) {
              sawCanonicalTurnComplete = true;
              canonicalTurnTerminalState = event.update.turnComplete?.state;
            }

            const normalizedEvent = mapProtocolEvent(
              event.protocol === 'acp'
                ? {
                    protocol: 'acp',
                    update: event.update,
                    traceId: event.traceId ?? traceId,
                  }
                : {
                    protocol: event.protocol,
                    payload: event.payload,
                    traceId: event.traceId ?? traceId,
                  },
            );

            if (
              normalizedEvent.nextState &&
              TERMINAL_SESSION_STATES.has(normalizedEvent.nextState) &&
              !(
                event.protocol === 'acp' &&
                event.update.eventType === 'turn_complete'
              )
            ) {
              normalizedEvent.nextState = undefined;
            }

            if (normalizedEvent.type === 'delta') {
              metrics.firstToken(promptRoute.param);
            }

            if (normalizedEvent.error) {
              metrics.recordError(normalizedEvent.error.code);
              normalizedEvent.data = {
                ...(normalizedEvent.data ?? {}),
                category: classifyErrorCode(normalizedEvent.error.code),
              };
            }

            sessionStore.appendEvent(promptRoute.param, normalizedEvent);
          },
          onChunk: (chunk) => {
            metrics.firstToken(promptRoute.param);
            sessionStore.appendEvent(promptRoute.param, {
              type: 'delta',
              traceId,
              data: {
                protocol: 'acp',
                provider: session.provider,
                text: chunk,
              },
              nextState: 'RUNNING',
            });
          },
          onComplete: () => {
            const currentSession = sessionStore.getSession(promptRoute.param);
            if (TERMINAL_SESSION_STATES.has(currentSession.state)) {
              return;
            }
            metrics.promptCompletedNow(promptRoute.param);
            if (sawCanonicalTurnComplete) {
              return;
            }
            sessionStore.appendEvent(promptRoute.param, {
              type: 'complete',
              traceId,
              data: {
                provider: session.provider,
                reason: 'prompt-finished',
              },
            });
          },
          onError: (error) => {
            const currentSession = sessionStore.getSession(promptRoute.param);
            if (TERMINAL_SESSION_STATES.has(currentSession.state)) {
              return;
            }
            metrics.promptFailedNow(promptRoute.param, error.code);
            if (error.code === 'PROVIDER_CANCELLED') {
              if (
                sawCanonicalTurnComplete &&
                canonicalTurnTerminalState === 'CANCELLED'
              ) {
                return;
              }
              sessionStore.appendEvent(promptRoute.param, {
                type: 'complete',
                traceId,
                data: {
                  provider: session.provider,
                  reason: 'cancelled',
                },
                nextState: 'CANCELLED',
              });
              return;
            }

            if (
              sawCanonicalTurnComplete &&
              canonicalTurnTerminalState === 'FAILED'
            ) {
              return;
            }

            sessionStore.appendEvent(promptRoute.param, {
              type: 'error',
              traceId,
              data: {
                provider: session.provider,
                category: classifyErrorCode(error.code),
              },
              error,
              nextState: 'FAILED',
            });
          },
        });

        writeJsonWithTrace(res, 202, traceId, {
          accepted: true,
          session: sessionStore.getSession(promptRoute.param),
          runtime: {
            provider: session.provider,
            timeoutMs,
            ...(request.cwd ? { cwd: request.cwd } : {}),
            ...(request.env ? { env: request.env } : {}),
            ...(request.metadata ? { metadata: request.metadata } : {}),
          },
        });
        return;
      }

      const cancelRoute = matchRoute(
        url.pathname,
        /^\/sessions\/([^/]+)\/cancel$/,
      );
      if (cancelRoute && method === 'POST') {
        const body = await readJsonBody(req);
        const traceId = resolveTraceId(
          traceIdFromHeader,
          asOptionalString(body.traceId),
        );
        const reason = asOptionalString(body.reason) ?? 'cancel-requested';
        const session = sessionStore.getSession(cancelRoute.param);
        const cancelled = providerRuntime.cancel(
          session.provider,
          cancelRoute.param,
        );

        if (cancelled) {
          metrics.promptFailedNow(cancelRoute.param, 'PROVIDER_CANCELLED');
          sessionStore.appendEvent(cancelRoute.param, {
            type: 'complete',
            traceId,
            data: {
              provider: session.provider,
              reason,
            },
            nextState: 'CANCELLED',
          });
        }

        writeJsonWithTrace(res, 202, traceId, {
          accepted: true,
          cancelled,
          session: sessionStore.getSession(cancelRoute.param),
        });
        return;
      }

      const eventsRoute = matchRoute(
        url.pathname,
        /^\/sessions\/([^/]+)\/events$/,
      );
      if (eventsRoute && method === 'POST') {
        const body = await readJsonBody(req);
        const traceId = resolveTraceId(
          traceIdFromHeader,
          asOptionalString(body.traceId),
        );
        const protocol = asProtocolName(body.protocol);
        if (!protocol) {
          writeError(
            res,
            400,
            traceId,
            'INVALID_PROTOCOL',
            'protocol must be one of mcp|acp|a2a',
            false,
            0,
          );
          return;
        }

        if (protocol === 'acp') {
          if (!body.update || typeof body.update !== 'object') {
            writeError(
              res,
              400,
              traceId,
              'INVALID_REQUEST_BODY',
              'acp events must provide update as a JSON object',
              false,
              0,
            );
            return;
          }
        }

        const normalizedEvent = mapProtocolEvent(
          protocol === 'acp'
            ? {
                protocol: 'acp',
                update: body.update as NormalizedAcpUpdate,
                traceId,
              }
            : {
                protocol,
                payload: body.payload,
                traceId,
              },
        );
        if (normalizedEvent.error) {
          metrics.recordError(normalizedEvent.error.code);
          normalizedEvent.data = {
            ...(normalizedEvent.data ?? {}),
            category: classifyErrorCode(normalizedEvent.error.code),
          };
        }

        const event = sessionStore.appendEvent(
          eventsRoute.param,
          normalizedEvent,
        );
        writeJsonWithTrace(res, 202, traceId, {
          session: sessionStore.getSession(eventsRoute.param),
          event,
        });
        return;
      }

      if (eventsRoute && method === 'GET') {
        const cursor = url.searchParams.get('cursor');
        const events = sessionStore.listEventsSince(eventsRoute.param, cursor);
        const session = sessionStore.getSession(eventsRoute.param);
        writeJsonWithTrace(res, 200, traceIdFromHeader, {
          session,
          cursor,
          nextCursor:
            events.length > 0
              ? events[events.length - 1].cursor
              : session.lastCursor,
          events,
        });
        return;
      }

      const streamRoute = matchRoute(
        url.pathname,
        /^\/sessions\/([^/]+)\/stream$/,
      );
      if (streamRoute && method === 'GET') {
        const traceId = traceIdFromHeader;
        const cursor = url.searchParams.get('cursor');
        const initialEvents = sessionStore.listEventsSince(
          streamRoute.param,
          cursor,
        );
        const session = sessionStore.getSession(streamRoute.param);
        openSseStream(
          res,
          traceId,
          streamRoute.param,
          sessionStore,
          initialEvents,
          session.lastCursor,
        );
        return;
      }

      writeError(
        res,
        404,
        traceIdFromHeader,
        'NOT_FOUND',
        `Unknown endpoint: ${url.pathname}`,
        false,
        0,
      );
    } catch (error) {
      handleError(res, error, traceIdFromHeader, logger, metrics);
    }
  });
}

function openSseStream(
  response: http.ServerResponse,
  traceId: string,
  sessionId: string,
  sessionStore: SessionStore,
  initialEvents: GatewayEventEnvelope[],
  currentCursor: string | null,
): void {
  response.statusCode = 200;
  response.setHeader(TRACE_ID_HEADER, traceId);
  response.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  response.setHeader('Cache-Control', 'no-cache');
  response.setHeader('Connection', 'keep-alive');
  response.flushHeaders();

  response.write(`event: connected\n`);
  response.write(
    `data: ${JSON.stringify({ sessionId, cursor: currentCursor })}\n\n`,
  );

  for (const event of initialEvents) {
    writeSseEvent(response, event);
  }

  const unsubscribe = sessionStore.subscribe(sessionId, (event) => {
    writeSseEvent(response, event);
  });

  const heartbeat = setInterval(() => {
    response.write(': heartbeat\n\n');
  }, 15_000);

  response.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
    response.end();
  });
}

function writeSseEvent(
  response: http.ServerResponse,
  event: GatewayEventEnvelope,
): void {
  response.write('event: gateway-event\n');
  response.write(`id: ${event.cursor}\n`);
  response.write(`data: ${JSON.stringify(event)}\n\n`);
}

function writeJson(
  response: http.ServerResponse,
  statusCode: number,
  payload: object,
): void {
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(payload));
}

function writeJsonWithTrace(
  response: http.ServerResponse,
  statusCode: number,
  traceId: string,
  payload: object,
): void {
  response.setHeader(TRACE_ID_HEADER, traceId);
  writeJson(response, statusCode, {
    ...payload,
    traceId,
  });
}

function writeError(
  response: http.ServerResponse,
  statusCode: number,
  traceId: string,
  code: string,
  message: string,
  retryable: boolean,
  retryAfterMs: number,
): void {
  writeJsonWithTrace(response, statusCode, traceId, {
    error: {
      code,
      category: classifyErrorCode(code),
      message,
      retryable,
      retryAfterMs,
    },
  });
}

function handleError(
  response: http.ServerResponse,
  error: unknown,
  traceId: string,
  logger: Logger,
  metrics: GatewayMetrics,
): void {
  if (error instanceof SessionNotFoundError) {
    metrics.recordError(error.code, 'protocol');
    writeError(response, 404, traceId, error.code, error.message, false, 0);
    return;
  }

  if (error instanceof SessionStateTransitionError) {
    metrics.recordError(error.code, 'runtime');
    writeError(response, 409, traceId, error.code, error.message, false, 0);
    return;
  }

  if (error instanceof BadRequestError) {
    metrics.recordError(error.code, 'protocol');
    writeError(response, 400, traceId, error.code, error.message, false, 0);
    return;
  }

  if (isProviderManagementError(error)) {
    metrics.recordError(error.code, 'runtime');
    writeError(
      response,
      error.status,
      traceId,
      error.code,
      error.message,
      error.retryable,
      error.retryAfterMs,
    );
    return;
  }

  if (error instanceof Error) {
    const message =
      error.message.trim().length > 0 ? error.message : 'Internal server error';
    metrics.recordError('INTERNAL_ERROR', 'runtime');
    logger.error('gateway request failed', {
      traceId,
      code: 'INTERNAL_ERROR',
      message,
    });
    writeError(response, 500, traceId, 'INTERNAL_ERROR', message, true, 1000);
    return;
  }

  metrics.recordError('INTERNAL_ERROR', 'runtime');
  writeError(
    response,
    500,
    traceId,
    'INTERNAL_ERROR',
    'Unknown server error',
    true,
    1000,
  );
}

function parseBooleanQuery(value: string | null): boolean | null {
  if (value === null) {
    return null;
  }

  if (value === 'true') {
    return true;
  }

  if (value === 'false') {
    return false;
  }

  return null;
}

function asDistributionType(
  value: unknown,
): AcpProviderDistributionType | null {
  if (value === 'npx' || value === 'uvx' || value === 'binary') {
    return value;
  }

  return null;
}

function matchRoute(
  pathname: string,
  pattern: RegExp,
): { param: string } | null {
  const match = pathname.match(pattern);
  if (!match) {
    return null;
  }
  return { param: decodeURIComponent(match[1]) };
}

async function readJsonBody(
  request: http.IncomingMessage,
): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.from(chunk));
  }

  const raw = Buffer.concat(chunks).toString('utf-8').trim();
  if (raw.length === 0) {
    return {};
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new BadRequestError('Request body must be valid JSON object');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new BadRequestError('Request body must be a JSON object');
  }

  return parsed as Record<string, unknown>;
}

function asOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  if (value.trim().length === 0) {
    return undefined;
  }
  return value;
}

function readTraceIdHeader(request: http.IncomingMessage): string | undefined {
  const value = request.headers[TRACE_ID_HEADER.toLowerCase()];
  if (Array.isArray(value)) {
    return asOptionalString(value[0]);
  }
  return asOptionalString(value);
}

function asProtocolName(value: unknown): ProtocolName | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.toLowerCase();
  if (normalized === 'mcp' || normalized === 'acp' || normalized === 'a2a') {
    return normalized;
  }
  return null;
}

function asPositiveNumber(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  if (value <= 0) {
    return null;
  }
  return value;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return { ...(value as Record<string, unknown>) };
}

function asStringRecord(value: unknown): Record<string, string> | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const entries = Object.entries(record);
  if (entries.some(([, entryValue]) => typeof entryValue !== 'string')) {
    throw new BadRequestError('env must be a JSON object with string values');
  }

  return Object.fromEntries(entries) as Record<string, string>;
}
