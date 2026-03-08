# Desktop Local-First Status

## Status

- Updated: 2026-03-08
- Scope: Electron desktop shell + local Node server + desktop web client
- Source of truth: current implementation under `apps/desktop`, `apps/local-server`, and `apps/web`

## Overview

The desktop runtime now consists of three cooperating parts:

- `apps/desktop`
  - Starts Electron
  - Launches the local Node server
  - Injects desktop runtime configuration into the renderer
- `apps/local-server`
  - Exposes the local HTTP API on `127.0.0.1`
  - Persists desktop data in SQLite
  - Owns orchestration runtime, message streaming, and sync control state
- `apps/web`
  - Uses the desktop runtime API base URL when running inside Electron
  - Sends the desktop session header automatically
  - Renders orchestration, project, conversation, and message flows against the local server

## Current Delivery Status

### Delivered

- Electron desktop shell
- Local Node server bootstrap
- Desktop session authentication
- Problem JSON error handling
- SQLite bootstrap and migrations
- Project CRUD routes
- Conversation CRUD routes
- Message routes with local SSE output
- Provider and agent routes
- Orchestration contract, persistence, runtime, and recovery
- Desktop frontend orchestration dashboard
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
2. Electron starts `apps/local-server`.
3. The desktop shell waits for `GET /api/health`.
4. Preload exposes:
   - local API base URL
   - desktop session header name
   - desktop session token
5. The web renderer initializes the HATEOAS client from that runtime config.

## Implemented Local API Surface

All routes below are currently implemented by `apps/local-server`.

### Core

- `GET /api`
- `GET /api/health`
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

### Orchestration

- `GET /api/orchestration`
- `GET /api/orchestration/sessions`
- `POST /api/orchestration/sessions`
- `GET /api/orchestration/sessions/:sessionId`
- `GET /api/orchestration/sessions/:sessionId/steps`
- `GET /api/orchestration/sessions/:sessionId/events`
- `GET /api/orchestration/sessions/:sessionId/stream`
- `POST /api/orchestration/sessions/:sessionId/cancel`
- `POST /api/orchestration/sessions/:sessionId/resume`
- `POST /api/orchestration/sessions/:sessionId/retry`
- `GET /api/orchestration/steps/:stepId`
- `GET /api/orchestration/steps/:stepId/events`
- `POST /api/orchestration/steps/:stepId/retry`

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

- Existing project, conversation, and message flows now target the local server in desktop mode.
- A dedicated orchestration dashboard is available at:
  - `/orchestration`
  - `/orchestration/:sessionId`
- The dashboard supports:
  - session list
  - session detail
  - steps
  - persisted event timeline
  - stream updates
  - cancel / resume / retry session
  - retry step

## Behavior Notes

### Orchestration Runtime

- Sessions, steps, and events are stored in SQLite.
- A simple sequential scheduler advances `PLAN -> IMPLEMENT -> VERIFY`.
- Restart recovery resumes unfinished sessions on local server boot.
- Sessions with goals containing `[fail-once]` intentionally fail once in the `IMPLEMENT` step to validate retry and recovery behavior.

### Sync Control

- Sync control is currently a local control plane.
- Manual `run` updates sync timestamps and surfaces pending changes.
- Conflicts are persisted in SQLite.
- Sessions with titles containing `[conflict]` can seed a synthetic conflict for desktop validation.

## Recommended Next Steps

### Near-Term

- Add real cloud sync transport behind the existing sync routes
- Add frontend sync status UI
- Add pagination and filtering to orchestration dashboard

### Mid-Term

- Add outbox-based sync worker
- Add structured conflict merge strategies
- Add project and conversation management views for desktop-only local-first workflows

