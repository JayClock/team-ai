import { z } from 'zod';

export const gatePromptVersion = 'gate.v1';

export const gateOutputSchema = z.object({
  verdict: z.enum(['pass', 'fail']),
  summary: z.string().min(1),
  findings: z.array(
    z.object({
      severity: z.enum(['low', 'medium', 'high']),
      title: z.string().min(1),
      detail: z.string().min(1),
    }),
  ),
  recommendedNextStep: z.enum(['complete', 'retry-step', 'retry-session']),
});

export type GateOutput = z.infer<typeof gateOutputSchema>;

export function buildGatePrompts(input: {
  constraints: string[];
  cwd?: string | null;
  executionMode: string;
  goal: string;
  implementationSummary: string;
  implementationNotes: string[];
  planSummary: string;
  projectId: string;
  provider: string;
  sessionId: string;
  stepId: string;
  title: string;
  verificationCommands: string[];
}) {
  const systemPrompt = [
    'You are the verification gate for a local orchestration workflow.',
    'Evaluate whether the implementation satisfies the plan and respond in strict JSON only.',
    'Do not include markdown fences or narrative outside the JSON.',
    'The JSON must satisfy the gate output schema exactly.',
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
    `Plan summary: ${input.planSummary}`,
    `Implementation summary: ${input.implementationSummary}`,
    `Implementation notes: ${input.implementationNotes.length > 0 ? input.implementationNotes.join('; ') : 'none'}`,
    `Verification commands: ${input.verificationCommands.length > 0 ? input.verificationCommands.join('; ') : 'none'}`,
    `Constraints: ${input.constraints.length > 0 ? input.constraints.join('; ') : 'none'}`,
    'Return JSON with fields: verdict, summary, findings, recommendedNextStep.',
  ].join('\n');

  return {
    systemPrompt,
    userPrompt,
    version: gatePromptVersion,
  };
}
