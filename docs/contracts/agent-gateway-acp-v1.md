# Agent Gateway ACP Contract v1

Status: active  
Version: `v1`  
Compatibility target: Java `HttpAgentProtocolGateway` + ACP runtime bridge

## Scope

This contract defines the minimum stable protocol between Java runtime bridge and `apps/agent-gateway`.

Covered flows:
- `session/new` via `POST /sessions`
- `session/prompt` via `POST /sessions/:id/prompt`
- `session/cancel` via `POST /sessions/:id/cancel`
- history polling via `GET /sessions/:id/events?cursor=...`
- stream via `GET /sessions/:id/stream`

## Trace Correlation

- Request header: `X-Trace-Id` (optional)
- Request body field: `traceId` (optional)
- Response header: `X-Trace-Id` (required, echoed or generated)
- Event envelope field: `traceId` (required)

## Error Model

Gateway error response shape:

```json
{
  "error": {
    "code": "INVALID_PROTOCOL",
    "category": "protocol",
    "message": "protocol must be one of mcp|acp|a2a",
    "retryable": false,
    "retryAfterMs": 0
  },
  "traceId": "..."
}
```

Category values:
- `protocol`
- `runtime`
- `provider`
- `unknown`

## Session Endpoints

### `POST /sessions`

Request:

```json
{
  "provider": "codex",
  "traceId": "trace-1"
}
```

Response `201`:
- `session.sessionId` non-empty
- initial state must be `PENDING`

### `POST /sessions/:sessionId/prompt`

Request:

```json
{
  "input": "hello",
  "timeoutMs": 30000,
  "traceId": "trace-1"
}
```

Response `202`:
- `accepted = true`
- session state transitions to `RUNNING`

Expected event sequence (eventually):
1. `status` (RUNNING)
2. zero or more `delta`
3. terminal event: `complete` or `error`

### `POST /sessions/:sessionId/cancel`

Response `202`:
- `accepted = true`
- session transitions to `CANCELLED` when provider run is active

### `GET /sessions/:sessionId/events`

- Without cursor: returns all events
- With cursor: returns strictly newer events

### `GET /sessions/:sessionId/stream`

- SSE content-type required: `text/event-stream`
- Sends `connected` event first
- Emits gateway events incrementally

## Metrics Export

`GET /metrics` must expose:
- session creation success rate
- first-token latency
- prompt completion rate
- error distribution by category/code

## Regression Gate

Contract regression tests:
- `apps/agent-gateway/src/server.contract.test.ts`
- executed by: `npx nx test @agent-gateway/main`
