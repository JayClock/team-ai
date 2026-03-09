import { describe, expect, it } from 'vitest';
import type {
  OrchestrationArtifactPayload,
  OrchestrationSessionPayload,
  OrchestrationStepPayload,
} from '../schemas/orchestration';
import {
  buildOrchestrationPrompt,
  parsePromptOutput,
} from './orchestration-prompt-builder';

describe('orchestration-prompt-builder', () => {
  const session: OrchestrationSessionPayload = {
    id: 'orc_123',
    projectId: 'proj_123',
    provider: 'codex',
    executionMode: 'local',
    workspaceRoot: '/tmp/team-ai',
    title: 'Build local orchestration',
    goal: 'Implement a local orchestration workflow',
    status: 'PENDING',
    strategy: {
      failFast: true,
      maxParallelism: 1,
      mode: 'planner-assisted',
    },
    stepCounts: {
      completed: 0,
      failed: 0,
      running: 0,
      total: 3,
    },
    createdAt: '2026-03-09T00:00:00.000Z',
    updatedAt: '2026-03-09T00:00:00.000Z',
  };

  it('builds a planner prompt with the versioned template', () => {
    const step = createStep('PLAN', 'planner', []);

    const prompt = buildOrchestrationPrompt({
      session,
      step,
      constraints: ['Keep changes minimal', 'Return JSON only'],
    });

    expect(prompt.version).toBe('planner.v1');
    expect(prompt.artifactKind).toBe('plan');
    expect(prompt.userPrompt).toContain('Goal: Implement a local orchestration workflow');
    expect(prompt.userPrompt).toContain('Constraints: Keep changes minimal; Return JSON only');
  });

  it('builds an implement prompt from a plan artifact', () => {
    const step = createStep('IMPLEMENT', 'crafter', ['step_plan']);
    const prompt = buildOrchestrationPrompt({
      session,
      step,
      upstreamArtifacts: [
        createArtifact('plan', {
          summary: 'Add gateway-backed orchestration execution',
          tasks: [
            {
              id: 'task-1',
              title: 'Add gateway client',
              description: 'Create a client wrapper for the local execution gateway',
              acceptanceCriteria: ['client exists', 'health check works'],
            },
          ],
          files: ['apps/local-server/src/app/clients/agent-gateway-client.ts'],
          verification: {
            commands: ['npx nx build local-server'],
            notes: ['Run local-server build after changes'],
          },
          risks: ['CLI process timeout handling'],
        }),
      ],
    });

    expect(prompt.version).toBe('crafter.v1');
    expect(prompt.artifactKind).toBe('implementation');
    expect(prompt.userPrompt).toContain('Plan summary: Add gateway-backed orchestration execution');
    expect(prompt.userPrompt).toContain('Add gateway client');
  });

  it('builds a verify prompt from plan and implementation artifacts', () => {
    const step = createStep('VERIFY', 'gate', ['step_impl']);
    const prompt = buildOrchestrationPrompt({
      session,
      step,
      upstreamArtifacts: [
        createArtifact('plan', {
          summary: 'Validate local orchestration flow',
          tasks: [
            {
              id: 'task-1',
              title: 'Validate build',
              description: 'Confirm the build succeeds',
              acceptanceCriteria: ['build passes'],
            },
          ],
          files: [],
          verification: {
            commands: ['npx nx build local-server', 'npx vitest run'],
            notes: [],
          },
          risks: [],
        }),
        createArtifact('implementation', {
          summary: 'Added prompt builder and artifact service',
          changedFiles: ['apps/local-server/src/app/services/orchestration-prompt-builder.ts'],
          implementationNotes: ['Added versioned templates'],
          followUps: [],
        }),
      ],
    });

    expect(prompt.version).toBe('gate.v1');
    expect(prompt.artifactKind).toBe('verification');
    expect(prompt.userPrompt).toContain('Implementation summary: Added prompt builder and artifact service');
    expect(prompt.userPrompt).toContain('npx nx build local-server; npx vitest run');
  });

  it('parses prompt output with the associated schema', () => {
    const step = createStep('PLAN', 'planner', []);
    const prompt = buildOrchestrationPrompt({
      session,
      step,
    });

    const parsed = parsePromptOutput(prompt, {
      summary: 'Plan the local runtime integration',
      tasks: [
        {
          id: 'task-1',
          title: 'Implement prompt builder',
          description: 'Create versioned templates',
          acceptanceCriteria: ['schema exists'],
        },
      ],
      files: ['apps/local-server/src/app/prompts/planner.v1.ts'],
      verification: {
        commands: ['npx vitest run'],
        notes: ['Run focused tests'],
      },
      risks: [],
    });

    expect(parsed).toMatchObject({
      summary: 'Plan the local runtime integration',
    });
  });

  it('throws when a required upstream artifact is missing', () => {
    const step = createStep('IMPLEMENT', 'crafter', ['step_plan']);

    expect(() =>
      buildOrchestrationPrompt({
        session,
        step,
      }),
    ).toThrow('Missing required orchestration artifact "plan"');
  });
});

function createStep(
  kind: OrchestrationStepPayload['kind'],
  role: string,
  dependsOn: string[],
): OrchestrationStepPayload {
  return {
    id: `step_${kind.toLowerCase()}`,
    sessionId: 'orc_123',
    title: `${kind} step`,
    kind,
    role,
    status: 'PENDING',
    attempt: 1,
    maxAttempts: 3,
    dependsOn,
    artifacts: [],
    createdAt: '2026-03-09T00:00:00.000Z',
    updatedAt: '2026-03-09T00:00:00.000Z',
  };
}

function createArtifact(
  kind: string,
  content: Record<string, unknown>,
): OrchestrationArtifactPayload {
  return {
    id: `art_${kind}`,
    sessionId: 'orc_123',
    stepId: `step_${kind}`,
    kind,
    content,
    createdAt: '2026-03-09T00:00:00.000Z',
    updatedAt: '2026-03-09T00:00:00.000Z',
  };
}
