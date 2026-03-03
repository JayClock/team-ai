# MCP Tools (Orchestration)

This project exposes MCP tools through the `/mcp` endpoint (Spring AI MCP server).

## Step-Level Tools

- `list_orchestration_steps(projectId, orchestrationId)`
- `get_orchestration_step(projectId, orchestrationId, stepId)`
- `advance_orchestration_step(projectId, orchestrationId, stepId, requestId?)`
- `cancel_orchestration_step(projectId, orchestrationId, stepId, reason, requestId?)`

## Idempotency (`requestId`)

`advance_orchestration_step` and `cancel_orchestration_step` support optional `requestId`.

- Re-sending the same `requestId` for the same action and target (`projectId + orchestrationId + stepId`) returns replayed result.
- Reusing the same `requestId` for a different action/target is rejected with a conflict-style error.

## Trace and Context

Step tool responses include:

- `traceId`: unique trace token for a single tool invocation
- context fields: `projectId`, `orchestrationId`, `stepId`
- action metadata: `action`, `replayed`, status transition (`previousStatus`, `currentStatus`)

## Access Control

MCP calls are filtered by project membership. A non-member caller receives `403 Forbidden`.
