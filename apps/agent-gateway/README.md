# agent-gateway

Minimal protocol gateway skeleton for ACP/MCP/A2A integration.

## Endpoints

- `GET /version`
- `GET /capabilities`
- `GET /metrics` export gateway runtime metrics (session success rate, first token latency, completion rate, error distribution)
- `POST /sessions` create in-memory session
- `POST /sessions/:sessionId/events` ingest protocol event (`mcp|acp|a2a`)
- `GET /sessions/:sessionId/events?cursor=<eventId>` query events incrementally
- `GET /sessions/:sessionId/stream?cursor=<eventId>` SSE stream
- `POST /sessions/:sessionId/prompt` run provider prompt and stream output events
- `POST /sessions/:sessionId/cancel` cancel active provider run

## Observability

- Supports `X-Trace-Id` request header for cross-process log correlation
- Echoes `X-Trace-Id` in responses and event envelopes
- Exposes unified error structure: `code`, `category`, `retryable`, `retryAfterMs`

## Configuration

Configuration priority (high to low):

1. Environment variables
2. JSON config file (`AGENT_GATEWAY_CONFIG_FILE`)
3. Built-in defaults

### Environment variables

- `AGENT_GATEWAY_HOST` (default: `127.0.0.1`)
- `AGENT_GATEWAY_PORT` (default: `3321`)
- `AGENT_GATEWAY_VERSION` (default: `0.1.0`)
- `AGENT_GATEWAY_PROTOCOLS` (comma-separated, default: `mcp,acp,a2a`)
- `AGENT_GATEWAY_PROVIDERS` (comma-separated, default: `opencode,codex,gemini,copilot,auggie,kimi,kiro,qoder`)
- `AGENT_GATEWAY_DEFAULT_PROVIDER` (default: `opencode`)
- `TEAMAI_ACP_<PROVIDER>_COMMAND` override command for ACP CLI providers such as `codex`, `opencode`, `gemini`, `copilot`, `auggie`, `kimi`, `kiro`, and `qoder`
- `AGENT_GATEWAY_TIMEOUT_MS` (default: `300000`)
- `AGENT_GATEWAY_RETRY_ATTEMPTS` (default: `2`)
- `AGENT_GATEWAY_MAX_CONCURRENT_SESSIONS` (default: `32`)
- `AGENT_GATEWAY_LOG_LEVEL` (`debug|info|warn|error`, default: `info`)
- `AGENT_GATEWAY_CONFIG_FILE` (optional JSON file path)

## Local run

```bash
npx nx dev @agent-gateway/main
# or
cd apps/agent-gateway && pnpm dev
```

## Contract tests

```bash
npx nx test @agent-gateway/main
```

Versioned protocol contract:

- `docs/contracts/agent-gateway-acp-v1.md`
