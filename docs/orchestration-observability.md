# Orchestration E2E and Observability

This guide defines the orchestration chain regression suite and telemetry baseline.

## Key E2E Scenarios (Gate Set)

The following scenarios are treated as release gates:

1. Start orchestration successfully (session + step plan + runtime execution)
2. Runtime failure returns explicit `502` and marks session/task as failed
3. Runtime transient failure retries and recovers
4. Cancel running orchestration
5. Replay start request (`requestId`) returns existing session

Primary test coverage:

- `reengineering.ddd.teamai.api.OrchestrationsApiTest`
- `reengineering.ddd.teamai.api.application.OrchestrationServiceTest`
- `reengineering.ddd.teamai.api.AgentEventsApiTest`
- `reengineering.ddd.teamai.api.application.OrchestrationTelemetryTest`

## Metrics

| Metric | Type | Tags | Purpose |
| --- | --- | --- | --- |
| `teamai.orchestration.session.transition` | Counter | `from`, `to` | Track session lifecycle transitions |
| `teamai.orchestration.step.transition` | Counter | `to` | Track step state transitions |
| `teamai.orchestration.step.duration` | Timer | `outcome` | Step execution duration (`success` / `retry` / `failed`) |
| `teamai.orchestration.runtime.result` | Counter | `outcome` | Runtime result distribution |
| `teamai.orchestration.runtime.latency` | Timer | `outcome` | Runtime latency profile |
| `teamai.orchestration.runtime.error` | Counter | `exception`, `category` | Runtime failure classification |
| `teamai.orchestration.runtime.retry` | Counter | `attempt` | Retry frequency and escalation |

## Trace Propagation

Trace flow is carried by `X-Trace-Id` and MDC:

1. API ingress: `TraceIdFilter` sets/reuses `X-Trace-Id` and writes MDC `traceId`
2. Orchestration service/runtime: telemetry logs with the same `traceId`
3. Event stream: SSE payload includes `traceId` for snapshot/event/heartbeat/error envelopes
4. API egress: response header returns `X-Trace-Id`

## Alert Threshold Suggestions

Use these as initial SLO-based thresholds:

- Runtime failure ratio (`runtime.error / runtime.result`) > `5%` over 10 minutes
- P95 runtime latency > `20s` over 10 minutes
- P95 step duration > `30s` over 10 minutes
- Retry surge: `runtime.retry` > `20` over 10 minutes
- Session `RUNNING -> FAILED` transitions > `10` over 10 minutes

Tune thresholds by environment and workload profile after baseline collection.

## CI and Local Gates

CI runs the unified test command once (`nx run-many -t test`) to avoid duplicate execution.

When debugging orchestration regressions locally, run the focused gate set:

```bash
./gradlew :backend:api:test --tests "reengineering.ddd.teamai.api.OrchestrationsApiTest"
./gradlew :backend:api:test --tests "reengineering.ddd.teamai.api.application.OrchestrationServiceTest"
./gradlew :backend:api:test --tests "reengineering.ddd.teamai.api.application.OrchestrationTelemetryTest"
./gradlew :backend:api:test --tests "reengineering.ddd.teamai.api.AgentEventsApiTest"
```
