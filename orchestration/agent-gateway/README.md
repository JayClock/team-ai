# orchestration/agent-gateway

Shared agent-gateway implementation for the sidecar app in `apps/agent-gateway`.

## Endpoints

- `GET /version`
- `GET /capabilities`
- `GET /metrics`
- `POST /sessions`
- `POST /sessions/:sessionId/events`
- `GET /sessions/:sessionId/events?cursor=<eventId>`
- `GET /sessions/:sessionId/stream?cursor=<eventId>`
- `POST /sessions/:sessionId/prompt`
- `POST /sessions/:sessionId/cancel`

## Configuration

Configuration priority, high to low:

1. Environment variables
2. JSON config file (`AGENT_GATEWAY_CONFIG_FILE`)
3. Built-in defaults

Environment variables:

- `AGENT_GATEWAY_HOST`
- `AGENT_GATEWAY_PORT`
- `AGENT_GATEWAY_VERSION`
- `AGENT_GATEWAY_PROTOCOLS`
- `AGENT_GATEWAY_PROVIDERS`
- `AGENT_GATEWAY_DEFAULT_PROVIDER`
- `TEAMAI_ACP_<PROVIDER>_COMMAND`
- `AGENT_GATEWAY_TIMEOUT_MS`
- `AGENT_GATEWAY_RETRY_ATTEMPTS`
- `AGENT_GATEWAY_MAX_CONCURRENT_SESSIONS`
- `AGENT_GATEWAY_LOG_LEVEL`
- `AGENT_GATEWAY_CONFIG_FILE`

## Tasks

- Build: `npx nx build @orchestration/agent-gateway`
- Test: `npx nx test @orchestration/agent-gateway`
- Sidecar dev entry: `npx nx dev @agent-gateway/main`
