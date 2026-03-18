# Team AI Timeout Alignment Plan

## Purpose

This document turns the rough "align Team AI timeout behavior with Routa" checklist into an implementation plan that is ready for destructive updates.

Scope:

- Align Team AI with Routa's product-runtime timeout model
- Allow breaking API, schema, event, and UI state changes
- Focus on ACP runtime, agent gateway, local server session lifecycle, and frontend session state

Out of scope for the first pass:

- Backward compatibility
- Soft migrations for old API clients
- Non-ACP business modules unrelated to agent execution

## Current State Summary

Team AI already has:

- Prompt timeout at the ACP service boundary
- ACP runtime transport timeout and cancel grace
- Agent gateway timeout and provider-level prompt timeout
- Idle ACP session reaping
- Timeout-to-lifecycle-state mapping for a small set of timeout types

Team AI does not yet have a full Routa-style product-runtime timeout model:

- No explicit session total timeout policy
- No inactivity timeout supervision for active sessions
- No step-budget or loop-budget supervision
- No unified timeout scope taxonomy
- No full supervision state machine covering cancelling, grace wait, force kill, and recovery
- No unified config object shared across runtime, gateway, persistence, and UI

## Alignment Goal

After alignment, Team AI should treat timeout as a first-class supervision concern, not just a request concern.

The target model is:

1. Every agent session has a supervision policy.
2. Every timeout belongs to a named scope.
3. Every timeout produces a structured lifecycle event.
4. Every timeout follows a deterministic enforcement path:
   start deadline -> detect breach -> request cancel -> wait grace -> force kill -> persist terminal state.
5. Frontend and automation consumers can distinguish:
   prompt timeout, inactivity timeout, total timeout, step-budget timeout, provider init timeout, and force-kill timeout.

## Breaking Changes

These are intentional and should not be hidden behind compatibility layers.

### API Shape

- Replace `PromptSessionInput.timeoutMs` with `PromptSessionInput.supervision`
- Replace gateway top-level `timeoutMs` default with per-scope timeout config
- Require all prompt/session start calls to resolve an effective supervision policy before execution

### Persistence

- Add supervision columns and stop treating timeout as a generic failure string
- Persist timeout scope and enforcement timestamps

### Event Model

- Replace generic `timeout` handling with scoped timeout lifecycle events
- Add explicit cancelling and force-killed states

### Frontend

- Replace current coarse running/failed timeout handling with detailed supervision-aware states
- Update session details, activity feed, and retry controls to consume the new event model

## Target Supervision Model

### Supervision Policy

All session execution paths should resolve to a policy object like:

```ts
type SessionSupervisionPolicy = {
  promptTimeoutMs: number;
  inactivityTimeoutMs: number;
  totalTimeoutMs: number;
  cancelGraceMs: number;
  completionGraceMs: number;
  providerInitTimeoutMs: number;
  packageManagerInitTimeoutMs: number;
  maxSteps: number | null;
  maxRetries: number;
};
```

Resolution order:

1. Per-request override
2. Session-level override
3. Project/runtime profile default
4. Provider default override
5. System default

### Timeout Scopes

Introduce a single timeout scope taxonomy:

- `prompt`
- `session_total`
- `session_inactive`
- `step_budget`
- `provider_initialize`
- `provider_request`
- `gateway_completion_wait`
- `tool_execution`
- `mcp_execution`
- `force_kill_grace`

### Lifecycle States

Extend the lifecycle model to include:

- `RUNNING`
- `CANCELLING`
- `CANCELLED`
- `TIMED_OUT_PROMPT`
- `TIMED_OUT_INACTIVE`
- `TIMED_OUT_TOTAL`
- `TIMED_OUT_STEP_BUDGET`
- `TIMED_OUT_PROVIDER_INITIALIZE`
- `FORCE_KILLED`
- `FAILED`
- `COMPLETED`

### Enforcement Flow

For any timeout scope that applies to a live session:

1. Detect timeout breach
2. Emit `supervision.timeout_detected`
3. Persist `CANCELLING`
4. Send `session/cancel`
5. Wait `cancelGraceMs`
6. If session finishes, persist scoped terminal timeout state
7. If session does not finish, kill runtime/session process
8. Persist `FORCE_KILLED` with `timeoutScope`

