export interface TaskColumnTransitionEvent {
  boardId: string;
  fromColumnId: string | null;
  projectId: string;
  taskId: string;
  taskTitle: string;
  toColumnId: string;
  type: 'task.column-transition';
}

export interface BackgroundTaskCompletionEvent {
  backgroundTaskId: string;
  boardId?: string | null;
  projectId: string;
  sessionId: string | null;
  success: boolean;
  taskId: string;
  taskTitle?: string | null;
  type: 'background-task.completed';
}

export interface BackgroundTaskSessionStartedEvent {
  backgroundTaskId: string;
  boardId?: string | null;
  projectId: string;
  sessionId: string;
  taskId: string;
  taskTitle?: string | null;
  type: 'background-task.session-started';
}

export interface TaskSessionCompletedEvent {
  boardId?: string | null;
  projectId: string;
  sessionId: string;
  success: boolean;
  taskId: string;
  taskTitle?: string | null;
  type: 'task.session-completed';
}

export type KanbanEvent =
  | BackgroundTaskCompletionEvent
  | BackgroundTaskSessionStartedEvent
  | TaskColumnTransitionEvent
  | TaskSessionCompletedEvent;

export type KanbanEventListener = (
  event: KanbanEvent,
) => void | Promise<void>;

export interface KanbanEventService {
  emit(event: KanbanEvent): Promise<void>;
  subscribe(listener: KanbanEventListener): () => void;
}

export function createKanbanEventService(): KanbanEventService {
  const listeners = new Set<KanbanEventListener>();

  return {
    async emit(event) {
      for (const listener of listeners) {
        await listener(event);
      }
    },

    subscribe(listener) {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },
  };
}
