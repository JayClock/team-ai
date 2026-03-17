export type FlowTriggerType = 'manual' | 'schedule' | 'webhook';

export interface FlowTriggerPayload {
  event: string | null;
  source: string | null;
  type: FlowTriggerType;
}

export interface FlowStepPayload {
  adapter: string | null;
  config: Record<string, string>;
  input: string;
  name: string;
  outputKey: string | null;
  specialistId: string;
}

export interface FlowPayload {
  description: string | null;
  id: string;
  name: string;
  source: {
    libraryId: string | null;
    path: string;
    scope: 'builtin' | 'library' | 'user' | 'workspace';
  };
  steps: FlowStepPayload[];
  trigger: FlowTriggerPayload;
  variables: Record<string, string>;
  version: string | null;
}

export interface FlowListPayload {
  items: FlowPayload[];
  projectId: string;
}
