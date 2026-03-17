import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';
import {
  cancelAcpSession,
  createAcpSession,
  promptAcpSession,
} from '../services/acp-service';
import {
  createKanbanWorkflowOrchestrator,
  type KanbanWorkflowOrchestrator,
} from '../services/kanban-workflow-orchestrator-service';
import { getProjectKanbanBoardById } from '../services/kanban-board-service';
import {
  markTaskLaneSessionStatus,
  upsertTaskLaneSession,
} from '../services/task-lane-service';
import { getTaskById, updateTask } from '../services/task-service';

declare module 'fastify' {
  interface FastifyInstance {
    kanbanWorkflowOrchestrator: KanbanWorkflowOrchestrator;
  }
}

function buildKanbanTaskPrompt(
  task: {
    acceptanceCriteria: string[];
    objective: string;
    scope: string | null;
    title: string;
  },
  column: {
    name: string;
  },
) {
  const normalizedColumn = column.name.toLowerCase();
  const collaborationInstructions =
    normalizedColumn.includes('review') || normalizedColumn.includes('verify')
      ? [
          'If runtime setup from the previous lane is needed, call request_previous_lane_handoff instead of guessing the environment.',
          'Continue once the previous lane replies with submit_lane_handoff.',
        ]
      : normalizedColumn.includes('dev')
        ? [
            'If another lane requests runtime or environment help for this task, complete only the requested support work.',
            'When you finish that support work, call submit_lane_handoff with the handoff id and a concise summary.',
          ]
        : [];

  return [
    `Run the ${column.name} column automation for task "${task.title}".`,
    `Objective: ${task.objective}`,
    task.scope ? `Scope: ${task.scope}` : null,
    task.acceptanceCriteria.length > 0
      ? `Acceptance Criteria:\n- ${task.acceptanceCriteria.join('\n- ')}`
      : null,
    collaborationInstructions.length > 0
      ? `Lane Collaboration:\n- ${collaborationInstructions.join('\n- ')}`
      : null,
  ]
    .filter((value): value is string => Boolean(value))
    .join('\n\n');
}

const kanbanWorkflowOrchestratorPlugin: FastifyPluginAsync = async (
  fastify,
) => {
  const orchestrator = createKanbanWorkflowOrchestrator({
    callbacks: {
      async cancelTaskSession(task, sessionId) {
        await cancelAcpSession(
          fastify.sqlite,
          fastify.acpStreamBroker,
          fastify.acpRuntime,
          task.projectId,
          sessionId,
          'kanban_column_transition',
          {
            logger: fastify.log,
            source: 'kanban_cancel_task_session',
          },
        );
      },
      async startTaskSession(task, column) {
        const useProvider = fastify.acpRuntime.isConfigured(
          task.assignedProvider ?? '',
        );
        const session = await createAcpSession(
          fastify.sqlite,
          fastify.acpStreamBroker,
          fastify.acpRuntime,
          {
            actorUserId: 'desktop-user',
            codebaseId: task.codebaseId,
            goal: task.title,
            role: task.assignedRole,
            projectId: task.projectId,
            provider: useProvider ? task.assignedProvider : null,
            specialistId: task.assignedSpecialistId ?? (
              useProvider ? undefined : task.assignedProvider ?? undefined
            ),
            taskId: task.id,
            worktreeId: task.worktreeId,
          },
          {
            logger: fastify.log,
            source: 'kanban_start_task_session',
          },
        );

        const freshTask = await getTaskById(fastify.sqlite, task.id);
        const board = freshTask.boardId
          ? await getProjectKanbanBoardById(
              fastify.sqlite,
              freshTask.projectId,
              freshTask.boardId,
            ).catch(() => null)
          : null;
        const columnName =
          board?.columns.find((candidate) => candidate.id === column.id)?.name ??
          column.name;

        upsertTaskLaneSession(freshTask, {
          columnId: column.id,
          columnName,
          provider: session.provider,
          role: freshTask.assignedRole ?? undefined,
          sessionId: session.id,
          specialistId:
            freshTask.assignedSpecialistId ?? session.specialistId ?? undefined,
          specialistName: freshTask.assignedSpecialistName ?? undefined,
          startedAt: session.startedAt ?? undefined,
          status: 'running',
        });

        await updateTask(fastify.sqlite, freshTask.id, {
          laneSessions: freshTask.laneSessions,
          triggerSessionId: session.id,
        });

        void promptAcpSession(
          fastify.sqlite,
          fastify.acpStreamBroker,
          fastify.acpRuntime,
          task.projectId,
          session.id,
          {
            prompt: buildKanbanTaskPrompt(task, column),
          },
          {
            logger: fastify.log,
            source: 'kanban_prompt_task_session',
          },
        )
          .then(async () => {
            const linkedTask = await getTaskById(fastify.sqlite, task.id).catch(
              () => null,
            );
            if (linkedTask) {
              markTaskLaneSessionStatus(linkedTask, session.id, 'completed');
              await updateTask(fastify.sqlite, linkedTask.id, {
                laneSessions: linkedTask.laneSessions,
                resultSessionId: session.id,
              });
            }

            await fastify.kanbanEventService.emit({
              projectId: task.projectId,
              sessionId: session.id,
              success: true,
              taskId: task.id,
              type: 'task.session-completed',
            });
          })
          .catch(async (error) => {
            const linkedTask = await getTaskById(fastify.sqlite, task.id).catch(
              () => null,
            );
            if (linkedTask) {
              markTaskLaneSessionStatus(linkedTask, session.id, 'failed');
              await updateTask(fastify.sqlite, linkedTask.id, {
                laneSessions: linkedTask.laneSessions,
                lastSyncError:
                  error instanceof Error ? error.message : String(error),
                resultSessionId: session.id,
              });
            }

            await fastify.kanbanEventService.emit({
              projectId: task.projectId,
              sessionId: session.id,
              success: false,
              taskId: task.id,
              type: 'task.session-completed',
            });
          });

        return {
          sessionId: session.id,
        };
      },
    },
    events: fastify.kanbanEventService,
    logger: fastify.log,
    sqlite: fastify.sqlite,
  });

  fastify.decorate('kanbanWorkflowOrchestrator', orchestrator);

  fastify.addHook('onReady', async () => {
    orchestrator.start();
  });

  fastify.addHook('onClose', async () => {
    orchestrator.stop();
  });
};

export default fp(kanbanWorkflowOrchestratorPlugin, {
  name: 'kanban-workflow-orchestrator',
  dependencies: ['background-worker', 'sqlite'],
});
