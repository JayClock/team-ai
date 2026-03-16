---
id: routa-spec-loop
name: Routa Spec Loop
description: Spec-first coordinator, crafter, and gate workflow skeleton.
noteType: spec
---
## Goal
{{projectTitle}} should run through a spec-first ROUTA -> CRAFTER -> GATE loop.

## Wave Plan
- Wave 0: ROUTA refines the spec, keeps task blocks current, and prepares the next delegation slice.
- Wave 1: CRAFTER implements the scoped delivery slice and reports evidence back to ROUTA.
- Wave 2: GATE reviews the implementation result, validates verification evidence, and records the verdict.

## Tasks

@@@task
# Implement scoped delivery slice
Deliver the implementation change for the current scope in the first implementation wave.

## Inputs
- Wave: 1
- Depends on: The current spec note and its synced task blocks
- Verification owner: GATE

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
Validate the completed implementation wave and record a pass or fail verdict.

## Inputs
- Wave: 2
- Depends on: Implement scoped delivery slice
- Verification owner: GATE

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
