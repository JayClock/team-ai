# Routa ACP Alignment TODO

Updated: 2026-03-15

## Goal

Make `team-ai` ACP handling match `routa` more closely in three areas:

- one canonical ACP event model
- one-way provider normalization into that model
- clean separation between normalization, runtime consumption, and projection

## Current State

### Done

- [x] `agent-gateway` providers emit canonical ACP `update`
- [x] legacy gateway ACP flat `payload` fallback is removed
- [x] `local-server` consumes canonical ACP updates on the main path
- [x] persisted plan projection uses `description`
- [x] persisted tool projection uses canonical `input` and `output`
- [x] `tool_result` projection type is collapsed back into `tool_call + status`
- [x] frontend session UI prefers canonical ACP projected fields
- [x] Phase 1 canonical ACP type ownership is consolidated onto `agent-gateway`
- [x] Phase 2 runtime hooks now accept canonical ACP updates only
- [x] Phase 3 shared ACP provider behavior and normalize contract exists in `provider-types.ts`
- [x] Phase 4 persistence projection and session-state derivation moved out of `normalized-session-update.ts`
- [x] Phase 5 keeps `rawNotification` diagnostic-only and removes semantic reparsing from the gateway bridge
- [x] Phase 6 adds provider/bridge contract tests around canonical ACP normalization
- [x] Phase 7 removes remaining duplicated normalization helpers and confirms canonical-only ACP consumption

### Still Different From Routa

- [ ] `rawNotification` is still typed broadly as `unknown` instead of narrower provider-specific raw shapes

## Phase 1: Single Type Source

- [x] choose one canonical ACP type owner
- [x] remove duplicate type drift between:
  - `apps/agent-gateway/src/providers/provider-types.ts`
  - `apps/local-server/src/app/services/normalized-session-update.ts`
- [x] make `local-server` consume the canonical type definitions owned by `agent-gateway`
- [x] keep field names aligned with the current canonical shape:
  - `eventType`
  - `sessionId`
  - `provider`
  - `timestamp`
  - `traceId`
  - `rawNotification`
  - `message`
  - `toolCall`
  - `planItems`
  - `turnComplete`
  - `error`
- [x] expand `apps/local-server/tsconfig.app.json` just enough to typecheck the canonical type owner and its direct dependency

## Phase 2: Runtime Boundary Cleanup

- [x] change `AcpRuntimeSessionHooks.onSessionUpdate` to accept only canonical ACP updates
- [x] remove the union type that still allows raw `SessionNotification`
- [x] keep raw ACP notifications only inside provider/runtime bridge code
- [x] make `local-server` service entrypoints consume canonical updates directly
- [x] confirm no route, broker, or runtime callback still depends on raw ACP notification shape

## Phase 3: Adapter Structure

- [x] introduce a shared ACP adapter abstraction inside existing modules
- [x] define a common adapter contract for:
  - normalize raw provider notification
  - describe provider behavior
  - handle deferred tool input if needed
- [x] refactor `acp-cli-provider.ts` to use the shared adapter contract
- [x] refactor `codex-app-server-provider.ts` to use the shared adapter contract
- [x] keep provider-specific parsing isolated from downstream event mapping

## Phase 4: Responsibility Separation

- [x] split protocol normalization from persistence projection logic
- [x] keep `normalizeSessionNotification()` focused on canonical update construction
- [x] keep `toPersistedAcpEvent()` focused on storage/UI projection
- [x] remove mixed responsibilities from `normalized-session-update.ts` where practical
- [x] make session-state derivation operate only on canonical event semantics

## Phase 5: Raw Notification Policy

- [x] decide whether `rawNotification` remains required on every canonical event
- [x] if kept, document that it is for diagnostics and trace only
- [ ] if reduced, replace broad `unknown` usage with narrower provider-specific raw shapes
- [x] ensure downstream code does not parse business semantics from `rawNotification`

## Phase 6: Test Alignment

- [x] add adapter contract tests that cover:
  - immediate tool input
  - deferred tool input
  - chunked assistant messages
  - plan updates
  - turn completion
  - error events
- [x] add end-to-end tests from provider raw event to canonical update consumption
- [x] add assertions that downstream code no longer depends on raw ACP notification shape
- [x] keep existing projection/UI tests, but make them secondary to canonical contract tests

## Phase 7: Final Cleanup

- [x] remove any remaining duplicated helper logic between gateway and local-server normalization
- [x] audit `rawInput` / `rawOutput` references and keep them only at true protocol boundaries
- [x] verify no ACP consumer branches on provider-specific event payload structure
- [x] verify no ACP consumer requires separate `tool_result` event semantics
- [x] update architecture docs after code convergence is complete

## Acceptance Checklist

- [x] one canonical ACP type definition is used across gateway and local-server
- [x] raw ACP `SessionNotification` is no longer part of the runtime service contract
- [x] provider-specific parsing is isolated behind a shared adapter pattern
- [x] canonical updates are the only source model for session state, persistence projection, and UI projection
- [x] all ACP tests still pass after removing duplicate normalization paths

## Suggested Execution Order

- [x] Phase 1
- [x] Phase 2
- [x] Phase 3
- [x] Phase 4
- [x] Phase 5
- [x] Phase 6
- [x] Phase 7

## Notes

- `team-ai` is already close to `routa` on canonical event shape.
- The remaining gap is mostly architectural, not field-level.
- Phase 1 reuses `apps/agent-gateway/src/providers/provider-types.ts` as the current canonical ACP type owner without introducing a new module.
- Phase 2 keeps raw `SessionNotification` construction and parsing at the runtime bridge edge, but removes it from the runtime service contract.
- Phase 3 adds a shared provider behavior + normalization contract in the existing `agent-gateway` provider type module instead of introducing a new adapter base module.
- Phase 4 keeps normalization in `normalized-session-update.ts` and moves persistence/state projection responsibility into `acp-service.ts`, which is the real downstream consumer.
- Phase 5 keeps `rawNotification` for diagnostics, but bridge code now reconstructs protocol notifications from canonical fields instead of reparsing `rawNotification`.
- Phase 6 adds direct provider contract tests for `getBehavior()` and `normalizeNotification()`, plus a gateway bridge test proving canonical fields are sufficient without semantic dependence on `rawNotification`.
- Phase 7 shares common ACP content/input helpers through the existing `provider-types.ts` module and leaves only true protocol-boundary `rawInput` / `rawOutput` handling in place.