## Implementation Plan

### Phase 1: Core Contract and Schema

Goal:

- Introduce the supervision domain model and make it the only supported timeout model

Tasks:

- Add `SessionSupervisionPolicy` types to local server orchestration/service layer
- Replace bare `timeoutMs` arguments with `supervision`
- Add timeout scope enum/type shared by local server, runtime client, gateway, and frontend
- Add new lifecycle state values and event payloads
- Add persistence columns for supervision metadata

Suggested file changes:

- `apps/local-server/src/app/services/acp-service.ts`
  - Replace `PromptSessionInput.timeoutMs?: number` with `supervision?: Partial<SessionSupervisionPolicy>`
  - Resolve an effective policy before `runtime.promptSession(...)`
  - Stop using `DEFAULT_ACP_PROMPT_TIMEOUT_MS` as the primary abstraction
- `libs/orchestration/runtime-acp/src/lib/schemas/acp.ts`
  - Add new session update / timeout scope schema values
- `libs/orchestration/runtime-acp/src/lib/services/normalized-session-update.ts`
  - Normalize new scoped timeout and supervision events
- `libs/orchestration/runtime-acp/src/lib/services/session-update-state.ts`
  - Map new event types into terminal and intermediate states
- Local server persistence layer
  - Add columns:
    - `supervision_policy_json`
    - `deadline_at`
    - `inactive_deadline_at`
    - `cancel_requested_at`
    - `cancelled_at`
    - `timeout_scope`
    - `force_killed_at`

Acceptance criteria:

- No production path relies on a naked `timeoutMs` as the top-level session timeout abstraction
- Every prompt execution resolves a concrete supervision policy object
- Session storage can persist timeout scope and cancel lifecycle timestamps

### Phase 2: Runtime and Gateway Supervision

Goal:

- Move timeout enforcement from scattered `Promise.race` calls into a supervision-aware execution flow

Tasks:

- Unify timeout constants currently split across runtime and gateway
- Centralize cancel grace semantics
- Add explicit timeout scope metadata to runtime/gateway errors
- Ensure provider init timeout and prompt timeout both emit structured scoped errors
- Distinguish transport timeout from business supervision timeout

Suggested file changes:

- `libs/orchestration/runtime-acp/src/lib/clients/acp-runtime-client.ts`
  - Replace local timeout constants with policy-derived values
  - Return errors carrying `timeoutScope`
  - Move prompt cancel enforcement into shared supervision helper
- `libs/orchestration/runtime-acp/src/lib/clients/agent-gateway-runtime-client.ts`
  - Replace ad hoc completion wait timeout logic with shared supervision helper
  - Emit `gateway_completion_wait` timeout scope when applicable
- `libs/orchestration/agent-gateway/src/config.ts`
  - Replace `timeoutMs` with:
    - `promptTimeoutMs`
    - `completionGraceMs`
    - `cancelGraceMs`
    - `providerInitTimeoutMs`
    - `packageManagerInitTimeoutMs`
- `libs/orchestration/agent-gateway/src/providers/acp-cli-provider.ts`
  - Carry `timeoutScope` through provider errors
  - Distinguish `provider_request` from `prompt` timeout
- Add a shared module:
  - `libs/orchestration/runtime-acp/src/lib/supervision/session-supervision.ts`
  - Single source of truth for timeout calculation and enforcement flow

Acceptance criteria:

- Runtime client and gateway runtime client use the same supervision policy semantics
- Provider timeout errors are scope-aware
- Cancel grace is configured once and consumed everywhere

### Phase 3: Inactivity and Total Timeout Supervision

Goal:

- Add Routa-style product-runtime supervision beyond request timeout

Tasks:

- Track `lastActivityAt` as a supervision signal, not just UI metadata
- Add a periodic supervision loop for active sessions
- Enforce inactivity timeout for sessions still marked `RUNNING`
- Enforce session total timeout independently of prompt request timeout
- Exclude sessions already in `CANCELLING`, `COMPLETED`, `FAILED`, or timed-out terminal states

