# agent-gateway app shell

`apps/agent-gateway` now only provides the executable sidecar entrypoint.

- Runtime implementation lives in `orchestration/agent-gateway/src`
- Start locally with `npx nx dev @agent-gateway/main`
- Build the reusable implementation with `npx nx build @orchestration/agent-gateway`
- Run gateway tests with `npx nx test @orchestration/agent-gateway`
