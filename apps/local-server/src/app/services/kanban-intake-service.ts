import type { Database } from 'better-sqlite3';
import type { NotePayload } from '../schemas/note';
import type { TaskKind } from '../schemas/task';
import { recordNoteEvent } from './note-event-service';
import {
  createNote,
  findSpecNoteByScope,
  updateNote,
} from './note-service';
import { getProjectById } from './project-service';
import { syncSpecTasks } from './spec-task-sync-service';

export interface KanbanIntakeInput {
  acceptanceHints?: string[];
  artifactHints?: string[];
  constraints?: string[];
  goal: string;
  projectId: string;
  sessionId?: string | null;
}

export interface KanbanIntakeResult {
  archivedTaskIds: string[];
  createdTaskIds: string[];
  decomposition: {
    goal: string;
    tasks: Array<{
      kind: TaskKind;
      owner: string;
      title: string;
    }>;
  };
  note: NotePayload;
  parsedTaskCount: number;
  specFragment: string;
  updatedTaskIds: string[];
}

interface IntakeTaskPlan {
  acceptanceCriteria: string[];
  executionHints: string[];
  kind: TaskKind;
  objective: string;
  owner: string;
  scope: string[];
  title: string;
  verificationCommands: string[];
}

function normalizeList(values: string[] | undefined) {
  if (!values) {
    return [];
  }

  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) {
      continue;
    }
    const normalizedKey = trimmed.toLowerCase();
    if (seen.has(normalizedKey)) {
      continue;
    }
    seen.add(normalizedKey);
    normalized.push(trimmed);
  }

  return normalized;
}

function toGoalTitle(goal: string) {
  const compact = goal.trim().replace(/\s+/g, ' ');
  if (compact.length <= 72) {
    return compact;
  }

  return `${compact.slice(0, 69).trimEnd()}...`;
}

function renderBulletSection(title: string, items: string[]) {
  if (items.length === 0) {
    return '';
  }

  return `### ${title}\n${items.map((item) => `- ${item}`).join('\n')}`;
}

function buildTaskPlans(input: {
  acceptanceHints: string[];
  artifactHints: string[];
  constraints: string[];
  goal: string;
  revision: number;
}) {
  const goalTitle = toGoalTitle(input.goal);
  const revisionLabel = `revision-${input.revision}`;
  const implementAcceptance =
    input.acceptanceHints.length > 0
      ? input.acceptanceHints
      : [`Deliver the requested outcome: ${goalTitle}`];
  const implementVerification =
    input.artifactHints.length > 0
      ? input.artifactHints.map((item) => `Provide artifact evidence for ${item}`)
      : ['Share implementation evidence and the main verification command output'];

  const plans: IntakeTaskPlan[] = [
    {
      acceptanceCriteria: [
        'Clarify scope, constraints, and acceptance criteria before execution starts',
        'Split the goal into an execution-ready implementation slice',
        'Capture artifact expectations and handoff notes for downstream work',
      ],
      executionHints: [
        'Coordinator only: refine the work and delegate, do not implement code in this step.',
        'Keep the canonical spec updated before launching heavy execution work.',
      ],
      kind: 'plan',
      objective: `Refine the goal into an execution-ready plan.\n\nGoal:\n${goalTitle}`,
      owner: 'Todo Orchestrator',
      scope: [
        `Planning Revision: ${input.revision}`,
        `Planning Wave: ${revisionLabel}`,
        'Coordinator Boundary: decomposition, sequencing, and approval management only',
      ],
      title: `Refine ${goalTitle}`,
      verificationCommands: [
        'Confirm the resulting card set is implementation-ready',
      ],
    },
    {
      acceptanceCriteria: implementAcceptance,
      executionHints: [
        'Use the refinement output instead of re-planning from scratch.',
        ...(input.constraints.length > 0 ? input.constraints : []),
      ],
      kind: 'implement',
      objective: [
        `Implement the requested goal: ${goalTitle}`,
        input.constraints.length > 0
          ? `Constraints:\n${input.constraints.map((item) => `- ${item}`).join('\n')}`
          : null,
      ]
        .filter(Boolean)
        .join('\n\n'),
      owner: 'Crafter Implementor',
      scope: [
        `Planning Revision: ${input.revision}`,
        `Planning Wave: ${revisionLabel}`,
        'Derived From: coordinator intake plan',
      ],
      title: `Implement ${goalTitle}`,
      verificationCommands: implementVerification,
    },
    {
      acceptanceCriteria: [
        `Validate the implementation satisfies the goal: ${goalTitle}`,
        ...(input.acceptanceHints.length > 0
          ? input.acceptanceHints
          : ['Confirm the implementation is production-ready or clearly note gaps']),
      ],
      executionHints: [
        'Review against the refined acceptance criteria, not just the latest summary.',
        'Bounce back to implementation when evidence or acceptance is incomplete.',
      ],
      kind: 'review',
      objective: `Review the delivered implementation, compare it to the goal and acceptance hints, and decide whether it can move forward.`,
      owner: 'Gate Reviewer',
      scope: [
        `Planning Revision: ${input.revision}`,
        `Planning Wave: ${revisionLabel}`,
        'Derived From: coordinator intake plan',
      ],
      title: `Review ${goalTitle}`,
      verificationCommands:
        input.artifactHints.length > 0
          ? input.artifactHints.map((item) => `Check artifact evidence for ${item}`)
          : ['Review the change summary and verification output'],
    },
  ];

  return plans;
}

