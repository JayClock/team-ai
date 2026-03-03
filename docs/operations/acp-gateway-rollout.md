# ACP Gateway Rollout & Rollback Playbook

Status: active  
Owner: backend/api

## Goal

Roll out ACP runtime traffic from local Java runtime to external gateway with low-risk, reversible controls.

## Runtime Controls

### 1) Global mode switch (no restart)

Endpoint:
- `GET /api/acp/gateway/mode`
- `POST /api/acp/gateway/mode`

Request body:

```json
{ "mode": "local" }
```

or

```json
{ "mode": "remote" }
```

### 2) Gray release scope

Environment variables:
- `TEAM_AI_ACP_GATEWAY_ROLLOUT_PROJECTS` (comma-separated project ids)
- `TEAM_AI_ACP_GATEWAY_ROLLOUT_USERS` (comma-separated user ids)
- `TEAM_AI_ACP_GATEWAY_ROLLOUT_PERCENT` (`0..100`)

Rules:
- `mode=remote` is required
- if project/user allowlist is set, only matching traffic goes remote
- percentage is hash-based on orchestration/session id

### 3) Automatic rollback guard

Environment variables:
- `TEAM_AI_ACP_GATEWAY_ROLLBACK_ERROR_THRESHOLD` (default `5`)
- `TEAM_AI_ACP_GATEWAY_ROLLBACK_WINDOW_MS` (default `60000`)
- `TEAM_AI_ACP_GATEWAY_ROLLBACK_COOLDOWN_MS` (default `300000`)

Behavior:
- if remote failures in window reach threshold, effective route falls back to local
- fallback remains active for cooldown window

## SLO Rollback Thresholds

Trigger immediate rollback to `local` if any condition is met:
- remote error rate > `5%` for 5 minutes
- p95 first-token latency degrades by > `2x` baseline for 10 minutes
- prompt completion rate < `95%` for 10 minutes

## Release Procedure

1. Set `mode=local` and verify baseline metrics.
2. Set `mode=remote`, rollout percent `5`, and optional allowlists.
3. Observe:
   - gateway `/metrics`
   - Java ACP telemetry (`teamai.acp.*`)
4. Expand percent in steps: `5 -> 20 -> 50 -> 100`.
5. Keep rollback guard enabled throughout rollout.

## Rollback Procedure

1. `POST /api/acp/gateway/mode` with `{ "mode": "local" }`
2. Keep gateway running for forensic analysis; do not discard metrics/logs.
3. Capture:
   - gateway `/metrics`
   - ACP error codes/category distribution
   - affected project/user scope
4. Open incident follow-up with:
   - trigger timestamp
   - rollback latency
   - top 3 error codes
