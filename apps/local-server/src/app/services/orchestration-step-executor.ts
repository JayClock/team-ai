import type { AgentGatewayClient, AgentGatewayEventEnvelope } from '../clients/agent-gateway-client';
import type {
  OrchestrationArtifactPayload,
  OrchestrationSessionPayload,
  OrchestrationStepPayload,
} from '../schemas/orchestration';
import {
  buildOrchestrationPrompt,
  parsePromptOutput,
  type OrchestrationPromptBuildResult,
} from './orchestration-prompt-builder';

const defaultPromptTimeoutMs = 120_000;
const gatewayPollIntervalMs = 50;
const gatewayPollGraceMs = 5_000;

export interface OrchestrationGatewayExecutionSuccess {
  artifactKind: string;
  parsedOutput: Record<string, unknown>;
  prompt: OrchestrationPromptBuildResult;
  rawOutput: string;
  runtimeCursor: string | null;
  runtimeSessionId: string;
  status: 'completed';
}

export interface OrchestrationGatewayExecutionFailure {
  errorCode: string;
  errorMessage: string;
  prompt?: OrchestrationPromptBuildResult;
  rawOutput: string;
  runtimeCursor: string | null;
  runtimeSessionId?: string;
  status: 'failed';
}

export type OrchestrationGatewayExecutionResult =
  | OrchestrationGatewayExecutionSuccess
  | OrchestrationGatewayExecutionFailure;

export async function executeOrchestrationStepViaGateway(input: {
  agentGatewayClient: AgentGatewayClient;
  onRuntimeStarted?: (runtimeSessionId: string) => void;
  onGatewayEvent?: (event: AgentGatewayEventEnvelope) => void;
  session: OrchestrationSessionPayload;
  step: OrchestrationStepPayload;
  upstreamArtifacts: OrchestrationArtifactPayload[];
}): Promise<OrchestrationGatewayExecutionResult> {
  const prompt = buildOrchestrationPrompt({
    session: input.session,
    step: input.step,
    upstreamArtifacts: input.upstreamArtifacts,
  });

  const sessionResponse = await input.agentGatewayClient.createSession({
    provider: input.session.provider,
    traceId: input.session.traceId,
    metadata: {
      orchestrationSessionId: input.session.id,
      orchestrationStepId: input.step.id,
      role: input.step.role ?? null,
      cwd: input.session.cwd ?? null,
    },
  });
  const runtimeSessionId = sessionResponse.session.sessionId;
  input.onRuntimeStarted?.(runtimeSessionId);

  await input.agentGatewayClient.prompt(runtimeSessionId, {
    input: renderGatewayPrompt(prompt),
    timeoutMs: defaultPromptTimeoutMs,
    traceId: input.session.traceId,
    cwd: input.session.cwd ?? undefined,
    env: {
      TEAM_AI_ORCHESTRATION_SESSION_ID: input.session.id,
      TEAM_AI_ORCHESTRATION_STEP_ID: input.step.id,
      TEAM_AI_ORCHESTRATION_STEP_KIND: input.step.kind,
      TEAM_AI_ORCHESTRATION_STEP_ROLE: input.step.role ?? 'specialist',
    },
    metadata: {
      promptVersion: prompt.version,
      artifactKind: prompt.artifactKind,
    },
  });

  return await collectGatewayExecution({
    agentGatewayClient: input.agentGatewayClient,
    onGatewayEvent: input.onGatewayEvent,
    prompt,
    runtimeCursor: null,
    runtimeSessionId,
  });
}

export async function resumeOrchestrationStepViaGateway(input: {
  agentGatewayClient: AgentGatewayClient;
  onGatewayEvent?: (event: AgentGatewayEventEnvelope) => void;
  runtimeCursor?: string | null;
  runtimeSessionId: string;
  session: OrchestrationSessionPayload;
  step: OrchestrationStepPayload;
  upstreamArtifacts: OrchestrationArtifactPayload[];
}): Promise<OrchestrationGatewayExecutionResult> {
  const prompt = buildOrchestrationPrompt({
    session: input.session,
    step: input.step,
    upstreamArtifacts: input.upstreamArtifacts,
  });

  return await collectGatewayExecution({
    agentGatewayClient: input.agentGatewayClient,
    onGatewayEvent: input.onGatewayEvent,
    prompt,
    runtimeCursor: input.runtimeCursor ?? null,
    runtimeSessionId: input.runtimeSessionId,
  });
}

