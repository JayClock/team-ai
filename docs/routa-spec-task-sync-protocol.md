# Routa Spec Task Sync Protocol

## Canonical identity

Each synced card is identified by this tuple:

- `sourceType = spec_note`
- `sourceEventId = <canonical spec note id>`
- `sourceEntryIndex = <0-based @@@task block order inside the canonical note>`

This keeps the mapping stable across edits without introducing a second hidden identifier format into the markdown.

## Field mapping

Supported `@@@task` fields map to task properties as follows:

- first `# Heading` -> `title`
- freeform body before any `## Section` -> `objective`
- `## Scope` -> `scope`
- `## Definition of Done` or `## Acceptance Criteria` -> `acceptanceCriteria`
- `## Verification` -> `verificationCommands`
- `## Owner` / `## Assignee` / `## Specialist` -> `assignedRole` and `assignedSpecialistId`
- `## Depends On` / `## Dependencies` -> `dependencies`

Owner values are normalized heuristically:

- `Todo Orchestrator` / `Routa` -> `ROUTA` + `todo-orchestrator`
- `Crafter Implementor` / `Developer` -> `CRAFTER` + `crafter-implementor`
- `Gate Reviewer` / `Done Reporter` -> `GATE` + `gate-reviewer`
- `Blocked Resolver` -> `ROUTA` + `blocked-resolver`

## Sync semantics

- New block: create a new task/card on the project board.
- Edited block: update the existing task/card matched by the tuple above.
- Removed block: archive the previously linked task/card.
- Dependency resolution:
  - exact title match is preferred
  - `block #N` resolves to the Nth block in the same canonical note

## Trigger policy

Sync is triggered from three entry points:

- `set_note_content` MCP tool when the saved note is a canonical spec note
- flow template application when the rendered note type is `spec`
- explicit `POST /projects/:projectId/spec/sync`

## Invariants

- The canonical spec is the source of truth for spec-derived cards.
- Board state should not contain active spec-derived cards for deleted blocks.
- Updating the canonical spec should be idempotent when block order and content are unchanged.
