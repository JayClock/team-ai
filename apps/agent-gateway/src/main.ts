const builtEntryHref = new URL(
  './orchestration/agent-gateway/index.js',
  import.meta.url,
).href;
const sourceEntryHref = new URL(
  '../../../orchestration/agent-gateway/src/index.ts',
  import.meta.url,
).href;

async function main(): Promise<void> {
  const gatewayModule = await import(
    import.meta.url.includes('/dist/') ? builtEntryHref : sourceEntryHref
  );
  const runAgentGatewayMain =
    gatewayModule.runAgentGatewayMain ??
    gatewayModule.default?.runAgentGatewayMain;

  if (typeof runAgentGatewayMain !== 'function') {
    throw new Error('agent-gateway entrypoint is missing runAgentGatewayMain');
  }

  runAgentGatewayMain();
}

void main();