Suggested file changes:

- `apps/local-server/src/app/services/acp-service.ts`
  - Persist activity heartbeats from runtime updates
  - Resolve lifecycle state based on supervision transitions
- Add a supervision runner service, for example:
  - `apps/local-server/src/app/services/session-supervision-service.ts`
  - Scan active sessions and enforce:
    - inactivity deadline
    - total deadline
    - cancel grace expiry
- `libs/orchestration/runtime-acp/src/lib/plugins/acp-session-reaper.ts`
  - Keep it focused on idle runtime cleanup only
  - Do not use it as a substitute for session supervision

Acceptance criteria:

- A session with no ACP activity breaches `session_inactive`
- A session exceeding wall-clock budget breaches `session_total`
- Both produce scoped timeout lifecycle events and terminal states

### Phase 4: Step Budget and Loop Protection

Goal:

- Prevent unbounded agent loops and align with Routa's step-budget protection

Tasks:

- Define what counts as a step in Team AI
  - Suggested default: one tool call, or one prompt turn completion, depending on session mode
- Persist `stepCount`
- Enforce `maxSteps`
- Emit `step_budget` timeout scope when the limit is exceeded

Suggested file changes:

- Local server session persistence and event aggregation
  - Add `step_count`
- Session execution/orchestration layer
  - Increment step count on each qualifying action
- Frontend
  - Surface "step budget exceeded" separately from generic timeout

Acceptance criteria:

- Long self-looping sessions terminate deterministically
- Operators can distinguish loop-budget exhaustion from slow provider response

### Phase 5: Frontend State and Operator UX

Goal:

- Make timeout states legible and actionable in the UI

Tasks:

- Replace coarse failed/running mapping with supervision-aware states
- Show timeout reason and scope in session list and detail views
- Show `CANCELLING` and `FORCE_KILLED`
- Add retry behavior based on timeout scope
- Add operator-facing labels:
  - Prompt timed out
  - Session inactive too long
  - Session exceeded total runtime
  - Provider initialization timed out
  - Session force-killed after cancel grace

Suggested file changes:

- `libs/frontend/shells/sessions/src/lib/sessions.tsx`
- Session detail and activity feed consumers under `libs/frontend/features/project-sessions/`
- Any shared schema package used to serialize lifecycle state and timeout scope

Acceptance criteria:

- UI no longer collapses all timeouts into one generic failed state
- Retry affordances vary by timeout scope

### Phase 6: Metrics, Tracing, and Auditability

Goal:

- Make timeout incidents diagnosable in production

Tasks:

- Emit metrics with labels:
  - `timeout_scope`
  - `provider`
  - `model`
  - `session_kind`
  - `cancel_sent`
  - `force_killed`
- Emit structured logs at each supervision transition
- Capture latency between timeout detection and final cleanup

Suggested file changes:

- Local server logging and metrics service
- Agent gateway metrics hooks
- Runtime supervision helper instrumentation

Acceptance criteria:

- Every timeout incident can be traced from detection to cleanup
- Operators can tell whether cancel succeeded before force kill

## File-by-File Execution Checklist

### `apps/local-server/src/app/services/acp-service.ts`

- Remove primary reliance on `DEFAULT_ACP_PROMPT_TIMEOUT_MS`
- Introduce supervision policy resolution
- Replace `timeout` vs `failed` mapping with scoped supervision mapping
- Persist supervision timestamps and timeout scope
- Emit scoped lifecycle events

### `libs/orchestration/runtime-acp/src/lib/clients/acp-runtime-client.ts`

- Replace local timeout constants with supervision config inputs
- Introduce shared timeout helpers returning structured scope metadata
- Separate:
  - request transport timeout
  - prompt supervision timeout
  - provider initialize timeout

### `libs/orchestration/runtime-acp/src/lib/clients/agent-gateway-runtime-client.ts`

- Align completion-wait timeout with shared supervision helper
- Emit `gateway_completion_wait` scope instead of generic prompt timeout when appropriate

### `libs/orchestration/agent-gateway/src/config.ts`

