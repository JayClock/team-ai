export interface ActiveKanbanSessionAutomation {
  autoAdvanceOnSuccess: boolean;
  boardId: string;
  columnId: string;
  projectId: string;
  sessionId: string | null;
  taskId: string;
  taskTitle: string;
  triggerSessionId: string | null;
}

export interface QueuedKanbanSessionAutomation {
  autoAdvanceOnSuccess: boolean;
  boardId: string;
  columnId: string;
  enqueuedAt: string;
  projectId: string;
  taskId: string;
  taskTitle: string;
}

export interface KanbanSessionQueueTaskState {
  boardId: string | null;
  columnId: string | null;
  triggerSessionId: string | null;
}

export interface KanbanSessionQueueJob {
  autoAdvanceOnSuccess: boolean;
  boardId: string;
  columnId: string;
  projectId: string;
  taskId: string;
  taskTitle: string;
  getTaskState(): Promise<KanbanSessionQueueTaskState | null>;
  start(): Promise<{ error?: string; sessionId?: string | null }>;
}

interface QueueEntry extends KanbanSessionQueueJob {
  enqueuedAt: string;
  sessionId: string | null;
  status: 'queued' | 'running';
}

export interface KanbanSessionQueueService {
  completeTaskSession(
    taskId: string,
    sessionId?: string | null,
  ): Promise<ActiveKanbanSessionAutomation | null>;
  enqueue(
    job: KanbanSessionQueueJob,
  ): Promise<{ error?: string; queued: boolean; sessionId?: string }>;
  getActiveAutomations(): ActiveKanbanSessionAutomation[];
  getQueuedAutomations(): QueuedKanbanSessionAutomation[];
  invalidateTask(taskId: string): Promise<ActiveKanbanSessionAutomation | null>;
  stop(): void;
}

interface CreateKanbanSessionQueueInput {
  boardConcurrency?: number;
}

function toActiveAutomation(entry: QueueEntry): ActiveKanbanSessionAutomation {
  return {
    autoAdvanceOnSuccess: entry.autoAdvanceOnSuccess,
    boardId: entry.boardId,
    columnId: entry.columnId,
    projectId: entry.projectId,
    sessionId: entry.sessionId,
    taskId: entry.taskId,
    taskTitle: entry.taskTitle,
    triggerSessionId: entry.sessionId,
  };
}

function toQueuedAutomation(entry: QueueEntry): QueuedKanbanSessionAutomation {
  return {
    autoAdvanceOnSuccess: entry.autoAdvanceOnSuccess,
    boardId: entry.boardId,
    columnId: entry.columnId,
    enqueuedAt: entry.enqueuedAt,
    projectId: entry.projectId,
    taskId: entry.taskId,
    taskTitle: entry.taskTitle,
  };
}

