import type { KanbanColumnPayload } from '../schemas/kanban';
import type { TaskPayload } from '../schemas/task';

export interface TaskArtifactGateEvaluation {
  evidence: string[];
  gated: boolean;
  message: string | null;
  missingArtifacts: string[];
}

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function matchesArtifactRequirement(requirement: string, evidence: string) {
  const normalizedRequirement = normalize(requirement);
  const normalizedEvidence = normalize(evidence);

  if (normalizedEvidence.includes(normalizedRequirement)) {
    return true;
  }

  if (
    (normalizedRequirement.includes('url') ||
      normalizedRequirement.includes('link')) &&
    /(https?:\/\/|localhost|127\.0\.0\.1)/.test(normalizedEvidence)
  ) {
    return true;
  }

  if (
    (normalizedRequirement.includes('command') ||
      normalizedRequirement.includes('cmd')) &&
    /\b(pnpm|npm|npx|yarn|bun|node|uv|pytest|cargo|go test)\b/.test(
      normalizedEvidence,
    )
  ) {
    return true;
  }

  if (
    (normalizedRequirement.includes('screenshot') ||
      normalizedRequirement.includes('image')) &&
    /\.(png|jpg|jpeg|webp|gif)\b/.test(normalizedEvidence)
  ) {
    return true;
  }

  return false;
}

function isGateColumn(column: KanbanColumnPayload) {
  const normalized = `${column.id} ${column.name}`.toLowerCase();
  return normalized.includes('review') || normalized.includes('verify');
}

function collectTaskArtifactEvidence(
  task: TaskPayload,
  sessionId: string | null,
): string[] {
  const evidence = new Set<string>();

  const append = (value: string | null | undefined) => {
    const normalized = value?.trim();
    if (normalized) {
      evidence.add(normalized);
    }
  };

  append(task.completionSummary);
  append(task.verificationReport);

  for (const handoff of task.laneHandoffs) {
    const relatesToSession =
      !sessionId ||
      handoff.fromSessionId === sessionId ||
      handoff.toSessionId === sessionId;
    if (!relatesToSession) {
      continue;
    }

    if (handoff.status === 'completed') {
      append(handoff.responseSummary);
      for (const artifact of handoff.artifactEvidence ?? []) {
        append(artifact);
      }
    }
  }

  return [...evidence];
}

function collectRequiredArtifacts(
  task: TaskPayload,
  column: KanbanColumnPayload,
  sessionId: string | null,
): string[] {
  const required = new Set(
    (column.automation?.requiredArtifacts ?? [])
      .map((item) => item.trim())
      .filter((item) => item.length > 0),
  );

  for (const handoff of task.laneHandoffs) {
    const relatesToSession =
      !sessionId ||
      handoff.fromSessionId === sessionId ||
      handoff.toSessionId === sessionId;
    if (!relatesToSession) {
      continue;
    }

    for (const hint of handoff.artifactHints ?? []) {
      const normalized = hint.trim();
      if (normalized) {
        required.add(normalized);
      }
    }
  }

  return [...required];
}

export function evaluateTaskArtifactGate(
  task: TaskPayload,
  column: KanbanColumnPayload,
  sessionId: string | null = null,
): TaskArtifactGateEvaluation {
  const requiredArtifacts = collectRequiredArtifacts(task, column, sessionId);
  const evidence = collectTaskArtifactEvidence(task, sessionId);

  if (!isGateColumn(column) && requiredArtifacts.length === 0) {
    return {
      evidence,
      gated: false,
      message: null,
      missingArtifacts: [],
    };
  }

  const missingArtifacts = requiredArtifacts.filter((artifact) => {
    return !evidence.some((entry) => matchesArtifactRequirement(artifact, entry));
  });

  if (missingArtifacts.length === 0) {
    return {
      evidence,
      gated: false,
      message: null,
      missingArtifacts: [],
    };
  }

  return {
    evidence,
    gated: true,
    message: `Artifact gate blocked auto-advance from ${column.name}: missing ${missingArtifacts.join(', ')}`,
    missingArtifacts,
  };
}
