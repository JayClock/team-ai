import type { KanbanBoardListPayload, KanbanBoardPayload } from '../schemas/kanban';

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

function presentBoardResource(board: KanbanBoardPayload) {
  return {
    _links: createBoardLinks(board),
    ...board,
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
