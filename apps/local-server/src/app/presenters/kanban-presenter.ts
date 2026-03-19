import type {
  KanbanBoardListPayload,
  KanbanBoardPayload,
  KanbanCardSummaryPayload,
  KanbanColumnPayload,
} from '../schemas/kanban';

function createBoardLinks(board: KanbanBoardPayload) {
  return {
    self: {
      href: `/api/projects/${board.projectId}/kanban/boards/${board.id}`,
    },
    collection: {
      href: `/api/projects/${board.projectId}/kanban/boards`,
    },
    project: {
      href: `/api/projects/${board.projectId}`,
    },
    tasks: {
      href: `/api/projects/${board.projectId}/tasks`,
    },
  };
}

function createCardLinks(board: KanbanBoardPayload, card: KanbanCardSummaryPayload) {
  return {
    self: {
      href: `/api/tasks/${card.id}`,
    },
    move: {
      href: `/api/tasks/${card.id}/move`,
    },
    board: {
      href: `/api/projects/${board.projectId}/kanban/boards/${board.id}`,
    },
    ...(card.executionSessionId
      ? {
          execution: {
            href: `/api/projects/${board.projectId}/acp-sessions/${card.executionSessionId}`,
          },
        }
      : {}),
    ...(card.resultSessionId
      ? {
          result: {
            href: `/api/projects/${board.projectId}/acp-sessions/${card.resultSessionId}`,
          },
        }
      : {}),
    ...(card.triggerSessionId
      ? {
          trigger: {
            href: `/api/projects/${board.projectId}/acp-sessions/${card.triggerSessionId}`,
          },
        }
      : {}),
  };
}

function presentColumn(board: KanbanBoardPayload, column: KanbanColumnPayload) {
  return {
    ...column,
    ...(column.cards
      ? {
          cards: column.cards.map((card) => ({
            _links: createCardLinks(board, card),
            ...card,
          })),
        }
      : {}),
  };
}

function presentBoardResource(board: KanbanBoardPayload) {
  return {
    _links: createBoardLinks(board),
    ...board,
    columns: board.columns.map((column) => presentColumn(board, column)),
  };
}

export function presentKanbanBoard(board: KanbanBoardPayload) {
  return presentBoardResource(board);
}

export function presentKanbanBoardList(payload: KanbanBoardListPayload) {
  return {
    _links: {
      self: {
        href: `/api/projects/${payload.projectId}/kanban/boards`,
      },
      project: {
        href: `/api/projects/${payload.projectId}`,
      },
      root: {
        href: '/api',
      },
    },
    _embedded: {
      boards: payload.items.map(presentBoardResource),
    },
    total: payload.items.length,
  };
}
