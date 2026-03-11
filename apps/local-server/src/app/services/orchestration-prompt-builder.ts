import { ZodType } from 'zod';
import type {
  OrchestrationArtifactPayload,
  OrchestrationSessionPayload,
  OrchestrationStepPayload,
} from '../schemas/orchestration';
import {
  buildCrafterPrompts,
  crafterOutputSchema,
  crafterPromptVersion,
  type CrafterOutput,
} from '../prompts/crafter.v1';
import {
  buildGatePrompts,
  gateOutputSchema,
  gatePromptVersion,
  type GateOutput,
} from '../prompts/gate.v1';
import {
  buildPlannerPrompts,
  plannerOutputSchema,
  plannerPromptVersion,
  type PlannerOutput,
} from '../prompts/planner.v1';

export interface OrchestrationPromptBuildResult {
  artifactKind: string;
  outputSchema: ZodType;
  stepKind: OrchestrationStepPayload['kind'];
  systemPrompt: string;
  userPrompt: string;
  version: string;
}

interface PromptContext {
  constraints?: string[];
  session: Pick<
    OrchestrationSessionPayload,
    | 'executionMode'
    | 'goal'
    | 'id'
    | 'projectId'
    | 'provider'
    | 'title'
    | 'cwd'
  >;
  step: Pick<
    OrchestrationStepPayload,
    'dependsOn' | 'id' | 'kind' | 'role' | 'title'
  >;
  upstreamArtifacts?: OrchestrationArtifactPayload[];
}

export function buildOrchestrationPrompt(
  context: PromptContext,
): OrchestrationPromptBuildResult {
  const constraints = context.constraints ?? [];

  switch (context.step.kind) {
    case 'PLAN': {
      const prompt = buildPlannerPrompts({
        constraints,
        executionMode: context.session.executionMode,
        goal: context.session.goal,
        projectId: context.session.projectId,
        provider: context.session.provider,
        sessionId: context.session.id,
        stepId: context.step.id,
        title: context.step.title,
        cwd: context.session.cwd,
      });

      return {
        artifactKind: 'plan',
        outputSchema: plannerOutputSchema,
        stepKind: context.step.kind,
        systemPrompt: prompt.systemPrompt,
        userPrompt: prompt.userPrompt,
        version: plannerPromptVersion,
      };
    }
    case 'IMPLEMENT': {
      const planArtifact = requireArtifact(context, 'plan');
      const plan = plannerOutputSchema.parse(
        planArtifact.content,
      ) as PlannerOutput;
      const prompt = buildCrafterPrompts({
        constraints,
        executionMode: context.session.executionMode,
        goal: context.session.goal,
        planSummary: plan.summary,
        planTasks: plan.tasks,
        projectId: context.session.projectId,
        provider: context.session.provider,
        sessionId: context.session.id,
        stepId: context.step.id,
        title: context.step.title,
        cwd: context.session.cwd,
      });

      return {
        artifactKind: 'implementation',
        outputSchema: crafterOutputSchema,
        stepKind: context.step.kind,
        systemPrompt: prompt.systemPrompt,
        userPrompt: prompt.userPrompt,
        version: crafterPromptVersion,
      };
    }
    case 'VERIFY': {
      const planArtifact = requireArtifact(context, 'plan');
      const implementationArtifact = requireArtifact(context, 'implementation');
      const plan = plannerOutputSchema.parse(
        planArtifact.content,
      ) as PlannerOutput;
      const implementation = crafterOutputSchema.parse(
        implementationArtifact.content,
      ) as CrafterOutput;
      const prompt = buildGatePrompts({
        constraints,
        executionMode: context.session.executionMode,
        goal: context.session.goal,
        implementationSummary: implementation.summary,
        implementationNotes: implementation.implementationNotes,
        planSummary: plan.summary,
        projectId: context.session.projectId,
        provider: context.session.provider,
        sessionId: context.session.id,
        stepId: context.step.id,
        title: context.step.title,
        verificationCommands: plan.verification.commands,
        cwd: context.session.cwd,
      });

      return {
        artifactKind: 'verification',
        outputSchema: gateOutputSchema,
        stepKind: context.step.kind,
        systemPrompt: prompt.systemPrompt,
        userPrompt: prompt.userPrompt,
        version: gatePromptVersion,
      };
    }
  }
}

function requireArtifact(
  context: PromptContext,
  kind: string,
): OrchestrationArtifactPayload {
  const artifact = context.upstreamArtifacts?.find(
    (item) => item.kind === kind,
  );

  if (artifact) {
    return artifact;
  }

  throw new Error(
    `Missing required orchestration artifact "${kind}" for step ${context.step.id}`,
  );
}

export function parsePromptOutput(
  prompt: OrchestrationPromptBuildResult,
  output: unknown,
): PlannerOutput | CrafterOutput | GateOutput {
  return prompt.outputSchema.parse(output) as
    | PlannerOutput
    | CrafterOutput
    | GateOutput;
}
