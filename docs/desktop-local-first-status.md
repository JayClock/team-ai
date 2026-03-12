# Desktop Local-First Status

## Status

- Updated: 2026-03-08
- Scope: Electron desktop shell + local Node server + desktop web client
- Source of truth: current implementation under `apps/desktop`, `apps/local-server`, and `apps/web`

## Overview

The desktop runtime now consists of four cooperating parts:

- `apps/desktop`
  - Starts Electron
  - Launches the local Node server
  - Injects desktop runtime configuration into the renderer
- `apps/local-server`
  - Exposes the local HTTP API on `127.0.0.1`
  - Persists desktop data in SQLite
  - Owns ACP session state, message streaming, and sync control state
- `apps/agent-gateway`
  - Exposes the local execution gateway on `127.0.0.1`
  - Owns local provider session state and CLI execution lifecycle
  - Bridges local execution requests to agent CLIs such as `codex`
- `apps/web`
  - Uses the desktop runtime API base URL when running inside Electron
  - Sends the desktop session header automatically
  - Renders project, ACP session, conversation, and message flows against the local server

## Current Delivery Status

### Delivered

- Electron desktop shell
- Local Node server bootstrap
- Desktop session authentication
- Problem JSON error handling
- SQLite bootstrap from a single schema snapshot
- Project CRUD routes
- Conversation CRUD routes
- Message routes with local SSE output
- Provider and agent routes
- ACP session contract and runtime integration
- Sync status and manual sync control routes

### Not Yet Delivered

- Real cloud push and pull synchronization
- Automatic multi-device reconciliation
- Team collaboration APIs over the desktop local-first flow
- Background sync scheduling beyond manual run / pause / resume
- Advanced conflict resolution UI
- Production-ready sync worker with remote transport

## Desktop Startup Flow

1. Electron main starts.
2. Electron starts `apps/agent-gateway`.
3. Electron waits for an IPC `sidecar-ready` message from the local gateway child process.
4. Electron starts `apps/local-server` with the local gateway base URL injected.
5. The desktop shell waits for an IPC `sidecar-ready` message from the local server child process.
6. Preload exposes:
   - local API base URL
   - desktop session header name
   - desktop session token
7. The web renderer initializes the HATEOAS client from that runtime config.

## Implemented Local API Surface

All routes below are currently implemented by `apps/local-server`.

### Core

- `GET /api`
- `GET /api/settings`
- `PATCH /api/settings`

### Projects

- `GET /api/projects`
- `POST /api/projects`
- `GET /api/projects/:projectId`
- `PATCH /api/projects/:projectId`
- `DELETE /api/projects/:projectId`

### Conversations

- `GET /api/projects/:projectId/conversations`
- `POST /api/projects/:projectId/conversations`
- `GET /api/conversations/:conversationId`
- `PATCH /api/conversations/:conversationId`
- `DELETE /api/conversations/:conversationId`

### Messages

- `GET /api/conversations/:conversationId/messages`
- `POST /api/conversations/:conversationId/messages`
- `GET /api/conversations/:conversationId/stream`
- `POST /api/messages/:messageId/retry`

### Providers and Agents

- `GET /api/providers`
- `GET /api/providers/models`
- `GET /api/agents`
- `POST /api/agents`
- `GET /api/agents/:agentId`
- `PATCH /api/agents/:agentId`
- `DELETE /api/agents/:agentId`

### Sync Control

- `GET /api/sync/status`
- `POST /api/sync/run`
- `POST /api/sync/pause`
- `POST /api/sync/resume`
- `GET /api/sync/conflicts`
- `POST /api/sync/conflicts/:conflictId/resolve`

## Implemented Frontend Integration

### Desktop Runtime Wiring

- The renderer reads runtime config from preload before bootstrapping the client.
- The shared HTTP layer automatically sends the desktop session header in desktop mode.
- Browser mode still uses the configured environment base URL.

### Delivered Desktop UI

- Existing project, ACP session, conversation, and message flows now target the local server in desktop mode.

## Behavior Notes

### Sync Control

- Sync control is currently a local control plane.
- Manual `run` updates sync timestamps and surfaces pending changes.
- Conflicts are persisted in SQLite.

### Local SQLite Lifecycle

- `apps/local-server` now creates the desktop SQLite schema from a single snapshot migration.
- The desktop runtime no longer preserves old local schema upgrade paths.
- When local schema changes break compatibility during development, delete `team-ai.db`, `team-ai.db-shm`, and `team-ai.db-wal` under the Electron local data directory and restart the desktop app.

## Recommended Next Steps

### Near-Term

- Add real cloud sync transport behind the existing sync routes
- Add frontend sync status UI

### Mid-Term

- Add outbox-based sync worker
- Add structured conflict merge strategies
- Add project and conversation management views for desktop-only local-first workflows

## Local Runner Validation

For local desktop delivery, the most relevant commands are:

```bash
# agent-gateway
npx nx test @agent-gateway/main
npx nx build @agent-gateway/main

# local-server
cd apps/local-server
npx vitest run \
  src/app/clients/agent-gateway-client.test.ts \
  src/app/plugins/agent-gateway-client.test.ts \
  src/app/plugins/execution-runtime.test.ts
cd ../..
npx nx build local-server

# desktop
cd apps/desktop
npx vitest run src/app/*.test.ts
cd ../..
npx nx build desktop
```

## Sidecar Debugging Notes

- `apps/desktop` launches `agent-gateway` first, waits for an IPC ready signal, then launches `local-server`.
- Packaged desktop builds include both sidecars under Electron resources:
  - `resources/agent-gateway/main.js`
  - `resources/local-server/main.js`
- Desktop injects:
  - `AGENT_GATEWAY_BASE_URL`
  - `DESKTOP_SESSION_TOKEN`
  - `TEAMAI_DATA_DIR`
- For fresh local-state debugging, remove the SQLite files under `TEAMAI_DATA_DIR` and relaunch the desktop app.
- The renderer still talks only to `local-server`; it never calls `agent-gateway` directly.
