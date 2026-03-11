import { z } from 'zod';

export const plannerPromptVersion = 'planner.v1';

export const plannerOutputSchema = z.object({
  summary: z.string().min(1),
  tasks: z
    .array(
      z.object({
        id: z.string().min(1),
        title: z.string().min(1),
        description: z.string().min(1),
        acceptanceCriteria: z.array(z.string().min(1)).min(1),
      }),
    )
    .min(1),
  files: z.array(z.string().min(1)).default([]),
  verification: z.object({
    commands: z.array(z.string().min(1)).default([]),
    notes: z.array(z.string().min(1)).default([]),
  }),
  risks: z.array(z.string().min(1)).default([]),
});

export type PlannerOutput = z.infer<typeof plannerOutputSchema>;

export function buildPlannerPrompts(input: {
  constraints: string[];
  cwd?: string | null;
  executionMode: string;
  goal: string;
  projectId: string;
  provider: string;
  sessionId: string;
  stepId: string;
  title: string;
}) {
  const systemPrompt = [
    'You are the planner for a local orchestration workflow.',
    'Produce a concise implementation plan in strict JSON only.',
    'Do not include markdown fences or explanatory prose outside the JSON payload.',
    'The JSON must satisfy the planner output schema exactly.',
  ].join(' ');

  const userPrompt = [
    `Session: ${input.sessionId}`,
    `Step: ${input.stepId}`,
    `Project: ${input.projectId}`,
    `Provider: ${input.provider}`,
    `Execution mode: ${input.executionMode}`,
    `CWD: ${input.cwd ?? 'not-provided'}`,
    `Title: ${input.title}`,
    `Goal: ${input.goal}`,
    `Constraints: ${input.constraints.length > 0 ? input.constraints.join('; ') : 'none'}`,
    'Return JSON with fields: summary, tasks, files, verification, risks.',
  ].join('\n');

  return {
    systemPrompt,
    userPrompt,
    version: plannerPromptVersion,
  };
}
