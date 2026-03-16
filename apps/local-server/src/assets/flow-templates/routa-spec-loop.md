---
id: routa-spec-loop
name: Routa Spec Loop
description: Spec-first coordinator, crafter, and gate workflow skeleton.
noteType: spec
---
## Goal
{{projectTitle}} should run through a spec-first ROUTA -> CRAFTER -> GATE loop.

## Tasks

@@@task
# Implement scoped delivery slice
Deliver the implementation change for the current scope.

## Scope
List the concrete files, modules, or surfaces that must change.

## Definition of Done
- The implementation is complete
- The child session reports back to the parent with evidence

## Verification
- Fill in the exact verification command
@@@

@@@task
# Review the delivery slice
Validate the implementation outcome and record a verdict.

## Scope
Review the completed implementation and its verification evidence.

## Definition of Done
- A pass or fail verdict is recorded
- Follow-up actions are explicit

## Verification
- Fill in the exact review or test command
@@@

## Acceptance Criteria
- The spec can be synced into project tasks
- Implementation and review tasks are both visible in the workbench

## Non-goals
- Introduce a second orchestration engine

## Assumptions
- Session: {{sessionId}}
- Generated on: {{currentDate}}

## Verification Plan
- Sync the spec
- Delegate implementation
- Report completion
- Delegate review
- Record pass or fail
