# @orchestration/runtime-acp

`@orchestration/runtime-acp` contains the ACP runtime layer used by `local-server`.
It is responsible for ACP session runtime concerns, not HTTP route behavior or
project-specific application workflows.

## Scope

This library owns:

- ACP runtime clients
  - local ACP runtime client
  - agent-gateway client
  - agent-gateway-backed ACP runtime client
- ACP Fastify runtime plugins
  - `executionRuntimePlugin`
  - `agentGatewayClientPlugin`
  - `acpRuntimePlugin`
  - `acpStreamPlugin`
  - `acpSessionReaperPlugin`
- ACP runtime schemas and error/diagnostic primitives
- canonical ACP update normalization and session-update state helpers
- runtime-only context helpers such as local MCP bootstrap server resolution

This library does not own:

- HTTP routes and presenters
- SQLite-backed session persistence
- project/task/workflow business logic
- MCP route handling

Those remain in `apps/local-server`.

## Public API

Primary exports are defined in `src/lib/index.ts`.

Main areas:

- `clients/*`
- `plugins/*`
- `schemas/*`
- `providers/*`
- `services/canonical-acp-update`
- `services/normalized-session-update`
- `services/session-update-state`
- `utils/session-runtime-context`
- `errors/problem-error`
- `diagnostics`

## Integration

`local-server` consumes this package directly:

```ts
import {
  acpRuntimePlugin,
  acpSessionReaperPlugin,
  acpStreamPlugin,
  agentGatewayClientPlugin,
  executionRuntimePlugin,
} from '@orchestration/runtime-acp';
```

Recommended Fastify registration order:

1. `acpStreamPlugin`
2. `executionRuntimePlugin`
3. `agentGatewayClientPlugin`
4. `acpRuntimePlugin`
5. `acpSessionReaperPlugin`

## Commands

Build:

```bash
npx nx build @orchestration/runtime-acp
```

Test:

```bash
npx nx test @orchestration/runtime-acp
```

## Migration Notes

ACP runtime code was moved out of `apps/local-server/src/app` so callers depend
on `@orchestration/runtime-acp` directly instead of local re-export shims.

When moving more ACP logic into this library, keep this rule:

- runtime protocol / process / Fastify adapter code belongs here
- SQLite persistence and Team AI application orchestration stay in `local-server`