export function createKanbanSessionQueueService(
  input: CreateKanbanSessionQueueInput = {},
): KanbanSessionQueueService {
  const boardConcurrency = Math.max(1, input.boardConcurrency ?? 1);
  const jobsByTaskId = new Map<string, QueueEntry>();
  const queuedByBoard = new Map<string, QueueEntry[]>();

  function countRunningForBoard(boardId: string) {
    let count = 0;
    for (const entry of jobsByTaskId.values()) {
      if (entry.boardId === boardId && entry.status === 'running') {
        count += 1;
      }
    }

    return count;
  }

  function removeQueuedEntry(boardId: string, taskId: string) {
    const queue = queuedByBoard.get(boardId);
    if (!queue) {
      return;
    }

    const nextQueue = queue.filter((entry) => entry.taskId !== taskId);
    if (nextQueue.length === 0) {
      queuedByBoard.delete(boardId);
      return;
    }

    queuedByBoard.set(boardId, nextQueue);
  }

  async function reconcileQueuedEntries(boardId: string) {
    const queue = queuedByBoard.get(boardId);
    if (!queue?.length) {
      return;
    }

    const nextQueue: QueueEntry[] = [];
    for (const entry of queue) {
      const current = jobsByTaskId.get(entry.taskId);
      if (current !== entry || current.status !== 'queued') {
        continue;
      }

      const taskState = await entry.getTaskState();
      const isStale =
        !taskState ||
        taskState.boardId !== entry.boardId ||
        taskState.columnId !== entry.columnId ||
        Boolean(taskState.triggerSessionId);
      if (isStale) {
        jobsByTaskId.delete(entry.taskId);
        continue;
      }

      nextQueue.push(entry);
    }

    if (nextQueue.length === 0) {
      queuedByBoard.delete(boardId);
      return;
    }

    queuedByBoard.set(boardId, nextQueue);
  }

  async function startEntry(entry: QueueEntry) {
    removeQueuedEntry(entry.boardId, entry.taskId);
    entry.status = 'running';

    try {
      const result = await entry.start();
      if (result.sessionId) {
        entry.sessionId = result.sessionId;
        jobsByTaskId.set(entry.taskId, entry);
        return {
          queued: false,
          sessionId: result.sessionId,
        };
      }
    } catch (error) {
      jobsByTaskId.delete(entry.taskId);
      await drainBoardQueue(entry.boardId);
      return {
        error: error instanceof Error ? error.message : String(error),
        queued: false,
      };
    }

    jobsByTaskId.delete(entry.taskId);
    await drainBoardQueue(entry.boardId);
    return {
      error: 'Failed to start Kanban task session.',
      queued: false,
    };
  }

  async function drainBoardQueue(boardId: string) {
    await reconcileQueuedEntries(boardId);

    const queue = queuedByBoard.get(boardId);
    if (!queue?.length) {
      return;
    }

    while (queue.length > 0 && countRunningForBoard(boardId) < boardConcurrency) {
      const nextEntry = queue.shift();
      if (!nextEntry) {
        break;
      }

      const taskState = await nextEntry.getTaskState();
      const isStale =
        !taskState ||
        taskState.boardId !== nextEntry.boardId ||
        taskState.columnId !== nextEntry.columnId ||
        Boolean(taskState.triggerSessionId);
      if (isStale) {
        jobsByTaskId.delete(nextEntry.taskId);
        continue;
      }

      const result = await startEntry(nextEntry);
      if (result.queued || result.sessionId) {
        continue;
      }
    }

    if (queue.length === 0) {
      queuedByBoard.delete(boardId);
    }
  }

  return {
    async completeTaskSession(taskId, sessionId) {
      const current = jobsByTaskId.get(taskId);
      if (!current || current.status !== 'running') {
        return null;
      }

      if (sessionId && current.sessionId && current.sessionId !== sessionId) {
        return null;
      }

      jobsByTaskId.delete(taskId);
      const active = toActiveAutomation(current);
      await drainBoardQueue(current.boardId);
      return active;
    },

    async enqueue(job) {
      await reconcileQueuedEntries(job.boardId);

      const existing = jobsByTaskId.get(job.taskId);
      if (existing?.status === 'running') {
        const taskState = await existing.getTaskState();
        if (taskState?.triggerSessionId) {
          return {
            queued: false,
            sessionId: taskState.triggerSessionId,
          };
        }

        jobsByTaskId.delete(job.taskId);
      }

      if (existing?.status === 'queued') {
        return {
          queued: true,
        };
      }

      const entry: QueueEntry = {
        ...job,
        enqueuedAt: new Date().toISOString(),
        sessionId: null,
        status: 'queued',
      };
      jobsByTaskId.set(job.taskId, entry);

      if (countRunningForBoard(job.boardId) >= boardConcurrency) {
        const queue = queuedByBoard.get(job.boardId) ?? [];
        queue.push(entry);
        queuedByBoard.set(job.boardId, queue);
        return {
          queued: true,
        };
      }

      return await startEntry(entry);
    },

    getActiveAutomations() {
      return Array.from(jobsByTaskId.values())
        .filter((entry) => entry.status === 'running')
        .map((entry) => toActiveAutomation(entry));
    },

    getQueuedAutomations() {
      return Array.from(queuedByBoard.values())
        .flatMap((queue) => queue)
        .map((entry) => toQueuedAutomation(entry));
    },

    async invalidateTask(taskId) {
      const current = jobsByTaskId.get(taskId);
      if (!current) {
        return null;
      }

      jobsByTaskId.delete(taskId);
      removeQueuedEntry(current.boardId, taskId);
      if (current.status === 'running') {
        await drainBoardQueue(current.boardId);
        return toActiveAutomation(current);
      }

      return null;
    },

    stop() {
      jobsByTaskId.clear();
      queuedByBoard.clear();
    },
  };
}
