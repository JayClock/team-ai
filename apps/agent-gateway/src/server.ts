import http from 'node:http';
import { URL } from 'node:url';
import type { GatewayConfig } from './config.js';
import { Logger } from './logger.js';
import {
  SessionNotFoundError,
  SessionStateTransitionError,
  SessionStore,
  type GatewayEventEnvelope,
  type ProtocolName,
} from './session-store.js';
import { mapProtocolEvent } from './protocol-event-mapper.js';

export function createGatewayServer(
  config: GatewayConfig,
  logger: Logger,
  sessionStore: SessionStore
): http.Server {
  const startedAt = Date.now();

  return http.createServer(async (req, res) => {
    const method = req.method ?? 'GET';
    const requestUrl = req.url ?? '/';
    const url = new URL(requestUrl, `http://${config.host}:${config.port}`);

    logger.debug('incoming request', { method, path: url.pathname });

    try {
      if (method === 'GET' && url.pathname === '/health') {
        writeJson(res, 200, {
          status: 'ok',
          service: 'agent-gateway',
          uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
        });
        return;
      }

      if (method === 'GET' && url.pathname === '/version') {
        writeJson(res, 200, {
          name: 'agent-gateway',
          version: config.version,
          runtime: 'node',
          nodeVersion: process.version,
        });
        return;
      }

      if (method === 'GET' && url.pathname === '/capabilities') {
        writeJson(res, 200, {
          protocols: config.protocols,
          providers: config.providers,
          limits: {
            timeoutMs: config.timeoutMs,
            retryAttempts: config.retryAttempts,
            maxConcurrentSessions: config.maxConcurrentSessions,
          },
        });
        return;
      }

      if (method === 'POST' && url.pathname === '/sessions') {
        const body = await readJsonBody(req);
        const traceId = asOptionalString(body.traceId);
        const session = sessionStore.createSession(traceId);
        writeJson(res, 201, {
          session,
        });
        return;
      }

      const eventsRoute = matchRoute(url.pathname, /^\/sessions\/([^/]+)\/events$/);
      if (eventsRoute && method === 'POST') {
        const body = await readJsonBody(req);
        const protocol = asProtocolName(body.protocol);
        if (!protocol) {
          writeJson(res, 400, {
            error: {
              code: 'INVALID_PROTOCOL',
              message: 'protocol must be one of mcp|acp|a2a',
            },
          });
          return;
        }

        const normalizedEvent = mapProtocolEvent({
          protocol,
          payload: body.payload,
          traceId: asOptionalString(body.traceId),
        });

        const event = sessionStore.appendEvent(eventsRoute.param, normalizedEvent);
        writeJson(res, 202, {
          session: sessionStore.getSession(eventsRoute.param),
          event,
        });
        return;
      }

      if (eventsRoute && method === 'GET') {
        const cursor = url.searchParams.get('cursor');
        const events = sessionStore.listEventsSince(eventsRoute.param, cursor);
        const session = sessionStore.getSession(eventsRoute.param);
        writeJson(res, 200, {
          session,
          cursor,
          nextCursor: events.length > 0 ? events[events.length - 1].cursor : session.lastCursor,
          events,
        });
        return;
      }

      const streamRoute = matchRoute(url.pathname, /^\/sessions\/([^/]+)\/stream$/);
      if (streamRoute && method === 'GET') {
        const cursor = url.searchParams.get('cursor');
        const initialEvents = sessionStore.listEventsSince(streamRoute.param, cursor);
        const session = sessionStore.getSession(streamRoute.param);
        openSseStream(res, streamRoute.param, sessionStore, initialEvents, session.lastCursor);
        return;
      }

      writeJson(res, 404, {
        error: 'not_found',
        message: `Unknown endpoint: ${url.pathname}`,
      });
    } catch (error) {
      handleError(res, error);
    }
  });
}

function openSseStream(
  response: http.ServerResponse,
  sessionId: string,
  sessionStore: SessionStore,
  initialEvents: GatewayEventEnvelope[],
  currentCursor: string | null
): void {
  response.statusCode = 200;
  response.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  response.setHeader('Cache-Control', 'no-cache');
  response.setHeader('Connection', 'keep-alive');
  response.flushHeaders();

  response.write(`event: connected\n`);
  response.write(`data: ${JSON.stringify({ sessionId, cursor: currentCursor })}\n\n`);

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

function writeSseEvent(response: http.ServerResponse, event: GatewayEventEnvelope): void {
  response.write('event: gateway-event\n');
  response.write(`id: ${event.cursor}\n`);
  response.write(`data: ${JSON.stringify(event)}\n\n`);
}

function writeJson(
  response: http.ServerResponse,
  statusCode: number,
  payload: Record<string, unknown>
): void {
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(payload));
}

function handleError(response: http.ServerResponse, error: unknown): void {
  if (error instanceof SessionNotFoundError) {
    writeJson(response, 404, {
      error: {
        code: error.code,
        message: error.message,
        retryable: false,
      },
    });
    return;
  }

  if (error instanceof SessionStateTransitionError) {
    writeJson(response, 409, {
      error: {
        code: error.code,
        message: error.message,
        retryable: false,
      },
    });
    return;
  }

  if (error instanceof Error) {
    writeJson(response, 500, {
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message,
        retryable: true,
        retryAfterMs: 1000,
      },
    });
    return;
  }

  writeJson(response, 500, {
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Unknown server error',
      retryable: true,
      retryAfterMs: 1000,
    },
  });
}

function matchRoute(pathname: string, pattern: RegExp): { param: string } | null {
  const match = pathname.match(pattern);
  if (!match) {
    return null;
  }
  return { param: decodeURIComponent(match[1]) };
}

async function readJsonBody(request: http.IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.from(chunk));
  }

  const raw = Buffer.concat(chunks).toString('utf-8').trim();
  if (raw.length === 0) {
    return {};
  }

  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Request body must be a JSON object');
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
