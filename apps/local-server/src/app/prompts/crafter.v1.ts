import { z } from 'zod';

export const crafterPromptVersion = 'crafter.v1';

export const crafterOutputSchema = z.object({
  summary: z.string().min(1),
  changedFiles: z.array(z.string().min(1)).default([]),
  implementationNotes: z.array(z.string().min(1)).default([]),
  followUps: z.array(z.string().min(1)).default([]),
});

export type CrafterOutput = z.infer<typeof crafterOutputSchema>;

export function buildCrafterPrompts(input: {
  constraints: string[];
  cwd?: string | null;
  executionMode: string;
  goal: string;
  planSummary: string;
  planTasks: Array<{
    acceptanceCriteria: string[];
    description: string;
    id: string;
    title: string;
  }>;
  projectId: string;
  provider: string;
  sessionId: string;
  stepId: string;
  title: string;
}) {
  const systemPrompt = [
    'You are the implementation specialist for a local orchestration workflow.',
    'Apply the agreed plan and respond in strict JSON only.',
    'Do not include markdown fences or natural-language preambles.',
    'The JSON must satisfy the crafter output schema exactly.',
  ].join(' ');

  const taskLines = input.planTasks.map(
    (task) =>
      `- [${task.id}] ${task.title}: ${task.description} | acceptance: ${task.acceptanceCriteria.join(', ')}`,
  );

  const userPrompt = [
    `Session: ${input.sessionId}`,
    `Step: ${input.stepId}`,
    `Project: ${input.projectId}`,
    `Provider: ${input.provider}`,
    `Execution mode: ${input.executionMode}`,
    `CWD: ${input.cwd ?? 'not-provided'}`,
    `Title: ${input.title}`,
    `Goal: ${input.goal}`,
    `Plan summary: ${input.planSummary}`,
    'Planned tasks:',
    ...(taskLines.length > 0 ? taskLines : ['- none']),
    `Constraints: ${input.constraints.length > 0 ? input.constraints.join('; ') : 'none'}`,
    'Return JSON with fields: summary, changedFiles, implementationNotes, followUps.',
  ].join('\n');

  return {
    systemPrompt,
    userPrompt,
    version: crafterPromptVersion,
  };
}
