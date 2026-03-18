# ACP Service Refactor Plan

## Purpose

This document turns the `apps/local-server/src/app/services/acp-service.ts` split proposal into an execution checklist.

Primary goal:

- break the current 3000+ line ACP service into smaller modules with stable lifecycle boundaries

Non-goals for the first pass:

- changing ACP behavior
- redesigning the API surface
- introducing compatibility shims for internal imports

The refactor should be structural first and behavioral second.

## Why Split It

`acp-service.ts` currently mixes multiple responsibilities in one file:

- session persistence and row mapping
- canonical event creation and broker publishing
- runtime hook translation
- session supervision and timeout enforcement
- history replay and transcript reconstruction
- task-run synchronization
- public ACP session orchestration APIs

That makes the file hard to reason about because one change can easily cross:

- database write paths
- runtime orchestration paths
- eventing paths
- timeout supervision paths
- task execution recovery paths

Routa handles similar complexity by splitting session management into smaller modules such as:

- session persistence
- write buffering
- lifecycle notification
- event bridging
- supervision

Team AI should follow the same boundary style, adapted to its local-server architecture.

## Refactor Goal

After refactoring:

1. `acp-service.ts` becomes a facade, not the implementation center.
2. SQLite persistence is isolated from orchestration logic.
3. Supervision logic lives in one place.
4. Event append, trace recording, and broker publishing have one primary path.
5. Task-run synchronization no longer sits inline with ACP runtime flow.
6. Replay/history logic is independent from runtime/session lifecycle logic.

## Target Module Layout

Recommended first-pass split:

```text
apps/local-server/src/app/services/
├── acp-service.ts
├── acp-session-store.ts
├── acp-session-events.ts
├── acp-session-supervision.ts
├── acp-session-task-sync.ts
├── acp-session-history.ts
└── acp-session-runtime.ts
```

## Module Responsibilities

### `acp-session-store.ts`

Own:

- `AcpSessionRow`
- `AcpEventRow`
- session/event query input types
- `getSessionRow`
- `updateSessionRuntime`
- `mapSessionRow`
- `mapEventRow`
- `mapRuntimeSessionSnapshot`
- `listSupervisedSessions`

Why:

- persistence and row mapping are foundational and should not depend on orchestration logic

Constraints:

- should not call runtime
- should not call task-run services
- should not publish events

### `acp-session-events.ts`

Own:

- `createCanonicalUpdate`
- `appendLocalEvent`
- `appendPromptRequestedEvents`
- `appendLifecycleEvent`
- `appendSupervisionEvent`
- `createRuntimeHooks`
- `resolveStepCountIncrement`

Why:

- all event writes should flow through one module
- this is the natural home for:
  - event buffering
  - broker publish
  - trace recording
  - runtime hook adaptation

Constraints:

- should depend on session store
- may call trace service
- should not contain timeout policy resolution

### `acp-session-supervision.ts`

Own:

- `DEFAULT_ACP_SESSION_SUPERVISION_POLICY`
- `cloneDefaultSupervisionPolicy`
- `parseSupervisionPolicy`
- `resolveSupervisionPolicy`
- `normalizePositiveInteger`
- `calculateIsoDeadline`
- `calculateActivityDeadline`
- `resolveTimeoutLifecycleState`
- `resolveLifecycleFailureState`
- `resolveSupervisionTimeoutDetail`
- `requestSessionSupervisionCancellation`
- `enforceStepBudgetIfNeeded`
- `runAcpSessionSupervisionTick`

Why:

- all timeout, inactivity, cancel grace, and step-budget logic belongs to one bounded context

Constraints:

- supervision code should not own general-purpose session CRUD
- supervision code may call:
  - session store
  - session events
  - runtime client
  - task-sync module

### `acp-session-task-sync.ts`

Own:

- `TaskExecutionRow`
- `TaskExecutionRunRow`
- `TaskExecutionRecovery`
- `getTaskExecutionRow`
- `getLatestTaskExecutionRun`
- `updateTaskExecutionState`
- `classifyTaskExecutionFailure`
- `buildTaskExecutionOutcome`
- `syncTaskExecutionOutcome`
- `recordTaskExecutionCreationFailure`

Why:

- ACP session orchestration and task-run recovery are tightly related but should not live inside the session service core

Constraints:

- should depend on task-run service
- should not know about runtime hooks

### `acp-session-history.ts`

Own:

- `SessionHistorySummaryRow`
- `extractEventText`
- `parseEventRecord`
- `sessionHasPromptHistory`
- `trimReplayTranscriptSegments`
- `buildAcpSessionReplayPrompt`

Why:

- transcript parsing and replay prompt generation are a separate concern from runtime lifecycle

Constraints:

- should depend on session event storage only
- should not own timeout or task-run behavior

### `acp-session-runtime.ts`

Own:

- `createAcpSession`
- `loadAcpSession`
- `promptAcpSession`
- `cancelAcpSession`
- `deleteAcpSession`
- `updateAcpSession`
- `renameAcpSession`
- `recreateAcpSessionRuntime`
- `ensureRuntimeLoaded`

Why:

- this should become the runtime orchestration layer
- it coordinates store, events, supervision, and task-sync, but should not implement their internals

Constraints:

- keep this focused on ACP session behavior
- avoid inline SQL or inline trace summarization here