- Replace single `timeoutMs` with a structured config object
- Update env var parsing accordingly

### `libs/orchestration/agent-gateway/src/providers/acp-cli-provider.ts`

- Carry timeout scope in provider errors
- Distinguish prompt cancel grace from generic request timeout
- Emit supervision metadata into event stream where possible

### `libs/orchestration/runtime-acp/src/lib/plugins/acp-session-reaper.ts`

- Keep only runtime idle cleanup semantics
- Remove any temptation to overload it as business supervision

### Frontend session consumers

- Add supervision state rendering
- Add timeout scope badges and retry controls

## Data Model Proposal

Suggested session supervision fields:

```sql
ALTER TABLE acp_sessions
  ADD COLUMN supervision_policy_json TEXT,
  ADD COLUMN deadline_at TEXT,
  ADD COLUMN inactive_deadline_at TEXT,
  ADD COLUMN cancel_requested_at TEXT,
  ADD COLUMN cancelled_at TEXT,
  ADD COLUMN force_killed_at TEXT,
  ADD COLUMN timeout_scope TEXT,
  ADD COLUMN step_count INTEGER NOT NULL DEFAULT 0;
```

Notes:

- Store timestamps as ISO strings if that matches the existing SQLite conventions
- `timeout_scope` should remain nullable for non-timeout terminal states
- `supervision_policy_json` should store the effective resolved policy, not the raw request override

## Event Model Proposal

Introduce new event types:

- `supervision.policy_resolved`
- `supervision.timeout_detected`
- `supervision.cancel_requested`
- `supervision.cancel_grace_expired`
- `supervision.force_killed`
- `session.timed_out`

Suggested `session.timed_out` payload:

```json
{
  "scope": "session_inactive",
  "timeoutMs": 600000,
  "detectedAt": "2026-03-18T12:00:00.000Z",
  "cancelRequestedAt": "2026-03-18T12:00:01.000Z",
  "forceKilled": false
}
```

## Default Policy Proposal

Recommended first destructive default set:

- `promptTimeoutMs`: `300000`
- `inactivityTimeoutMs`: `600000`
- `totalTimeoutMs`: `1800000`
- `cancelGraceMs`: `1000`
- `completionGraceMs`: `1000`
- `providerInitTimeoutMs`: `10000`
- `packageManagerInitTimeoutMs`: `120000`
- `maxSteps`: `64`
- `maxRetries`: `0`

These values are intentionally conservative:

- close to current Team AI prompt defaults
- compatible with existing Routa ACP initialization semantics
- restrictive enough to expose stuck-session bugs early

## Testing Plan

### Unit Tests

- Policy resolution precedence
- Timeout scope mapping
- Lifecycle state transitions
- Cancel grace expiry handling
- Step-budget enforcement

### Integration Tests

- Prompt timeout triggers cancel and terminal timeout state
- Inactivity timeout triggers supervision timeout without active prompt completion
- Total timeout expires even if the provider continues to stream noise
- Provider initialize timeout maps to `provider_initialize`
- Gateway completion wait timeout maps correctly
- Force kill path runs when cancel grace expires

### UI Tests

- Session list renders distinct timeout states
- Detail panel shows scope-specific timeout copy
- Retry action availability changes by timeout scope

## Rollout Notes

Because this is intentionally destructive, rollout should happen in one branch and merge as a single behavior change. Avoid partial rollout where:

- persistence uses scoped timeouts but UI still expects generic timeout
- gateway emits scoped timeout errors but local server collapses them into `failed`
- session supervision is enabled before cancel/force-kill states are visible to operators

Recommended merge sequence:

1. Persistence and shared schema
2. Runtime/gateway supervision helper
3. Local server supervision enforcement
4. Frontend state consumption
5. Test stabilization

## Definition of Done

This plan is complete when all of the following are true:

- Team AI no longer treats timeout as a single request-level concern
- Every session executes under a resolved supervision policy
- Every timeout has a named scope
- Every timeout is visible in persistence, logs, events, and UI
- Every timeout follows a deterministic cancel -> grace -> kill path
- Frontend operators can distinguish prompt, inactivity, total, step-budget, and provider-init timeouts