async function collectGatewayExecution(input: {
  agentGatewayClient: AgentGatewayClient;
  onGatewayEvent?: (event: AgentGatewayEventEnvelope) => void;
  prompt: OrchestrationPromptBuildResult;
  runtimeCursor: string | null;
  runtimeSessionId: string;
}): Promise<OrchestrationGatewayExecutionResult> {
  let cursor: string | null = input.runtimeCursor;
  const outputChunks: string[] = [];
  const deadline = Date.now() + defaultPromptTimeoutMs + gatewayPollGraceMs;

  while (Date.now() < deadline) {
    const page = await input.agentGatewayClient.listEvents(
      input.runtimeSessionId,
      cursor ?? undefined,
    );

    for (const event of page.events) {
      if (event.cursor) {
        cursor = event.cursor;
      }
      input.onGatewayEvent?.(event);

      if (event.type === 'delta') {
        const text = asEventText(event);
        if (text) {
          outputChunks.push(text);
        }
        continue;
      }

      if (event.type === 'error') {
        return {
          status: 'failed',
          errorCode: event.error?.code ?? 'ORCHESTRATION_GATEWAY_ERROR',
          errorMessage:
            event.error?.message ??
            'Gateway execution failed without an error message',
          prompt: input.prompt,
          rawOutput: outputChunks.join(''),
          runtimeCursor: cursor,
          runtimeSessionId: input.runtimeSessionId,
        };
      }

      if (event.type === 'complete') {
        return parseCompletedResult({
          prompt: input.prompt,
          rawOutput: outputChunks.join(''),
          runtimeCursor: cursor,
          runtimeSessionId: input.runtimeSessionId,
        });
      }
    }

    if (
      page.session.state === 'FAILED' ||
      page.session.state === 'CANCELLED'
    ) {
      return {
        status: 'failed',
        errorCode:
          page.session.state === 'CANCELLED'
            ? 'ORCHESTRATION_GATEWAY_CANCELLED'
            : 'ORCHESTRATION_GATEWAY_FAILED',
        errorMessage: `Gateway session ended with state ${page.session.state}`,
        prompt: input.prompt,
        rawOutput: outputChunks.join(''),
        runtimeCursor: cursor,
        runtimeSessionId: input.runtimeSessionId,
      };
    }

    if (page.session.state === 'COMPLETED') {
      return parseCompletedResult({
        prompt: input.prompt,
        rawOutput: outputChunks.join(''),
        runtimeCursor: cursor,
        runtimeSessionId: input.runtimeSessionId,
      });
    }

    await sleep(gatewayPollIntervalMs);
  }

  return {
    status: 'failed',
    errorCode: 'ORCHESTRATION_GATEWAY_TIMEOUT',
    errorMessage: `Gateway session ${input.runtimeSessionId} did not complete before the poll deadline`,
    prompt: input.prompt,
    rawOutput: outputChunks.join(''),
    runtimeCursor: cursor,
    runtimeSessionId: input.runtimeSessionId,
  };
}

function parseCompletedResult(input: {
  prompt: OrchestrationPromptBuildResult;
  rawOutput: string;
  runtimeCursor: string | null;
  runtimeSessionId: string;
}): OrchestrationGatewayExecutionResult {
  try {
    const parsedOutput = parsePromptOutput(
      input.prompt,
      extractJsonPayload(input.rawOutput),
    ) as Record<string, unknown>;

    return {
      status: 'completed',
      artifactKind: input.prompt.artifactKind,
      parsedOutput,
      prompt: input.prompt,
      rawOutput: input.rawOutput,
      runtimeCursor: input.runtimeCursor,
      runtimeSessionId: input.runtimeSessionId,
    };
  } catch (error) {
    return {
      status: 'failed',
      errorCode: 'ORCHESTRATION_OUTPUT_INVALID',
      errorMessage:
        error instanceof Error
          ? error.message
          : 'Unable to parse gateway output as orchestration JSON',
      prompt: input.prompt,
      rawOutput: input.rawOutput,
      runtimeCursor: input.runtimeCursor,
      runtimeSessionId: input.runtimeSessionId,
    };
  }
}

function renderGatewayPrompt(prompt: OrchestrationPromptBuildResult): string {
  return [
    `System:\n${prompt.systemPrompt}`,
    `User:\n${prompt.userPrompt}`,
    'Output contract: return strict JSON only.',
  ].join('\n\n');
}

function extractJsonPayload(output: string): unknown {
  const trimmed = output.trim();
  if (trimmed.length === 0) {
    throw new Error('Gateway returned an empty response');
  }

  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fencedMatch?.[1]) {
      return JSON.parse(fencedMatch[1].trim()) as unknown;
    }

    const firstBrace = trimmed.indexOf('{');
    const lastBrace = trimmed.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1)) as unknown;
    }

    throw new Error('Gateway did not return a valid JSON payload');
  }
}

function asEventText(event: AgentGatewayEventEnvelope): string | null {
  const text = event.data?.text;
  return typeof text === 'string' ? text : null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