### `acp-service.ts`

Own:

- public exports
- composition
- temporary compatibility wrappers during refactor

Why:

- callers should keep importing from one stable file while internals move out

Target:

- reduce `acp-service.ts` to an entrypoint-sized facade

## Dependency Direction

Recommended dependency graph:

```text
acp-session-store
  <- acp-session-history
  <- acp-session-events
  <- acp-session-task-sync
  <- acp-session-supervision
  <- acp-session-runtime
  <- acp-service
```

Additional allowed edges:

- `acp-session-events` -> `trace-service`
- `acp-session-supervision` -> `acp-session-events`
- `acp-session-supervision` -> `acp-session-task-sync`
- `acp-session-runtime` -> `acp-session-history`
- `acp-session-runtime` -> `acp-session-supervision`
- `acp-session-runtime` -> `acp-session-task-sync`

Avoid these edges:

- `acp-session-store` -> runtime client
- `acp-session-store` -> task-run service
- `acp-session-history` -> runtime client
- `acp-session-events` -> supervision policy parsing

## Execution Checklist

### Phase 1: Extract Session Store

- [ ] Create `acp-session-store.ts`
- [ ] Move row interfaces and low-level session/event mapping into it
- [ ] Update `acp-service.ts` imports to use the store module
- [ ] Keep all behavior unchanged
- [ ] Run ACP service tests

Expected outcome:

- DB access no longer lives inline with runtime orchestration

### Phase 2: Extract Event Pipeline

- [ ] Create `acp-session-events.ts`
- [ ] Move canonical update creation and append helpers
- [ ] Move runtime hook creation into the events module
- [ ] Keep event buffering, broker publish, and trace recording centralized
- [ ] Run ACP service and trace tests

Expected outcome:

- one event append path for local ACP events

### Phase 3: Extract Supervision

- [ ] Create `acp-session-supervision.ts`
- [ ] Move policy parsing and default supervision values
- [ ] Move timeout lifecycle mapping
- [ ] Move inactivity, total-time, cancel-grace, and step-budget enforcement
- [ ] Keep `runAcpSessionSupervisionTick` exported through the facade
- [ ] Run supervision-focused tests

Expected outcome:

- all timeout behavior lives in one module

### Phase 4: Extract Task Sync

- [ ] Create `acp-session-task-sync.ts`
- [ ] Move task execution state helpers and recovery logic
- [ ] Remove direct task-run orchestration code from runtime flow
- [ ] Run ACP service + task-run tests

Expected outcome:

- task execution coupling is isolated from raw ACP session behavior

### Phase 5: Extract History/Replay

- [ ] Create `acp-session-history.ts`
- [ ] Move transcript parsing and replay prompt logic
- [ ] Keep history query behavior unchanged
- [ ] Run history and prompt replay tests

Expected outcome:

- replay logic no longer sits inside the main session runtime file

### Phase 6: Extract Runtime Orchestration

- [ ] Create `acp-session-runtime.ts`
- [ ] Move `create/load/prompt/cancel/update/delete` flows into it
- [ ] Reduce `acp-service.ts` to a facade with re-exports
- [ ] Run all ACP routes, service, supervision, and trace tests

Expected outcome:

- runtime orchestration is isolated and readable

## Recommended Order

Use this order because it minimizes churn and keeps the public API stable:

1. session store
2. event pipeline
3. supervision
4. task sync
5. history/replay
6. runtime orchestration
7. facade cleanup

This order works because:

- store is the lowest-level dependency
- events naturally sit on top of store
- supervision depends on store plus events
- runtime should move last because it depends on everything else

## What Not To Do

Do not split by transport action only:

- `acp-create-service.ts`
- `acp-prompt-service.ts`
- `acp-cancel-service.ts`

That shape looks smaller but usually makes duplication worse because each file ends up re-owning:

- persistence
- events
- supervision
- task sync

Do not mix these boundaries:

- persistence with runtime hooks
- replay/history with timeout enforcement
- task-run failure recovery with event append helpers

## Testing Checklist

Run at minimum after each extraction step:

- [ ] `apps/local-server/src/app/services/acp-service.test.ts`
- [ ] `apps/local-server/src/app/services/trace-service.test.ts`
- [ ] `apps/local-server/src/app/routes/acp.test.ts`
- [ ] `apps/local-server/src/app/routes/traces.test.ts`
- [ ] `pnpm exec tsc --noEmit -p apps/local-server/tsconfig.json`

If task sync changes:

- [ ] `apps/local-server/src/app/services/task-run-service.test.ts`

If event behavior changes:

- [ ] `apps/local-server/src/app/services/acp-session-event-write-buffer.test.ts`

## Definition of Done

This refactor is complete when all of the following are true:

- `acp-service.ts` is reduced to facade size
- session persistence is isolated in its own module
- supervision logic is isolated in its own module
- event append and runtime hook behavior are isolated in their own module
- task-run synchronization is isolated in its own module
- replay/history logic is isolated in its own module
- existing ACP route/service/trace tests still pass
- no behavior changes are introduced beyond import and structure movement

## Success Metric

Target end state:

- `acp-service.ts` under roughly 400-800 lines
- each extracted module has a single dominant reason to change
- new timeout/session changes can usually be made in one module, not four