function renderTaskBlock(
  task: IntakeTaskPlan,
  blockIndex: number,
  tasks: IntakeTaskPlan[],
) {
  const sections = [
    '@@@task',
    `# ${task.title}`,
    task.objective,
    '',
    '## Owner',
    task.owner,
    '',
    '## Definition of Done',
    ...task.acceptanceCriteria.map((item) => `- ${item}`),
  ];

  if (task.executionHints.length > 0) {
    sections.push(
      '',
      '## Execution Hints',
      ...task.executionHints.map((item) => `- ${item}`),
    );
  }

  if (task.scope.length > 0) {
    sections.push('', '## Scope', ...task.scope.map((item) => `- ${item}`));
  }

  if (blockIndex > 0) {
    sections.push('', '## Depends On', `- ${tasks[blockIndex - 1]?.title}`);
  }

  sections.push(
    '',
    '## Verification',
    ...task.verificationCommands.map((item) => `- ${item}`),
    '@@@',
  );

  return sections.join('\n');
}

function renderSpecFragment(input: {
  acceptanceHints: string[];
  artifactHints: string[];
  constraints: string[];
  goal: string;
  revision: number;
}) {
  const tasks = buildTaskPlans(input);
  const headerSections = [
    `## Intake Goal · ${toGoalTitle(input.goal)}`,
    input.goal,
    renderBulletSection('Planning Metadata', [
      `Revision: ${input.revision}`,
      'Coordinator Contract: planning, decomposition, sequencing, and writeback only',
    ]),
    renderBulletSection('Constraints', input.constraints),
    renderBulletSection('Acceptance Hints', input.acceptanceHints),
    renderBulletSection('Artifact Hints', input.artifactHints),
  ].filter(Boolean);

  return {
    specFragment: [
      ...headerSections,
      ...tasks.map((task, index) => renderTaskBlock(task, index, tasks)),
    ].join('\n\n'),
    tasks,
  };
}

function createInitialSpecContent(projectTitle: string, specFragment: string) {
  return [
    '# Project Spec',
    '',
    `Canonical execution plan for ${projectTitle}.`,
    '',
    specFragment,
  ].join('\n');
}

function countIntakeRevisions(content: string | null | undefined) {
  return (content?.match(/^## Intake Goal · /gm) ?? []).length;
}

export async function intakeKanbanGoal(
  sqlite: Database,
  input: KanbanIntakeInput,
): Promise<KanbanIntakeResult> {
  const project = await getProjectById(sqlite, input.projectId);
  const sessionId = input.sessionId ?? null;
  const constraints = normalizeList(input.constraints);
  const acceptanceHints = normalizeList(input.acceptanceHints);
  const artifactHints = normalizeList(input.artifactHints);
  const goal = input.goal.trim();
  const existingNote = await findSpecNoteByScope(sqlite, {
    projectId: input.projectId,
    sessionId,
  });
  const revision = countIntakeRevisions(existingNote?.content) + 1;
  const rendered = renderSpecFragment({
    acceptanceHints,
    artifactHints,
    constraints,
    goal,
    revision,
  });
  const nextContent = existingNote?.content.trim()
    ? `${existingNote.content.trim()}\n\n---\n\n${rendered.specFragment}`
    : createInitialSpecContent(project.title, rendered.specFragment);

  const note = existingNote
    ? await updateNote(sqlite, existingNote.id, {
        content: nextContent,
        source: 'system',
        title: existingNote.title,
        type: 'spec',
      })
    : await createNote(sqlite, {
        content: nextContent,
        projectId: input.projectId,
        sessionId,
        source: 'system',
        title: `${project.title} Spec`,
        type: 'spec',
      });

  await recordNoteEvent(sqlite, {
    note,
    type: existingNote ? 'updated' : 'created',
  });

  const sync = await syncSpecTasks(sqlite, {
    noteId: note.id,
    projectId: input.projectId,
    sessionId,
  });

  return {
    archivedTaskIds: sync.archivedTaskIds,
    createdTaskIds: sync.createdTaskIds,
    decomposition: {
      goal,
      tasks: rendered.tasks.map((task) => ({
        kind: task.kind,
        owner: task.owner,
        title: task.title,
      })),
    },
    note,
    parsedTaskCount: sync.parsedTaskCount,
    specFragment: rendered.specFragment,
    updatedTaskIds: sync.updatedTaskIds,
  };
}
